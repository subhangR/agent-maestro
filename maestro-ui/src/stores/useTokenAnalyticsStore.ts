import { create } from 'zustand';
import type { GlobalTokenSummary, TaskTokenSummary } from '../app/types/maestro';
import { maestroClient } from '../utils/MaestroClient';

interface TokenAnalyticsState {
  globalSummary: GlobalTokenSummary | null;
  loadingGlobal: boolean;
  globalError: string | null;

  taskSummaries: Record<string, TaskTokenSummary>;
  loadingTasks: Record<string, boolean>;

  fetchGlobalSummary: (windowMs?: number) => Promise<void>;
  fetchTaskSummary: (taskId: string) => Promise<void>;
}

export const useTokenAnalyticsStore = create<TokenAnalyticsState>((set, get) => ({
  globalSummary: null,
  loadingGlobal: false,
  globalError: null,

  taskSummaries: {},
  loadingTasks: {},

  fetchGlobalSummary: async (windowMs?: number) => {
    set({ loadingGlobal: true, globalError: null });
    try {
      const summary = await maestroClient.getGlobalTokenSummary(windowMs);
      set({ globalSummary: summary, loadingGlobal: false });
    } catch (err) {
      set({
        loadingGlobal: false,
        globalError: err instanceof Error ? err.message : 'Failed to load token analytics',
      });
    }
  },

  fetchTaskSummary: async (taskId: string) => {
    if (get().loadingTasks[taskId]) return;
    set((s) => ({ loadingTasks: { ...s.loadingTasks, [taskId]: true } }));
    try {
      const summary = await maestroClient.getTaskTokenSummary(taskId);
      set((s) => ({
        taskSummaries: { ...s.taskSummaries, [taskId]: summary },
        loadingTasks: { ...s.loadingTasks, [taskId]: false },
      }));
    } catch {
      set((s) => ({ loadingTasks: { ...s.loadingTasks, [taskId]: false } }));
    }
  },
}));
