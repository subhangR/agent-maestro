import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  CollabNotificationEngine,
  type ChannelMeta,
} from '../notifications/CollabNotificationEngine';
import type { CollabSpace } from '../firebase/collabSpaceTypes';
import type { Channel, Message } from '../firebase/messagingTypes';

function space(id: string, name: string): CollabSpace {
  return { id, name } as CollabSpace;
}
function channel(id: string, name: string): Channel {
  return { id, name } as Channel;
}
function message(id: string, spaceId: string, channelId: string, createdMs: number): Message {
  return {
    id, spaceId, channelId,
    authorUid: 'other', authorDisplayName: 'Other', authorPhotoUrl: null,
    content: 'hi', createdAt: Timestamp.fromMillis(createdMs),
    editedAt: null, deletedAt: null, threadId: null, replyCount: 0,
    mentions: [], attachments: [], clientMsgId: null,
  };
}

/** Builds an engine wired to controllable fakes. Clock is fixed at 1000ms. */
function harness() {
  const NOW = 1000;
  let spacesCb: ((s: CollabSpace[]) => void) | null = null;
  const spacesUnsub = vi.fn();
  const channelCbs: Record<string, (c: Channel[]) => void> = {};
  const channelUnsubs: Record<string, ReturnType<typeof vi.fn>> = {};
  const msgCbs: Record<string, (m: Message) => void> = {};
  const msgUnsubs: Record<string, ReturnType<typeof vi.fn>> = {};
  const received: Array<{ message: Message; meta: ChannelMeta }> = [];

  const engine = new CollabNotificationEngine({
    now: () => NOW,
    subscribeToAllSpaces: (_uid, cb) => {
      spacesCb = cb;
      return spacesUnsub;
    },
    subscribeToChannels: (spaceId, cb) => {
      channelCbs[spaceId] = cb;
      const u = vi.fn();
      channelUnsubs[spaceId] = u;
      return u;
    },
    subscribeToNewMessages: (spaceId, channelId, since, cb) => {
      const key = `${spaceId}:${channelId}`;
      msgCbs[key] = cb;
      const u = vi.fn();
      msgUnsubs[key] = u;
      // Stash the since for assertions.
      (u as any).since = since;
      return u;
    },
    onNewMessage: (message, meta) => received.push({ message, meta }),
  });

  return {
    engine, NOW, spacesUnsub, channelUnsubs, msgUnsubs, received,
    emitSpaces: (s: CollabSpace[]) => spacesCb!(s),
    emitChannels: (spaceId: string, c: Channel[]) => channelCbs[spaceId]?.(c),
    emitMessage: (spaceId: string, channelId: string, m: Message) => msgCbs[`${spaceId}:${channelId}`]?.(m),
    msgUnsub: (spaceId: string, channelId: string) => msgUnsubs[`${spaceId}:${channelId}`],
  };
}

describe('CollabNotificationEngine', () => {
  it('subscribes to all spaces on start and reports running', () => {
    const h = harness();
    expect(h.engine.isRunning()).toBe(false);
    h.engine.start('me');
    expect(h.engine.isRunning()).toBe(true);
  });

  it('subscribes to channels for each space, then messages for each channel, with since=start', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    const u = h.msgUnsub('A', 'c1');
    expect(u).toBeTruthy();
    expect((u as any).since.toMillis()).toBe(h.NOW);
  });

  it('surfaces a new message with resolved space + channel names', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    h.emitMessage('A', 'c1', message('m1', 'A', 'c1', h.NOW + 5));
    expect(h.received).toHaveLength(1);
    expect(h.received[0].meta).toMatchObject({
      spaceId: 'A', spaceName: 'Alpha', channelId: 'c1', channelName: 'general',
    });
  });

  it('de-duplicates a repeated message id', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    const m = message('dup', 'A', 'c1', h.NOW + 5);
    h.emitMessage('A', 'c1', m);
    h.emitMessage('A', 'c1', m);
    expect(h.received).toHaveLength(1);
  });

  it('ignores a message created before the engine started', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    h.emitMessage('A', 'c1', message('old', 'A', 'c1', h.NOW - 10));
    expect(h.received).toHaveLength(0);
  });

  it('tears down a channel message-sub when the channel disappears', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    const u = h.msgUnsub('A', 'c1');
    h.emitChannels('A', []); // channel removed
    expect(u).toHaveBeenCalledTimes(1);
  });

  it('tears down channels + messages when a space is left', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    const msgU = h.msgUnsub('A', 'c1');
    h.emitSpaces([]); // left the space
    expect(h.channelUnsubs['A']).toHaveBeenCalledTimes(1);
    expect(msgU).toHaveBeenCalledTimes(1);
  });

  it('stop() unsubscribes everything and marks not running', () => {
    const h = harness();
    h.engine.start('me');
    h.emitSpaces([space('A', 'Alpha')]);
    h.emitChannels('A', [channel('c1', 'general')]);
    const msgU = h.msgUnsub('A', 'c1');
    h.engine.stop();
    expect(h.spacesUnsub).toHaveBeenCalled();
    expect(h.channelUnsubs['A']).toHaveBeenCalled();
    expect(msgU).toHaveBeenCalled();
    expect(h.engine.isRunning()).toBe(false);
  });
});
