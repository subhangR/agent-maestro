import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCollabNotificationsStore } from '../stores/useCollabNotificationsStore';
import { DEFAULT_NOTIFY_PREFS, type CollabNotification } from '../notifications/collabNotificationTypes';

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

function notif(over: Partial<CollabNotification> = {}): CollabNotification {
  return {
    id: `cn_${Math.random().toString(36).slice(2)}`,
    spaceId: 'space1',
    spaceName: 'Space One',
    channelId: 'chan1',
    channelName: 'general',
    messageId: 'm1',
    authorUid: 'other',
    authorName: 'Other',
    preview: 'hi',
    isMention: false,
    timestamp: Date.now(),
    read: false,
    ...over,
  };
}

const s = () => useCollabNotificationsStore.getState();

beforeEach(() => {
  localStorage.clear();
  useCollabNotificationsStore.setState({
    prefs: { ...DEFAULT_NOTIFY_PREFS },
    inbox: [],
    toasts: [],
    unreadByChannel: {},
    lastReadByChannel: {},
    focusedChannelId: null,
    windowVisible: true,
  });
});

describe('useCollabNotificationsStore', () => {
  it('recordActivity increments per-channel unread and persists', () => {
    s().recordActivity('chan1');
    s().recordActivity('chan1');
    s().recordActivity('chan2');
    expect(s().unreadByChannel).toEqual({ chan1: 2, chan2: 1 });
    expect(JSON.parse(localStorage.getItem('maestro.collabNotify.unreadByChannel')!)).toEqual({ chan1: 2, chan2: 1 });
  });

  it('notify adds to inbox (newest first) and toasts, persisting inbox', () => {
    const a = notif({ id: 'a' });
    const b = notif({ id: 'b' });
    s().notify(a);
    s().notify(b);
    expect(s().inbox.map((n) => n.id)).toEqual(['b', 'a']);
    expect(s().toasts.map((n) => n.id)).toEqual(['a', 'b']);
    expect(JSON.parse(localStorage.getItem('maestro.collabNotify.inbox')!)).toHaveLength(2);
  });

  it('caps the visible toast stack at 4', () => {
    for (let i = 0; i < 6; i++) s().notify(notif({ id: `t${i}` }));
    expect(s().toasts).toHaveLength(4);
    expect(s().toasts.map((n) => n.id)).toEqual(['t2', 't3', 't4', 't5']);
    expect(s().inbox).toHaveLength(6);
  });

  it('markChannelRead clears that channel unread and marks its inbox rows read', () => {
    s().recordActivity('chan1');
    s().notify(notif({ id: 'x', channelId: 'chan1' }));
    s().notify(notif({ id: 'y', channelId: 'chan2' }));
    s().markChannelRead('chan1');
    expect(s().unreadByChannel.chan1).toBeUndefined();
    expect(s().inbox.find((n) => n.id === 'x')!.read).toBe(true);
    expect(s().inbox.find((n) => n.id === 'y')!.read).toBe(false);
    expect(typeof s().lastReadByChannel.chan1).toBe('number');
  });

  it('markAllRead marks every inbox row read and clears all unread', () => {
    s().recordActivity('chan1');
    s().notify(notif({ id: 'x' }));
    s().markAllRead();
    expect(s().inbox.every((n) => n.read)).toBe(true);
    expect(s().unreadByChannel).toEqual({});
  });

  it('toggles space and channel mutes and persists prefs', () => {
    s().toggleSpaceMuted('space1');
    s().toggleChannelMuted('chan9');
    expect(s().prefs.mutedSpaceIds).toContain('space1');
    expect(s().prefs.mutedChannelIds).toContain('chan9');
    s().toggleSpaceMuted('space1');
    expect(s().prefs.mutedSpaceIds).not.toContain('space1');
    const persisted = JSON.parse(localStorage.getItem('maestro.collabNotify.prefs')!);
    expect(persisted.mutedChannelIds).toContain('chan9');
  });

  it('setLevel and setDesktopEnabled persist', () => {
    s().setLevel('mentions');
    s().setDesktopEnabled(true);
    expect(s().prefs.level).toBe('mentions');
    expect(s().prefs.desktopEnabled).toBe(true);
    expect(JSON.parse(localStorage.getItem('maestro.collabNotify.prefs')!).level).toBe('mentions');
  });

  it('clearInbox empties inbox and toasts', () => {
    s().notify(notif());
    s().clearInbox();
    expect(s().inbox).toHaveLength(0);
    expect(s().toasts).toHaveLength(0);
  });

  it('resetLiveState clears live state but keeps prefs', () => {
    s().setLevel('mentions');
    s().notify(notif());
    s().recordActivity('chan1');
    s().resetLiveState();
    expect(s().inbox).toHaveLength(0);
    expect(s().unreadByChannel).toEqual({});
    expect(s().prefs.level).toBe('mentions');
  });
});
