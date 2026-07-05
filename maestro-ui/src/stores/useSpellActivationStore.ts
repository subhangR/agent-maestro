import { create } from 'zustand';
import { maestroClient } from '../utils/MaestroClient';
import { useActiveSpellsStore, type ActiveSpellView } from './useActiveSpellsStore';
import { useEnsembleStore } from './useEnsembleStore';
import { useSpellLibraryStore } from './useSpellLibraryStore';
import { useSpellNotificationsStore } from './useSpellNotificationsStore';
import type { CastSpellInput } from '../app/types/maestro';

/** P1-6 — spell operations must not fail silently: toast every failure. */
function toastSpellError(message: string, sessionId?: string, spellId?: string) {
  useSpellNotificationsStore.getState().notify({ sessionId, spellId, message, level: 'warn' });
}

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
        // C1 — cast mode + ensemble name are now forwarded, not dropped.
        { castMode: input.castMode, ensembleName: input.ensembleName },
      );
      const sessionIds = result.sessions.map((s) => s.sessionId);
      // A coordinate cast returns an ensembleId; the `ensemble:created` WS event
      // routes it into useEnsembleStore, but refresh eagerly so the ensemble
      // surface reflects it even if the socket is momentarily behind.
      if (result.ensembleId) {
        void useEnsembleStore.getState().fetchEnsembles();
      }
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
      const msg = e?.message ?? 'Cast failed';
      set({ casting: false, error: msg });
      toastSpellError(`Cast failed: ${msg}`, undefined, input.spellId);
      throw e;
    }
  },

  setSpellEnabled: async (sessionId, spellId, enabled) => {
    // C4 — toggle in place (preserves ruleIterations) instead of the old
    // deactivate/re-activate dance. The `spell:toggled` WS event reconciles
    // the authoritative enabled flag; optimistically flip locally for snappiness.
    useActiveSpellsStore.getState().applyToggle({ maestroSessionId: sessionId, spellId, enabled });
    try {
      await maestroClient.toggleSpell(spellId, sessionId, enabled);
    } catch (e: any) {
      // Roll back the optimistic flip on failure and surface the error.
      useActiveSpellsStore.getState().applyToggle({ maestroSessionId: sessionId, spellId, enabled: !enabled });
      const msg = e?.message ?? 'Failed to toggle spell';
      set({ error: msg });
      toastSpellError(`Toggle failed: ${msg}`, sessionId, spellId);
      throw e;
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
      const msg = e?.message ?? 'Failed to reset loop';
      set({ error: msg });
      toastSpellError(`Loop reset failed: ${msg}`, sessionId, spellId);
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
