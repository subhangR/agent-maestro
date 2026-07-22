import { create } from 'zustand';
import {
  CollabNotification,
  NotifyLevel,
  NotifyPrefs,
  DEFAULT_NOTIFY_PREFS,
} from '../notifications/collabNotificationTypes';

/**
 * Phase 1 collab-notifications state.
 *
 * Presentation + persistence only — classification lives in
 * `collabNotificationTypes.ts`, subscriptions in `CollabNotificationEngine`.
 * State is persisted manually to localStorage (matching the codebase's
 * `useGitSettingsStore` convention) so prefs, inbox history, and unread badges
 * survive reloads. Toasts and transient focus/visibility are in-memory only.
 *
 * When Phase 2 lands, prefs + read-state move to Firestore
 * (`notificationProfiles/{uid}`, `collabSpaces/{s}/readState/{uid}`) so the
 * Cloud Function can honor them server-side; this store becomes the local cache.
 */

/** Inbox history is bounded — the bell surface reads it. */
const INBOX_CAP = 100;
/** At most this many toasts stacked at once; older ones drop first. */
const TOAST_CAP = 4;

const LS = {
  prefs: 'maestro.collabNotify.prefs',
  inbox: 'maestro.collabNotify.inbox',
  unread: 'maestro.collabNotify.unreadByChannel',
  lastRead: 'maestro.collabNotify.lastReadByChannel',
} as const;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readRecord(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort; localStorage may be unavailable (private mode / tests)
  }
}

interface CollabNotificationsState {
  prefs: NotifyPrefs;
  /** Delivered notifications, newest first, capped at INBOX_CAP. */
  inbox: CollabNotification[];
  /** Currently-visible toasts (subset of inbox), oldest first. */
  toasts: CollabNotification[];
  /** Per-channel unread counter (activity in non-muted channels). */
  unreadByChannel: Record<string, number>;
  /** Per-channel last-read epoch ms (drives "since" for badge clearing). */
  lastReadByChannel: Record<string, number>;

  // Transient (in-memory) routing signals set by the wiring hook.
  focusedChannelId: string | null;
  windowVisible: boolean;

  // ── engine → store ──
  /** A tracked message bumped this channel's unread badge. */
  recordActivity: (channelId: string) => void;
  /** A message worth surfacing: adds a toast + inbox entry. */
  notify: (n: CollabNotification) => void;
  /** Sync durable inbox records without replaying a toast flood on startup. */
  hydrateInbox: (inbox: CollabNotification[]) => void;
  /** Merge a durable inbox update, optionally showing one in-app toast. */
  mergeNotification: (n: CollabNotification, showToast: boolean) => void;

  // ── UI → store ──
  dismissToast: (id: string) => void;
  markNotificationItemRead: (id: string) => void;
  markChannelRead: (channelId: string) => void;
  markAllRead: () => void;
  clearInbox: () => void;

  setLevel: (level: NotifyLevel) => void;
  setDesktopEnabled: (enabled: boolean) => void;
  toggleSpaceMuted: (spaceId: string) => void;
  toggleChannelMuted: (channelId: string) => void;
  /** Applies the signed-in user's Firestore-backed profile. */
  setPrefsFromRemote: (prefs: NotifyPrefs) => void;

  setFocusedChannel: (channelId: string | null) => void;
  setWindowVisible: (visible: boolean) => void;

  /** Sign-out / uid-change reset (keeps persisted prefs, clears live state). */
  resetLiveState: () => void;
}

