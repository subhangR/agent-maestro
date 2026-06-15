import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { formatError } from '../utils/formatters';
import { IS_TAURI } from '../platform';
import { closeSession } from '../services/sessionService';
import type { PersistentSessionInfo } from '../app/types/app-state';
import { useSessionStore } from './useSessionStore';
import { useUIStore } from './useUIStore';

interface PersistentSessionState {
  persistentSessionsOpen: boolean;
  manageTerminalsOpen: boolean;
  persistentSessionsLoading: boolean;
  persistentSessionsError: string | null;
  persistentSessions: PersistentSessionInfo[];
  confirmKillPersistentId: string | null;
  confirmKillPersistentBusy: boolean;
  setPersistentSessionsOpen: (open: boolean) => void;
  setManageTerminalsOpen: (open: boolean) => void;
  setConfirmKillPersistentId: (id: string | null) => void;
  refreshPersistentSessions: () => Promise<void>;
  requestKillPersistent: (id: string) => void;
  confirmKillPersistentSession: () => Promise<void>;
  closePersistentSessionsModal: () => void;
}

export const usePersistentSessionStore = create<PersistentSessionState>((set, get) => ({
  persistentSessionsOpen: false,
  manageTerminalsOpen: false,
  persistentSessionsLoading: false,
  persistentSessionsError: null,
  persistentSessions: [],
  confirmKillPersistentId: null,
  confirmKillPersistentBusy: false,

  setPersistentSessionsOpen: (open) => set({ persistentSessionsOpen: open }),
  setManageTerminalsOpen: (open) => set({ manageTerminalsOpen: open }),
  setConfirmKillPersistentId: (id) => set({ confirmKillPersistentId: id }),

  refreshPersistentSessions: async () => {
    if (!IS_TAURI) {
      set({ persistentSessions: [], persistentSessionsLoading: false, persistentSessionsError: null });
      return;
    }
    set({ persistentSessionsLoading: true, persistentSessionsError: null });
    try {
      const list = await invoke<PersistentSessionInfo[]>('list_persistent_sessions');
      set({ persistentSessions: list });
    } catch (err) {
      set({ persistentSessionsError: formatError(err) });
    } finally {
      set({ persistentSessionsLoading: false });
    }
  },

  requestKillPersistent: (id) => set({ confirmKillPersistentId: id }),

  confirmKillPersistentSession: async () => {
    const { confirmKillPersistentId: persistId, refreshPersistentSessions } = get();
    if (!persistId) return;
    set({ confirmKillPersistentBusy: true });

    const { sessions, setSessions, setActiveId } = useSessionStore.getState();
    const { showNotice, reportError } = useUIStore.getState();

    try {
      const toClose = sessions.filter((s: any) => s.persistId === persistId).map((s: any) => s.id);
      await Promise.all(toClose.map((id: string) => closeSession(id).catch(() => {})));
      if (IS_TAURI) await invoke('kill_persistent_session', { persistId });
      setSessions((prev: any) => prev.filter((s: any) => s.persistId !== persistId));
      setActiveId((prevActive: string | null) => {
        if (!prevActive) return prevActive;
        if (toClose.includes(prevActive)) return null;
        return prevActive;
      });
      showNotice(`Killed persistent session ${persistId.slice(0, 8)}`);
      void refreshPersistentSessions();
    } catch (err) {
      reportError('Failed to kill persistent session', err);
    } finally {
      set({ confirmKillPersistentBusy: false, confirmKillPersistentId: null });
    }
  },

  closePersistentSessionsModal: () => {
    if (get().confirmKillPersistentBusy) return;
    set({ persistentSessionsOpen: false, persistentSessionsError: null });
  },
}));
