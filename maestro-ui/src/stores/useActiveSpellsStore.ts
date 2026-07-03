import { create } from 'zustand';
import { resolveSpellColorId, type SpellColorId } from '../app/constants/spellColors';
import { maestroClient } from '../utils/MaestroClient';

/**
 * One rule-fired observability entry (S8). Mirrors the `spell:rule_fired` WS
 * payload (CONTRACT-ADDENDUM Addition 2) — spell·rule·event·action·outcome.
 */
export interface RuleFiredEntry {
  /** Stable client key: `${timestamp}:${spellId}:${ruleId}:${seq}`. */
  key: string;
  spellId: string;
  ruleId: string;
  event: string;
  action: string;
  outcome: 'ok' | 'error';
  /** ms epoch when the rule fired (server timestamp when present). */
  timestamp: number;
}

/** Per-session activity ring buffer cap — keep the feed bounded (S8). */
const ACTIVITY_CAP = 60;

/**
 * UI-side view of one active spell on a session. Mirrors the relevant subset
 * of the server's `ActiveSpell` (maestro-server/src/types.ts) but resolves
 * `color` to the UI-palette id so ring consumers don't have to.
 */
export interface ActiveSpellView {
  spellId: string;
  spellName: string;
  colorId: SpellColorId;
  ensembleId?: string;
  /** ms epoch — cast time defines outside-in order (oldest outermost). */
  castAt: number;
  enabled: boolean;
  /** ruleId → iteration (loops are per-rule now). */
  ruleIterations: Record<string, number>;
}

interface ActiveSpellsState {
  /** Per maestroSessionId → ordered list (oldest → newest = outermost → innermost). */
  byMaestroSessionId: Record<string, ActiveSpellView[]>;

  /** Per maestroSessionId → recent rule-fired entries (newest first, capped). */
  activityByMaestroSessionId: Record<string, RuleFiredEntry[]>;

  /** Monotonic sequence to disambiguate same-ms rule-fired events. */
  _activitySeq: number;

  /** Add or replace a spell from a `spell:activated` WS payload. */
  activate: (params: {
    sessionIds: string[];
    spellId: string;
    spellName: string;
    color: string | undefined;
    ensembleId?: string;
    castAt: number;
    enabled: boolean;
    ruleIterations?: Record<string, number>;
  }) => void;

  /** Remove a spell from the named sessions (handles `spell:deactivated`). */
  deactivate: (params: { sessionIds: string[]; spellId: string }) => void;

  /**
   * Replace the entire active-spells list for a session — used when a session
   * is fetched/refreshed and we want to reconcile from the canonical
   * `Session.activeSpells` payload.
   */
  hydrate: (
    maestroSessionId: string,
    spells: ReadonlyArray<{
      spellId: string;
      spellName?: string;
      color: string | undefined;
      ensembleId?: string;
      castAt: number;
      enabled: boolean;
      ruleIterations?: Record<string, number>;
    }>,
  ) => void;

  /**
   * Optimistically reset loop iteration counters for a spell on a session.
   * Zeroes a single rule when `ruleId` is given, else all of them. The server
   * WS reconciliation (spell:activated) overwrites this once wired.
   */
  resetRuleIterations: (params: {
    maestroSessionId: string;
    spellId: string;
    ruleId?: string;
  }) => void;

  /**
   * Reset a loop's counters against the SERVER (FR-6.6, CONTRACT-ADDENDUM
   * Addition 1). Optimistically zeroes locally, then POSTs /reset-loop; the
   * authoritative `spell:loop_reset` WS event reconciles via `applyLoopReset`.
   * Rethrows on failure so the caller can surface an error.
   */
  resetLoop: (params: {
    maestroSessionId: string;
    spellId: string;
    ruleId?: string;
  }) => Promise<void>;

  /**
   * Authoritative loop-reset from a `spell:loop_reset` WS payload — replaces the
   * spell's `ruleIterations` wholesale from the server's ActiveSpell, superseding
   * any optimistic `resetRuleIterations`.
   */
  applyLoopReset: (params: {
    maestroSessionId: string;
    spellId: string;
    ruleIterations: Record<string, number>;
  }) => void;

  /** Append a rule-fired observability entry (S8) from `spell:rule_fired`. */
  recordRuleFired: (params: {
    maestroSessionId: string;
    spellId: string;
    ruleId: string;
    event: string;
    action: string;
    outcome: 'ok' | 'error';
    timestamp?: number;
  }) => void;

  /** Clear all active spells for one or more sessions (e.g. on close). */
  clearSession: (maestroSessionId: string) => void;
}

function sortByCastAt(a: ActiveSpellView, b: ActiveSpellView): number {
  // Oldest first → rendered as the outermost ring (matches UI_SPEC §5).
  return a.castAt - b.castAt;
}

