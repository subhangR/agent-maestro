import { create } from 'zustand';
import { maestroClient } from '../utils/MaestroClient';
import type { Ensemble } from '../app/types/maestro';

interface EnsembleState {
  ensembles: Ensemble[];
  loading: boolean;
  error: string | null;

  fetchEnsembles: () => Promise<void>;
  upsert: (e: Ensemble) => void;
  remove: (id: string) => void;

  rename: (id: string, name: string) => Promise<void>;
  updateObjective: (id: string, objective: string) => Promise<void>;
  setLeader: (id: string, sessionId: string) => Promise<void>;
  addMember: (id: string, sessionId: string) => Promise<void>;
  removeMember: (id: string, sessionId: string) => Promise<void>;
  disband: (id: string) => Promise<void>;
  sendEnsembleMessage: (id: string, content: string, senderSessionId?: string | null) => Promise<void>;

  ensembleById: (id: string) => Ensemble | undefined;
  ensemblesForMember: (sessionId: string) => Ensemble[];
}

export const useEnsembleStore = create<EnsembleState>((set, get) => ({
  ensembles: [],
  loading: false,
  error: null,

  fetchEnsembles: async () => {
    set({ loading: true, error: null });
    try {
      const ensembles = await maestroClient.listEnsembles();
      set({ ensembles, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Failed to load ensembles' });
    }
  },

  upsert: (e) => set((s) => {
    const others = s.ensembles.filter((x) => x.id !== e.id);
    return { ensembles: [...others, e] };
  }),

  remove: (id) => set((s) => ({ ensembles: s.ensembles.filter((x) => x.id !== id) })),

  rename: async (id, name) => {
    const updated = await maestroClient.updateEnsemble(id, { name });
    get().upsert(updated);
  },

  updateObjective: async (id, objective) => {
    const updated = await maestroClient.updateEnsemble(id, { objective });
    get().upsert(updated);
  },

  setLeader: async (id, sessionId) => {
    const updated = await maestroClient.updateEnsemble(id, { leaderSessionId: sessionId });
    get().upsert(updated);
  },

  addMember: async (id, sessionId) => {
    const updated = await maestroClient.addEnsembleMember(id, sessionId);
    get().upsert(updated);
  },

  removeMember: async (id, sessionId) => {
    const updated = await maestroClient.removeEnsembleMember(id, sessionId);
    get().upsert(updated);
  },

  disband: async (id) => {
    await maestroClient.disbandEnsemble(id);
    get().remove(id);
  },

  sendEnsembleMessage: async (id, content, senderSessionId) => {
    await maestroClient.messageEnsemble(id, content, senderSessionId);
  },

  ensembleById: (id) => get().ensembles.find((e) => e.id === id),

  ensemblesForMember: (sessionId) => get().ensembles.filter((e) => e.memberSessionIds.includes(sessionId)),
}));
