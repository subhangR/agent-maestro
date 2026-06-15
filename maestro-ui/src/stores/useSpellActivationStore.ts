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
  resetIteration: (sessionId: string, spellId: string) => Promise<void>;
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
      // ui-borders' useActiveSpellsStore will receive WS spell:activated and update.
      const library = useSpellLibraryStore.getState();
      library.trackRecent(input.spellId);
      const spell = library.spellById(input.spellId);
      const name = spell?.name ?? 'spell';
      const count = result.sessionIds.length;
      const summary = `Cast ${name} on ${count} ${count === 1 ? 'session' : 'sessions'}`;
      const castId = `cast_${Date.now()}_${input.spellId}`;
      const undoAction = async () => {
        await maestroClient.deactivateSpell(input.spellId, result.sessionIds);
      };
      const receipt: CastReceipt = { castId, summary, undoAction };
      set({
        casting: false,
        lastCastAt: Date.now(),
        lastCastReceipt: receipt,
      });
      return { spellId: input.spellId, sessionIds: result.sessionIds };
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

  resetIteration: async (_sessionId, _spellId) => {
    // Server-side reset endpoint not yet exposed. Placeholder for P3 wiring.
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

/** Iteration progress for a session/spell pair. */
export function useIterationState(sessionId: string, spellId: string): { current: number; max: number } {
  return useActiveSpellsStore((s) => {
    const row = s.byMaestroSessionId[sessionId]?.find((x) => x.spellId === spellId);
    return { current: row?.iteration ?? 0, max: 0 };
  });
}
