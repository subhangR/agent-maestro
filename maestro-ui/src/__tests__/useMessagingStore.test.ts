import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';
import { MessagingClient } from '../firebase/MessagingClient';
import { useMessagingStore } from '../stores/useMessagingStore';
import type { Message } from '../firebase/messagingTypes';

vi.mock('../firebase/MessagingClient', () => ({
  MessagingClient: {
    subscribeToChannels: vi.fn(),
    subscribeToMessages: vi.fn(),
    loadOlderMessages: vi.fn(),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    softDeleteMessage: vi.fn(),
    createChannel: vi.fn(),
  },
}));

const user = {
  uid: 'u1',
  displayName: 'User One',
  email: 'u1@example.com',
  photoURL: null,
} as unknown as User;

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as Timestamp;

const makeMessage = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    spaceId: 'space1',
    channelId: 'chan1',
    authorUid: 'u1',
    authorDisplayName: 'User One',
    authorPhotoUrl: null,
    content: 'hello',
    createdAt: ts(1000),
    editedAt: null,
    deletedAt: null,
    threadId: null,
    replyCount: 0,
    mentions: [],
    attachments: [],
    clientMsgId: null,
    ...overrides,
  }) as Message;

type MessagesCb = (
  messages: Message[],
  oldest: QueryDocumentSnapshot | null,
  hasMore: boolean,
) => void;

// Captured per test from the subscribeToMessages mock.
let liveCb: MessagesCb | null = null;
let liveOnError: ((err: Error) => void) | null = null;

const initialState = useMessagingStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useMessagingStore.setState(initialState, true);
  liveCb = null;
  liveOnError = null;
  vi.mocked(MessagingClient.subscribeToMessages).mockImplementation((_s, _c, cb, opts) => {
    liveCb = cb;
    liveOnError = opts?.onError ?? null;
    return vi.fn();
  });
  vi.mocked(MessagingClient.subscribeToChannels).mockReturnValue(vi.fn());
  vi.mocked(MessagingClient.sendMessage).mockImplementation(
    async (_u, spaceId, channelId, content, mentions = [], opts) =>
      makeMessage({
        id: `srv_${opts?.clientMsgId ?? 'none'}`,
        spaceId,
        channelId,
        content,
        mentions,
        clientMsgId: opts?.clientMsgId ?? null,
      }),
  );
});

const store = () => useMessagingStore.getState();

describe('useMessagingStore — optimistic send + reconciliation', () => {
  it('adds a pending entry immediately, then reconciliation removes it when the live message with the matching clientMsgId arrives', async () => {
    store().subscribeToMessages('space1', 'chan1');
    expect(liveCb).toBeTruthy();

    const sendPromise = store().sendMessage(user, 'space1', 'chan1', '  hello  ');

    // Pending entry appears synchronously with trimmed content.
    let pending = store().pendingByChannel['chan1'];
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('sending');
    expect(pending[0].content).toBe('hello');
    expect(store().sending['chan1']).toBe(true);
    const tempId = pending[0].tempId;

    await sendPromise;
    expect(store().sending['chan1']).toBe(false);

    // The write carried the pending tempId as clientMsgId.
    expect(MessagingClient.sendMessage).toHaveBeenCalledWith(
      user,
      'space1',
      'chan1',
      'hello',
      [],
      expect.objectContaining({ clientMsgId: tempId }),
    );

    // Pending survives until the subscription confirms delivery.
    expect(store().pendingByChannel['chan1']).toHaveLength(1);

    // Live snapshot arrives with the confirmed message → pending reconciled away.
    const confirmed = makeMessage({ id: 'srv_1', clientMsgId: tempId, content: 'hello' });
    liveCb!([confirmed], null, false);

    expect(store().pendingByChannel['chan1']).toHaveLength(0);
    expect(store().messagesByChannel['chan1']).toEqual([confirmed]);
  });

  it('does not reconcile a pending entry against an unrelated clientMsgId', async () => {
    store().subscribeToMessages('space1', 'chan1');
    await store().sendMessage(user, 'space1', 'chan1', 'mine');

    liveCb!([makeMessage({ id: 'other', clientMsgId: 'someone-elses', content: 'theirs', authorUid: 'u2' })], null, false);

    expect(store().pendingByChannel['chan1']).toHaveLength(1);
  });

  it('ignores empty messages', async () => {
    await store().sendMessage(user, 'space1', 'chan1', '   ');
    expect(MessagingClient.sendMessage).not.toHaveBeenCalled();
    expect(store().pendingByChannel['chan1']).toBeUndefined();
  });
});

