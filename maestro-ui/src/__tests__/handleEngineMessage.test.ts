import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { handleEngineMessage } from '../hooks/useCollabNotifications';
import { useCollabNotificationsStore } from '../stores/useCollabNotificationsStore';
import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { DEFAULT_NOTIFY_PREFS } from '../notifications/collabNotificationTypes';
import type { ChannelMeta } from '../notifications/CollabNotificationEngine';
import type { Message } from '../firebase/messagingTypes';
import { vi } from 'vitest';

// jsdom's default localStorage is partial in this setup; provide a full stub.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

const META: ChannelMeta = { spaceId: 'space1', spaceName: 'Space One', channelId: 'chan1', channelName: 'general' };

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm1', spaceId: 'space1', channelId: 'chan1',
    authorUid: 'other', authorDisplayName: 'Other', authorPhotoUrl: null,
    content: 'hello', createdAt: Timestamp.fromMillis(Date.now()),
    editedAt: null, deletedAt: null, threadId: null, replyCount: 0,
    mentions: [], attachments: [], clientMsgId: null,
    ...over,
  };
}

const s = () => useCollabNotificationsStore.getState();

beforeEach(() => {
  localStorage.clear();
  useFirebaseAuthStore.setState({ user: { uid: 'me' } as any });
  useCollabNotificationsStore.setState({
    prefs: { ...DEFAULT_NOTIFY_PREFS },
    inbox: [], toasts: [], unreadByChannel: {}, lastReadByChannel: {},
    focusedChannelId: null, windowVisible: true,
  });
});

describe('handleEngineMessage (engine → store bridge)', () => {
  it('does nothing when signed out', () => {
    useFirebaseAuthStore.setState({ user: null });
    handleEngineMessage(msg(), META);
    expect(s().inbox).toHaveLength(0);
  });

  it("level 'all': a peer message toasts and bumps unread", () => {
    handleEngineMessage(msg(), META);
    expect(s().inbox).toHaveLength(1);
    expect(s().toasts).toHaveLength(1);
    expect(s().unreadByChannel.chan1).toBe(1);
  });

  it('a mention is flagged as such in the inbox entry', () => {
    handleEngineMessage(msg({ mentions: [{ id: 'me', displayName: 'Me', kind: 'member' }] }), META);
    expect(s().inbox[0].isMention).toBe(true);
  });

  it("level 'mentions': a non-mention bumps unread but does not toast", () => {
    s().setLevel('mentions');
    handleEngineMessage(msg(), META);
    expect(s().toasts).toHaveLength(0);
    expect(s().unreadByChannel.chan1).toBe(1);
  });

  it('ignores my own message', () => {
    handleEngineMessage(msg({ authorUid: 'me' }), META);
    expect(s().inbox).toHaveLength(0);
    expect(s().unreadByChannel.chan1).toBeUndefined();
  });

  it('a muted channel is fully silent', () => {
    s().toggleChannelMuted('chan1');
    handleEngineMessage(msg(), META);
    expect(s().inbox).toHaveLength(0);
    expect(s().unreadByChannel.chan1).toBeUndefined();
  });

  it('a message in the focused channel is marked read, not toasted', () => {
    useCollabNotificationsStore.setState({ focusedChannelId: 'chan1', windowVisible: true });
    handleEngineMessage(msg(), META);
    expect(s().toasts).toHaveLength(0);
    expect(s().unreadByChannel.chan1).toBeUndefined();
    expect(typeof s().lastReadByChannel.chan1).toBe('number');
  });

  it('builds an id namespaced by the message id (idempotent surface)', () => {
    handleEngineMessage(msg({ id: 'abc' }), META);
    expect(s().inbox[0].id).toBe('cn_abc');
  });
});
