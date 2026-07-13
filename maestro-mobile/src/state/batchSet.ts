// The reconciliation engine, ported VERBATIM from maestro-ui's useMaestroStore
// (the `batchSet` microtask coalescer at useMaestroStore.ts:224-246, plus
// `normalizeSession` and the `session:status_changed` fast-path).
//
// Why this matters even more on mobile: one WS flush from the bridge is a JSON
// array of up to dozens of envelopes (50ms server batching). If each envelope
// triggered its own set(), every subscribed FlatList row would re-render N
// times. queueMicrotask coalescing collapses the whole array (plus anything
// else queued in the same tick) into ONE set() → one notification → one commit.
//
// CONTRACT (do not break): every batched updater MUST read the LIVE `state`
// argument and spread the WHOLE map — `(s) => ({ tasks: { ...s.tasks, [id]: t }})`.
//
// IMPORTANT correctness fix vs the literal desktop merge: maestro-ui does
// `Object.assign(merged, fn(state))` where every `fn` is handed the SAME
// pre-batch `state`. That silently DROPS sibling writes to the same top-level
// key — 50 task:created in one flush would keep only the last task (the merge's
// `tasks` key is overwritten each iteration, and each fn only spread the
// pre-batch map). The desktop masks this because WS batches rarely carry many
// same-type entities. We thread the ACCUMULATED state through the updaters so
// later writers see earlier ones — all N survive one commit (Risk #1 / Q4).
import type { Session, SessionStatus, SessionStatusChangedPayload, EpochMs } from '@/domain';

// ---------------------------------------------------------------------------
// batchSet coalescer (store-scoped factory)
// ---------------------------------------------------------------------------

export type Updater<S> = (state: S) => Partial<S>;

export interface BatchSetController<S> {
  /** Queue a pure state update; coalesced with all updaters in this tick. */
  batchSet: (updater: Updater<S>) => void;
  /** Synchronously flush pending updaters (tests). Normally the microtask fires. */
  flush: () => void;
  /** Number of updaters waiting for the next flush (tests/diagnostics). */
  pendingCount: () => number;
}

export function createBatchSet<S>(set: (updater: Updater<S>) => void): BatchSetController<S> {
  let pending: Updater<S>[] = [];
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const updates = pending;
    pending = [];
    if (updates.length === 0) return;
    if (updates.length === 1) {
      set(updates[0]!);
      return;
    }
    set((state) => {
      // Thread the accumulated state so an updater writing the same top-level key
      // as an earlier one composes (spreads the already-updated map) instead of
      // clobbering it. Still ONE set() → one notification.
      let working = state;
      const merged: Partial<S> = {};
      for (const fn of updates) {
        const partial = fn(working);
        Object.assign(merged, partial);
        working = { ...working, ...partial };
      }
      return merged;
    });
  };

  const batchSet = (updater: Updater<S>) => {
    pending.push(updater);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };

  return { batchSet, flush, pendingCount: () => pending.length };
}

// ---------------------------------------------------------------------------
// Session normalization (port of normalizeSession) — defensive array/status
// defaults so a thin/partial payload can never crash a screen.
// ---------------------------------------------------------------------------

export function normalizeSession(session: Session): Session {
  const next = { ...session };
  if (!Array.isArray(next.taskIds)) next.taskIds = [];
  if (!Array.isArray(next.timeline)) next.timeline = [];
  if (!Array.isArray(next.events)) next.events = [];
  if (!Array.isArray(next.docs)) next.docs = [];
  if (!next.status) next.status = 'spawning';
  return next;
}

// ---------------------------------------------------------------------------
// Summary-vs-full merge guard (Risk #7 / CQ-5). List fetches default to
// fields=summary; a thin summary must NOT clobber a populated session already
// in the map. Detail fetches + WS full-replaces are authoritative and skip this.
// ---------------------------------------------------------------------------

function preferPopulated<T>(incoming: T[], previous: T[]): T[] {
  if (incoming.length > 0) return incoming;
  if (previous.length > 0) return previous;
  return incoming;
}

export function mergeSummarySession(existing: Session | undefined, incoming: Session): Session {
  if (!existing) return incoming;
  return {
    ...incoming,
    timeline: preferPopulated(incoming.timeline, existing.timeline),
    events: preferPopulated(incoming.events, existing.events),
    taskIds: preferPopulated(incoming.taskIds, existing.taskIds),
    docs: preferPopulated(incoming.docs, existing.docs),
  };
}

// ---------------------------------------------------------------------------
// Status-only fast path (port of the session:status_changed case). A lightweight
// shallow merge — NEVER a full replace — and only for a session already present.
// The payload is a PARTIAL (id/status/lastActivity/needsInput), not a Session.
// ---------------------------------------------------------------------------

function coerceEpoch(raw: string, fallback: EpochMs): EpochMs {
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function statusOnlyPatch(existing: Session, payload: SessionStatusChangedPayload): Session {
  return {
    ...existing,
    status: payload.status as SessionStatus,
    lastActivity: coerceEpoch(payload.lastActivity, existing.lastActivity),
    needsInput: payload.needsInput,
  };
}
