import { create } from 'zustand';
import type { SpellNotifyLevel } from '../app/types/maestro';

/**
 * In-app spell notification (C3). `notify:progress` WS events land here as a
 * transient toast plus a persistent history entry — the honest replacement for
 * the dropped notify-channel relay promise. Also used to surface cast/toggle
 * failures from the spell stores (P1-6).
 */
export interface SpellNotification {
  id: string;
  sessionId: string | null;
  spellId?: string;
  ruleId?: string;
  message: string;
  level: SpellNotifyLevel;
  timestamp: number;
  read: boolean;
}

/** History is bounded — the toast host and any future bell surface read it. */
const HISTORY_CAP = 100;
/** At most this many toasts stacked at once; older ones are dropped first. */
const TOAST_CAP = 4;

interface SpellNotificationsState {
  /** Persistent entries, newest first, capped at HISTORY_CAP. */
  history: SpellNotification[];
  /** Currently-visible toasts (subset of history), oldest first. */
  toasts: SpellNotification[];

  /** Add a notification: appears as a toast and is kept in history. Returns its id. */
  notify: (n: {
    sessionId?: string | null;
    spellId?: string;
    ruleId?: string;
    message: string;
    level?: SpellNotifyLevel;
  }) => string;

  /** Remove a toast (auto-dismiss timeout or the × button). History keeps it. */
  dismissToast: (id: string) => void;

  markAllRead: () => void;
  clearHistory: () => void;
}

let notifSeq = 0;

export const useSpellNotificationsStore = create<SpellNotificationsState>((set) => ({
  history: [],
  toasts: [],

  notify: ({ sessionId, spellId, ruleId, message, level }) => {
    notifSeq += 1;
    const entry: SpellNotification = {
      id: `spn_${Date.now().toString(36)}_${notifSeq.toString(36)}`,
      sessionId: sessionId ?? null,
      spellId,
      ruleId,
      message,
      level: level ?? 'info',
      timestamp: Date.now(),
      read: false,
    };
    set((state) => ({
      history: [entry, ...state.history].slice(0, HISTORY_CAP),
      toasts: [...state.toasts, entry].slice(-TOAST_CAP),
    }));
    return entry.id;
  },

  dismissToast: (id) =>
    set((state) => {
      if (!state.toasts.some((t) => t.id === id)) return state;
      return { toasts: state.toasts.filter((t) => t.id !== id) };
    }),

  markAllRead: () =>
    set((state) => ({ history: state.history.map((h) => (h.read ? h : { ...h, read: true })) })),

  clearHistory: () => set({ history: [], toasts: [] }),
}));

/** Unread count for badge surfaces. */
export function useUnreadSpellNotificationCount(): number {
  return useSpellNotificationsStore((s) => s.history.reduce((n, h) => n + (h.read ? 0 : 1), 0));
}
