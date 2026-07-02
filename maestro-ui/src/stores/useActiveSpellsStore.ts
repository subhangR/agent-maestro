import { create } from 'zustand';
import { resolveSpellColorId, type SpellColorId } from '../app/constants/spellColors';

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

  /** Clear all active spells for one or more sessions (e.g. on close). */
  clearSession: (maestroSessionId: string) => void;
}

function sortByCastAt(a: ActiveSpellView, b: ActiveSpellView): number {
  // Oldest first → rendered as the outermost ring (matches UI_SPEC §5).
  return a.castAt - b.castAt;
}

export const useActiveSpellsStore = create<ActiveSpellsState>((set) => ({
  byMaestroSessionId: {},

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

  clearSession: (maestroSessionId) => {
    set((state) => {
      if (!state.byMaestroSessionId[maestroSessionId]) return state;
      const next = { ...state.byMaestroSessionId };
      delete next[maestroSessionId];
      return { byMaestroSessionId: next };
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
