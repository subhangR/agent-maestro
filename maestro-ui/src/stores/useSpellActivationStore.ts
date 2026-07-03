import { create } from 'zustand';
import { maestroClient } from '../utils/MaestroClient';
import { useActiveSpellsStore, type ActiveSpellView } from './useActiveSpellsStore';
import { useSpellLibraryStore } from './useSpellLibraryStore';
import type { CastSpellInput } from '../app/types/maestro';

export interface CastReceipt {
  castId: string;
  summary: string;
  undoAction: () => Promise<void>;
  undoDisabled?: { reason: string };
  secondaryAction?: { label: string; action: () => Promise<void> };
}

export interface CastResult {
  spellId: string;
  sessionIds: string[];
}

interface SpellActivationState {
  casting: boolean;
  lastCastAt: number | null;
  lastCastReceipt: CastReceipt | null;
  error: string | null;

  castSpell: (input: CastSpellInput) => Promise<CastResult>;
  setSpellEnabled: (sessionId: string, spellId: string, enabled: boolean) => Promise<void>;
  removeActiveSpell: (sessionId: string, spellId: string) => Promise<void>;
  /** Reset loop counters for a spell; pass ruleId to target a single rule. */
  resetIteration: (sessionId: string, spellId: string, ruleId?: string) => Promise<void>;
  consumeReceipt: () => void;
}

export const useSpellActivationStore = create<SpellActivationState>((set, get) => ({
  casting: false,
  lastCastAt: null,
  lastCastReceipt: null,
  error: null,

  castSpell: async (input) => {
    set({ casting: true, error: null });
    try {
      const result = await maestroClient.activateSpell(
        input.spellId,
        input.targetSessionIds,
        input.invokerSessionId ?? null,
      );
      const sessionIds = result.sessions.map((s) => s.sessionId);
      // ui-borders' useActiveSpellsStore will receive WS spell:activated and update.
      const library = useSpellLibraryStore.getState();
      library.trackRecent(input.spellId);
      const spell = library.spellById(input.spellId);
      const name = spell?.name ?? result.spell?.name ?? 'spell';
      const count = sessionIds.length;
      const summary = `Cast ${name} on ${count} ${count === 1 ? 'session' : 'sessions'}`;
      const castId = `cast_${Date.now()}_${input.spellId}`;
      const undoAction = async () => {
        await maestroClient.deactivateSpell(input.spellId, sessionIds);
      };
      const receipt: CastReceipt = { castId, summary, undoAction };
      set({
        casting: false,
        lastCastAt: Date.now(),
        lastCastReceipt: receipt,
      });
      return { spellId: input.spellId, sessionIds };
    } catch (e: any) {
      set({ casting: false, error: e?.message ?? 'Cast failed' });
      throw e;
    }
  },

  setSpellEnabled: async (sessionId, spellId, enabled) => {
    // Server contract for toggle is part of P2/P3; for now optimistic-update the
    // local store and re-cast on enable / deactivate on disable.
    if (!enabled) {
      await maestroClient.deactivateSpell(spellId, [sessionId]);
    } else {
      await maestroClient.activateSpell(spellId, [sessionId]);
    }
  },

  removeActiveSpell: async (sessionId, spellId) => {
    await maestroClient.deactivateSpell(spellId, [sessionId]);
  },

  resetIteration: async (sessionId, spellId, ruleId) => {
    // Optimistic per-rule reset for snappy UI, then persist via the real
    // endpoint (CONTRACT-ADDENDUM Addition 1). The authoritative
    // `spell:loop_reset` WS event reconciles ruleIterations in useActiveSpellsStore.
    useActiveSpellsStore.getState().resetRuleIterations({ maestroSessionId: sessionId, spellId, ruleId });
    try {
      await maestroClient.resetSpellLoop(spellId, sessionId, ruleId);
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to reset loop' });
      throw e;
    }
  },

  consumeReceipt: () => set({ lastCastReceipt: null }),
}));

/** Selector — returns active spells on a session via the ui-borders store. */
export function useActiveSpellsForSession(sessionId: string | null | undefined): ActiveSpellView[] {
  return useActiveSpellsStore((s) =>
    sessionId ? (s.byMaestroSessionId[sessionId] ?? EMPTY_LIST) : EMPTY_LIST,
  );
}
const EMPTY_LIST: ActiveSpellView[] = [];

/** Summed loop-iteration count for a session/spell pair (across loop rules). */
export function useIterationState(sessionId: string, spellId: string): { current: number; max: number } {
  const current = useActiveSpellsStore((s) => {
    const row = s.byMaestroSessionId[sessionId]?.find((x) => x.spellId === spellId);
    const iters = row?.ruleIterations ?? {};
    return Object.values(iters).reduce((a, b) => a + b, 0);
  });
  return { current, max: 0 };
}
