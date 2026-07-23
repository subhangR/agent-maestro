// src/state/collab/notificationsStore.ts
//
// Zustand store for collab notifications — mobile port of
// maestro-ui/src/stores/useCollabNotificationsStore.ts.
//
// Responsibilities:
//   - Unread counts per channel (badge sources).
//   - Unread counts per space (derived from channel counts).
//   - A bounded recent-notifications inbox (cap 50 on mobile vs 100 on desktop).
//   - A small transient toasts list consumed by NotificationToaster.
//   - Persisting last-read markers and inbox to MMKV (same StateStorage seam
//     used by prefsStore) so badges survive app restarts.
//   - `ingest(n)` — the single entry-point the FCM handler and the engine use.
//
// NOT in this store: classification logic (lives in notifications/types.ts),
// Firestore subscriptions (lives in CollabNotificationEngine), push registration
// (lives in notifications/fcm.ts).

import { create } from 'zustand';
import {
  type CollabNotification,
  type NotifyLevel,
  type NotifyPrefs,
  DEFAULT_NOTIFY_PREFS,
} from '@/services/collab/notifications/types';
import { resolveDefaultStorage, type StateStorage } from '../storage';

// ── Caps ─────────────────────────────────────────────────────────────────────

const INBOX_CAP = 50;
const TOAST_CAP = 3;

// ── MMKV persistence (same pattern as prefsStore) ────────────────────────────

const STORAGE_ID = 'maestro-collab-notifications';

const KEY_PREFS = 'prefs';
const KEY_INBOX = 'inbox';
const KEY_UNREAD = 'unreadByChannel';
const KEY_LAST_READ = 'lastReadByChannel';

let storage: StateStorage = resolveDefaultStorage(STORAGE_ID);