export const useActiveSpellsStore = create<ActiveSpellsState>((set, get) => ({
  byMaestroSessionId: {},
  activityByMaestroSessionId: {},
  _activitySeq: 0,

  activate: ({ sessionIds, spellId, spellName, color, ensembleId, castAt, enabled, ruleIterations }) => {
    set((state) => {
      const next = { ...state.byMaestroSessionId };
      const colorId = resolveSpellColorId(color);
      for (const sid of sessionIds) {
        const current = next[sid] ? next[sid].filter((s) => s.spellId !== spellId) : [];
        current.push({ spellId, spellName, colorId, ensembleId, castAt, enabled, ruleIterations: ruleIterations ?? {} });
        current.sort(sortByCastAt);
        next[sid] = current;
      }
      return { byMaestroSessionId: next };
    });
  },

  deactivate: ({ sessionIds, spellId }) => {
    set((state) => {
      const next = { ...state.byMaestroSessionId };
      for (const sid of sessionIds) {
        const current = next[sid];
        if (!current) continue;
        const filtered = current.filter((s) => s.spellId !== spellId);
        if (filtered.length === 0) delete next[sid];
        else next[sid] = filtered;
      }
      return { byMaestroSessionId: next };
    });
  },

  hydrate: (maestroSessionId, spells) => {
    set((state) => {
      const list: ActiveSpellView[] = spells.map((s) => ({
        spellId: s.spellId,
        spellName: s.spellName ?? s.spellId,
        colorId: resolveSpellColorId(s.color),
        ensembleId: s.ensembleId,
        castAt: s.castAt,
        enabled: s.enabled,
        ruleIterations: s.ruleIterations ?? {},
      }));
      list.sort(sortByCastAt);
      const next = { ...state.byMaestroSessionId };
      if (list.length === 0) delete next[maestroSessionId];
      else next[maestroSessionId] = list;
      return { byMaestroSessionId: next };
    });
  },

  resetRuleIterations: ({ maestroSessionId, spellId, ruleId }) => {
    set((state) => {
      const current = state.byMaestroSessionId[maestroSessionId];
      if (!current) return state;
      const next = { ...state.byMaestroSessionId };
      next[maestroSessionId] = current.map((s) => {
        if (s.spellId !== spellId) return s;
        const iters = { ...s.ruleIterations };
        if (ruleId) iters[ruleId] = 0;
        else for (const k of Object.keys(iters)) iters[k] = 0;
        return { ...s, ruleIterations: iters };
      });
      return { byMaestroSessionId: next };
    });
  },

  resetLoop: async ({ maestroSessionId, spellId, ruleId }) => {
    // Optimistic zero for snappy UI; the server WS reconciles authoritatively.
    get().resetRuleIterations({ maestroSessionId, spellId, ruleId });
    await maestroClient.resetSpellLoop(spellId, maestroSessionId, ruleId);
  },

  applyLoopReset: ({ maestroSessionId, spellId, ruleIterations }) => {
    set((state) => {
      const current = state.byMaestroSessionId[maestroSessionId];
      if (!current) return state;
      const next = { ...state.byMaestroSessionId };
      next[maestroSessionId] = current.map((s) =>
        s.spellId === spellId ? { ...s, ruleIterations: { ...ruleIterations } } : s,
      );
      return { byMaestroSessionId: next };
    });
  },

  recordRuleFired: ({ maestroSessionId, spellId, ruleId, event, action, outcome, timestamp }) => {
    set((state) => {
      const ts = timestamp ?? Date.now();
      const seq = state._activitySeq + 1;
      const entry: RuleFiredEntry = {
        key: `${ts}:${spellId}:${ruleId}:${seq}`,
        spellId,
        ruleId,
        event,
        action,
        outcome,
        timestamp: ts,
      };
      const prev = state.activityByMaestroSessionId[maestroSessionId] ?? [];
      const nextList = [entry, ...prev].slice(0, ACTIVITY_CAP);
      return {
        activityByMaestroSessionId: {
          ...state.activityByMaestroSessionId,
          [maestroSessionId]: nextList,
        },
        _activitySeq: seq,
      };
    });
  },

  clearSession: (maestroSessionId) => {
    set((state) => {
      const hasActive = Boolean(state.byMaestroSessionId[maestroSessionId]);
      const hasActivity = Boolean(state.activityByMaestroSessionId[maestroSessionId]);
      if (!hasActive && !hasActivity) return state;
      const next = { ...state.byMaestroSessionId };
      const nextActivity = { ...state.activityByMaestroSessionId };
      delete next[maestroSessionId];
      delete nextActivity[maestroSessionId];
      return { byMaestroSessionId: next, activityByMaestroSessionId: nextActivity };
    });
  },
}));

/**
 * Selector hook — returns the active spells for a maestro session, or an empty
 * array. Stable empty-array reference so memoized consumers don't churn.
 */
const EMPTY_ACTIVE_SPELLS: ActiveSpellView[] = [];

export function useActiveSpellsForSession(maestroSessionId: string | null | undefined): ActiveSpellView[] {
  return useActiveSpellsStore((s) =>
    maestroSessionId ? (s.byMaestroSessionId[maestroSessionId] ?? EMPTY_ACTIVE_SPELLS) : EMPTY_ACTIVE_SPELLS,
  );
}

/** Stable empty ref for activity selectors. */
const EMPTY_ACTIVITY: RuleFiredEntry[] = [];

/**
 * Selector — recent rule-fired entries for a maestro session (S8 feed),
 * newest-first and capped. Empty array (stable ref) when nothing has fired.
 */
export function useSpellActivityForSession(maestroSessionId: string | null | undefined): RuleFiredEntry[] {
  return useActiveSpellsStore((s) =>
    maestroSessionId ? (s.activityByMaestroSessionId[maestroSessionId] ?? EMPTY_ACTIVITY) : EMPTY_ACTIVITY,
  );
}