export const useCollabNotificationsStore = create<CollabNotificationsState>((set, get) => ({
  prefs: readJSON<NotifyPrefs>(LS.prefs, DEFAULT_NOTIFY_PREFS),
  inbox: readArray<CollabNotification>(LS.inbox),
  toasts: [],
  unreadByChannel: readRecord(LS.unread),
  lastReadByChannel: readRecord(LS.lastRead),
  focusedChannelId: null,
  windowVisible: true,

  recordActivity: (channelId) => {
    set((s) => {
      const next = { ...s.unreadByChannel, [channelId]: (s.unreadByChannel[channelId] ?? 0) + 1 };
      write(LS.unread, next);
      return { unreadByChannel: next };
    });
  },

  mergeNotification: (n, showToast) => {
    set((s) => {
      const existing = s.inbox.find((item) => item.id === n.id);
      const inbox = existing
        ? s.inbox.map((item) => (item.id === n.id ? { ...item, ...n } : item))
        : [n, ...s.inbox].slice(0, INBOX_CAP);
      // The foreground engine and the durable inbox listener can observe the
      // same message in either order. The id guard keeps that one message to
      // one toast, while later read-state updates still merge into the inbox.
      const toasts = showToast && !s.toasts.some((item) => item.id === n.id)
        ? [...s.toasts, n].slice(-TOAST_CAP)
        : s.toasts;
      write(LS.inbox, inbox);
      return { inbox, toasts };
    });
  },

  notify: (n) => get().mergeNotification(n, true),

  hydrateInbox: (inbox) => {
    const normalized = [...inbox]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, INBOX_CAP);
    write(LS.inbox, normalized);
    set({ inbox: normalized });
  },

  dismissToast: (id) => {
    set((s) => {
      if (!s.toasts.some((t) => t.id === id)) return s;
      return { toasts: s.toasts.filter((t) => t.id !== id) };
    });
  },

  markNotificationItemRead: (id) => {
    set((s) => {
      const inbox = s.inbox.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n));
      write(LS.inbox, inbox);
      return { inbox };
    });
  },

  markChannelRead: (channelId) => {
    set((s) => {
      const unreadByChannel = { ...s.unreadByChannel };
      delete unreadByChannel[channelId];
      const lastReadByChannel = { ...s.lastReadByChannel, [channelId]: Date.now() };
      const inbox = s.inbox.map((n) => (n.channelId === channelId && !n.read ? { ...n, read: true } : n));
      write(LS.unread, unreadByChannel);
      write(LS.lastRead, lastReadByChannel);
      write(LS.inbox, inbox);
      return { unreadByChannel, lastReadByChannel, inbox };
    });
  },

  markAllRead: () => {
    set((s) => {
      const inbox = s.inbox.map((n) => (n.read ? n : { ...n, read: true }));
      write(LS.inbox, inbox);
      write(LS.unread, {});
      return { inbox, unreadByChannel: {} };
    });
  },

  clearInbox: () => {
    write(LS.inbox, []);
    set({ inbox: [], toasts: [] });
  },

  setLevel: (level) => {
    set((s) => {
      const prefs = { ...s.prefs, level };
      write(LS.prefs, prefs);
      return { prefs };
    });
  },

  setDesktopEnabled: (enabled) => {
    set((s) => {
      const prefs = { ...s.prefs, desktopEnabled: enabled };
      write(LS.prefs, prefs);
      return { prefs };
    });
  },

  toggleSpaceMuted: (spaceId) => {
    set((s) => {
      const muted = new Set(s.prefs.mutedSpaceIds);
      muted.has(spaceId) ? muted.delete(spaceId) : muted.add(spaceId);
      const prefs = { ...s.prefs, mutedSpaceIds: [...muted] };
      write(LS.prefs, prefs);
      return { prefs };
    });
  },

  toggleChannelMuted: (channelId) => {
    set((s) => {
      const muted = new Set(s.prefs.mutedChannelIds);
      muted.has(channelId) ? muted.delete(channelId) : muted.add(channelId);
      const prefs = { ...s.prefs, mutedChannelIds: [...muted] };
      write(LS.prefs, prefs);
      return { prefs };
    });
  },

  setPrefsFromRemote: (prefs) => {
    write(LS.prefs, prefs);
    set({ prefs });
  },

  setFocusedChannel: (channelId) => set({ focusedChannelId: channelId }),
  setWindowVisible: (visible) => set({ windowVisible: visible }),

  resetLiveState: () => {
    write(LS.inbox, []);
    write(LS.unread, {});
    set({ inbox: [], toasts: [], unreadByChannel: {}, focusedChannelId: null });
  },
}));

/** Unread inbox count for the bell badge (delivered notifications only). */
export function useUnreadCollabNotificationCount(): number {
  return useCollabNotificationsStore((s) => s.inbox.reduce((n, x) => n + (x.read ? 0 : 1), 0));
}

/** Unread activity count for a single channel's badge. */
export function useChannelUnread(channelId: string | null): number {
  return useCollabNotificationsStore((s) => (channelId ? s.unreadByChannel[channelId] ?? 0 : 0));
}