/** Test seam. */
export function __setNotificationsStorage(next: StateStorage): void {
  storage = next;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getString(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return fallback;
    }
    return { ...fallback, ...(parsed as object) } as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = storage.getString(key);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readRecord(key: string): Record<string, number> {
  try {
    const raw = storage.getString(key);
    if (raw == null) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function write(key: string, value: unknown): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    // best-effort; storage may be unavailable
  }
}

// ── Store shape ───────────────────────────────────────────────────────────────

export interface CollabNotificationsState {
  prefs: NotifyPrefs;
  /** Delivered notifications, newest first, capped at INBOX_CAP. */
  inbox: CollabNotification[];
  /** Transient toasts (subset of inbox), oldest first. Auto-cleared by Toaster. */
  toasts: CollabNotification[];
  /** Per-channel unread counter (activity in non-muted channels). */
  unreadByChannel: Record<string, number>;
  /** Per-channel last-read epoch ms (drives badge clearing). */
  lastReadByChannel: Record<string, number>;

  // Transient routing signals (in-memory, set by the active screen).
  focusedChannelId: string | null;
  appForegrounded: boolean;

  // ── Engine / FCM → store ──────────────────────────────────────────────────
  /** Ingest a new notification from the engine or FCM handler. */
  ingest: (n: CollabNotification) => void;
  /** Bump the unread badge for a channel without surfacing a toast. */
  recordActivity: (channelId: string) => void;
  /** Sync durable inbox records on cold boot without replaying toasts. */
  hydrateInbox: (inbox: CollabNotification[]) => void;

  // ── UI → store ────────────────────────────────────────────────────────────
  dismissToast: (id: string) => void;
  markNotificationRead: (id: string) => void;
  markChannelRead: (spaceId: string, channelId: string) => void;
  markAllRead: () => void;
  clearInbox: () => void;

  setLevel: (level: NotifyLevel) => void;
  setPushEnabled: (enabled: boolean) => void;
  toggleSpaceMuted: (spaceId: string) => void;
  toggleChannelMuted: (channelId: string) => void;

  setFocusedChannel: (channelId: string | null) => void;
  setAppForegrounded: (foregrounded: boolean) => void;

  /** Sign-out reset — clears live state, keeps persisted prefs. */
  resetLiveState: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCollabNotificationsStore = create<CollabNotificationsState>(
  (set, get) => ({
    prefs: readJSON<NotifyPrefs>(KEY_PREFS, DEFAULT_NOTIFY_PREFS),
    inbox: readArray<CollabNotification>(KEY_INBOX),
    toasts: [],
    unreadByChannel: readRecord(KEY_UNREAD),
    lastReadByChannel: readRecord(KEY_LAST_READ),
    focusedChannelId: null,
    appForegrounded: true,

    ingest: (n) => {
      set((s) => {
        // De-duplicate: if the id already exists just update it, no new toast.
        const existing = s.inbox.find((item) => item.id === n.id);
        const inbox = existing
          ? s.inbox.map((item) => (item.id === n.id ? { ...item, ...n } : item))
          : [n, ...s.inbox].slice(0, INBOX_CAP);
        const toasts =
          !existing && !s.toasts.some((t) => t.id === n.id)
            ? [...s.toasts, n].slice(-TOAST_CAP)
            : s.toasts;
        // Also bump the unread badge.
        const unreadByChannel = {
          ...s.unreadByChannel,
          [n.channelId]: (s.unreadByChannel[n.channelId] ?? 0) + (existing ? 0 : 1),
        };
        write(KEY_INBOX, inbox);
        write(KEY_UNREAD, unreadByChannel);
        return { inbox, toasts, unreadByChannel };
      });
    },

    recordActivity: (channelId) => {
      set((s) => {
        const unreadByChannel = {
          ...s.unreadByChannel,
          [channelId]: (s.unreadByChannel[channelId] ?? 0) + 1,
        };
        write(KEY_UNREAD, unreadByChannel);
        return { unreadByChannel };
      });
    },

    hydrateInbox: (inbox) => {
      const normalized = [...inbox]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, INBOX_CAP);
      write(KEY_INBOX, normalized);
      set({ inbox: normalized });
    },

    dismissToast: (id) => {
      set((s) => {
        if (!s.toasts.some((t) => t.id === id)) return s;
        return { toasts: s.toasts.filter((t) => t.id !== id) };
      });
    },

    markNotificationRead: (id) => {
      set((s) => {
        const inbox = s.inbox.map((n) =>
          n.id === id && !n.read ? { ...n, read: true } : n,
        );
        write(KEY_INBOX, inbox);
        return { inbox };
      });
    },

    markChannelRead: (_spaceId, channelId) => {
      set((s) => {
        const unreadByChannel = { ...s.unreadByChannel };
        delete unreadByChannel[channelId];
        const lastReadByChannel = {
          ...s.lastReadByChannel,
          [channelId]: Date.now(),
        };
        const inbox = s.inbox.map((n) =>
          n.channelId === channelId && !n.read ? { ...n, read: true } : n,
        );
        write(KEY_UNREAD, unreadByChannel);
        write(KEY_LAST_READ, lastReadByChannel);
        write(KEY_INBOX, inbox);
        return { unreadByChannel, lastReadByChannel, inbox };
      });
    },

    markAllRead: () => {
      set((s) => {
        const inbox = s.inbox.map((n) => (n.read ? n : { ...n, read: true }));
        write(KEY_INBOX, inbox);
        write(KEY_UNREAD, {});
        return { inbox, unreadByChannel: {} };
      });
    },

    clearInbox: () => {
      write(KEY_INBOX, []);
      write(KEY_UNREAD, {});
      set({ inbox: [], toasts: [], unreadByChannel: {} });
    },

    setLevel: (level) => {
      set((s) => {
        const prefs = { ...s.prefs, level };
        write(KEY_PREFS, prefs);
        return { prefs };
      });
    },

    setPushEnabled: (enabled) => {
      set((s) => {
        const prefs = { ...s.prefs, pushEnabled: enabled };
        write(KEY_PREFS, prefs);
        return { prefs };
      });
    },

    toggleSpaceMuted: (spaceId) => {
      set((s) => {
        const muted = new Set(s.prefs.mutedSpaceIds);
        muted.has(spaceId) ? muted.delete(spaceId) : muted.add(spaceId);
        const prefs = { ...s.prefs, mutedSpaceIds: [...muted] };
        write(KEY_PREFS, prefs);
        return { prefs };
      });
    },

    toggleChannelMuted: (channelId) => {
      set((s) => {
        const muted = new Set(s.prefs.mutedChannelIds);
        muted.has(channelId) ? muted.delete(channelId) : muted.add(channelId);
        const prefs = { ...s.prefs, mutedChannelIds: [...muted] };
        write(KEY_PREFS, prefs);
        return { prefs };
      });
    },

    setFocusedChannel: (channelId) => set({ focusedChannelId: channelId }),
    setAppForegrounded: (foregrounded) => set({ appForegrounded: foregrounded }),

    resetLiveState: () => {
      write(KEY_INBOX, []);
      write(KEY_UNREAD, {});
      set({
        inbox: [],
        toasts: [],
        unreadByChannel: {},
        focusedChannelId: null,
      });
    },
  }),
);

// ── Derived selectors ─────────────────────────────────────────────────────────

/** Total unread inbox count for the bell badge. */
export function useUnreadNotificationCount(): number {
  return useCollabNotificationsStore((s) =>
    s.inbox.reduce((n, x) => n + (x.read ? 0 : 1), 0),
  );
}

/** Unread activity count for a specific channel's badge. */
export function useChannelUnreadCount(channelId: string | null): number {
  return useCollabNotificationsStore((s) =>
    channelId ? (s.unreadByChannel[channelId] ?? 0) : 0,
  );
}

/** Total unread across all channels in a space (for space-level badge). */
export function useSpaceUnreadCount(spaceId: string | null): number {
  return useCollabNotificationsStore((s) => {
    if (!spaceId) return 0;
    return s.inbox
      .filter((n) => !n.read && n.spaceId === spaceId)
      .reduce((acc) => acc + 1, 0);
  });
}
