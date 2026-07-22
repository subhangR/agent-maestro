// src/state/collab/sharedStore.ts — Zustand store for shared-entity lists.
//
// The READ side of share/pull. For each (spaceId, kind) it holds the live list
// of entities shared into that space, driven by SharedClient.subscribe. Screens
// call subscribe(spaceId, kind) once (ref-counted) and select the list/loading/
// error slices; the store tears the Firestore listener down when the last
// subscriber for a (space, kind) unmounts.
//
// Design mirrors messagingStore: one store, keyed maps, subscribe() returns an
// unsub fn, and stable-empty refs so unpopulated selects don't churn renders.
import { create } from 'zustand';

import { SharedClient, type SharedEntityKind, type SharedEntitySummary } from '@/services/collab';

// ── Stable empty ref — every "nothing here yet" select returns THIS array so a
//    component doesn't re-render just because a fresh [] was produced. ──────────
const EMPTY: readonly SharedEntitySummary[] = Object.freeze([]);

/** Composite key for a (space, kind) subscription slot. */
function slotKey(spaceId: string, kind: SharedEntityKind): string {
  return `${spaceId}:${kind}`;
}

interface Slot {
  items: SharedEntitySummary[];
  loading: boolean;
  error: string | null;
}

export interface SharedState {
  /** slotKey → list/loading/error. */
  slots: Record<string, Slot>;

  /**
   * Start (or reuse) the subscription for a (space, kind). Ref-counted — the
   * Firestore listener is created on the first caller and torn down when the
   * returned unsub is called by the last caller.
   */
  subscribe: (spaceId: string, kind: SharedEntityKind) => () => void;
}

// ── Non-reactive listener bookkeeping (kept out of the store state so it never
//    triggers a render). ────────────────────────────────────────────────────
const listeners: Record<string, () => void> = {};
const refCounts: Record<string, number> = {};

export const useSharedStore = create<SharedState>((set) => ({
  slots: {},

  subscribe: (spaceId, kind) => {
    const key = slotKey(spaceId, kind);
    refCounts[key] = (refCounts[key] ?? 0) + 1;

    // First subscriber for this slot → open the Firestore listener.
    if (refCounts[key] === 1) {
      set((s) => ({
        slots: {
          ...s.slots,
          [key]: { items: s.slots[key]?.items ?? [], loading: true, error: null },
        },
      }));

      listeners[key] = SharedClient.subscribe(
        spaceId,
        kind,
        (items) => {
          set((s) => ({
            slots: { ...s.slots, [key]: { items, loading: false, error: null } },
          }));
        },
        (err) => {
          set((s) => ({
            slots: {
              ...s.slots,
              [key]: { items: s.slots[key]?.items ?? [], loading: false, error: err.message },
            },
          }));
        },
      );
    }

    // Unsub: decrement ref-count; last one out closes the listener.
    return () => {
      refCounts[key] = Math.max(0, (refCounts[key] ?? 1) - 1);
      if (refCounts[key] === 0) {
        listeners[key]?.();
        delete listeners[key];
      }
    };
  },
}));

// ── Selectors (stable-empty refs) ─────────────────────────────────────────────

export const selectSharedItems =
  (spaceId: string, kind: SharedEntityKind) =>
  (s: SharedState): SharedEntitySummary[] =>
    s.slots[slotKey(spaceId, kind)]?.items ?? (EMPTY as SharedEntitySummary[]);

export const selectSharedLoading =
  (spaceId: string, kind: SharedEntityKind) =>
  (s: SharedState): boolean =>
    s.slots[slotKey(spaceId, kind)]?.loading ?? false;

export const selectSharedError =
  (spaceId: string, kind: SharedEntityKind) =>
  (s: SharedState): string | null =>
    s.slots[slotKey(spaceId, kind)]?.error ?? null;