describe('useMessagingStore — failure + retry', () => {
  it('marks the pending entry failed when the send rejects, and retryPending resends with the SAME clientMsgId', async () => {
    store().subscribeToMessages('space1', 'chan1');
    vi.mocked(MessagingClient.sendMessage).mockRejectedValueOnce(new Error('network down'));

    await store().sendMessage(user, 'space1', 'chan1', 'flaky');

    let pending = store().pendingByChannel['chan1'];
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('failed');
    expect(pending[0].error).toBe('network down');
    const tempId = pending[0].tempId;

    // Retry succeeds (mock default impl resolves).
    await store().retryPending(user, 'space1', 'chan1', tempId);

    expect(MessagingClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(MessagingClient.sendMessage).mock.calls[1][5]).toEqual(
      expect.objectContaining({ clientMsgId: tempId }),
    );
    pending = store().pendingByChannel['chan1'];
    expect(pending[0].status).toBe('sending');
    expect(pending[0].error).toBeUndefined();
  });

  it('a failed retry marks the entry failed again', async () => {
    vi.mocked(MessagingClient.sendMessage)
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'));

    await store().sendMessage(user, 'space1', 'chan1', 'flaky');
    const tempId = store().pendingByChannel['chan1'][0].tempId;

    await store().retryPending(user, 'space1', 'chan1', tempId);

    const pending = store().pendingByChannel['chan1'];
    expect(pending[0].status).toBe('failed');
    expect(pending[0].error).toBe('second');
  });

  it('dismissPending removes the entry', async () => {
    vi.mocked(MessagingClient.sendMessage).mockRejectedValueOnce(new Error('nope'));
    await store().sendMessage(user, 'space1', 'chan1', 'flaky');
    const tempId = store().pendingByChannel['chan1'][0].tempId;

    store().dismissPending('chan1', tempId);
    expect(store().pendingByChannel['chan1']).toHaveLength(0);
  });
});

describe('useMessagingStore — subscriptions', () => {
  it('subscription onError sets messagesError and clears loading', () => {
    store().subscribeToMessages('space1', 'chan1');
    expect(store().messagesLoading['chan1']).toBe(true);

    liveOnError!(new Error('boom'));

    expect(store().messagesError['chan1']).toBe('boom');
    expect(store().messagesLoading['chan1']).toBe(false);
  });

  it('does not double-subscribe the same channel', () => {
    store().subscribeToMessages('space1', 'chan1');
    store().subscribeToMessages('space1', 'chan1');
    expect(MessagingClient.subscribeToMessages).toHaveBeenCalledTimes(1);
  });

  it('unsubscribeAll calls every unsub and resets state', async () => {
    const channelUnsub = vi.fn();
    const messageUnsubA = vi.fn();
    const messageUnsubB = vi.fn();
    vi.mocked(MessagingClient.subscribeToChannels).mockReturnValue(channelUnsub);
    vi.mocked(MessagingClient.subscribeToMessages)
      .mockReturnValueOnce(messageUnsubA)
      .mockReturnValueOnce(messageUnsubB);

    store().subscribeToChannels('space1');
    store().subscribeToMessages('space1', 'chan1');
    store().subscribeToMessages('space1', 'chan2');
    await store().sendMessage(user, 'space1', 'chan1', 'lingering');
    store().selectChannel('space1', 'chan1');

    store().unsubscribeAll();

    expect(channelUnsub).toHaveBeenCalledTimes(1);
    expect(messageUnsubA).toHaveBeenCalledTimes(1);
    expect(messageUnsubB).toHaveBeenCalledTimes(1);

    const s = store();
    expect(s.channelSubs).toEqual({});
    expect(s.messageSubs).toEqual({});
    expect(s.channelsBySpace).toEqual({});
    expect(s.messagesByChannel).toEqual({});
    expect(s.pendingByChannel).toEqual({});
    expect(s.activeChannelBySpace).toEqual({});
    expect(s.sending).toEqual({});
    expect(s.creatingChannel).toBe(false);
    expect(s.channelActionError).toBeNull();
  });
});
