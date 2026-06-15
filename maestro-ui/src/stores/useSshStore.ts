import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../platform';
import { SshHostEntry, SshForward, buildSshCommand } from '../app/utils/ssh';
import { formatError } from '../utils/formatters';
import { copyToClipboard } from '../utils/domUtils';
import { makeId } from '../app/utils/id';
import { useUIStore } from './useUIStore';

interface SshState {
  sshManagerOpen: boolean;
  sshHosts: SshHostEntry[];
  sshHostsLoading: boolean;
  sshHostsError: string | null;
  sshHost: string;
  sshPersistent: boolean;
  sshForwardOnly: boolean;
  sshExitOnForwardFailure: boolean;
  sshForwards: SshForward[];
  sshError: string | null;
  setSshManagerOpen: (open: boolean) => void;
  setSshHosts: (hosts: SshHostEntry[]) => void;
  setSshHostsLoading: (loading: boolean) => void;
  setSshHostsError: (error: string | null) => void;
  setSshHost: (host: string) => void;
  setSshPersistent: (persistent: boolean) => void;
  setSshForwardOnly: (forwardOnly: boolean) => void;
  setSshExitOnForwardFailure: (exit: boolean) => void;
  setSshForwards: (forwards: SshForward[] | ((prev: SshForward[]) => SshForward[])) => void;
  setSshError: (error: string | null) => void;
  addSshForward: () => void;
  removeSshForward: (id: string) => void;
  updateSshForward: (id: string, patch: Partial<SshForward>) => void;
  refreshSshHosts: () => Promise<void>;
  copySshCommand: () => Promise<void>;
  getSshCommandPreview: () => string | null;
}

export const useSshStore = create<SshState>((set, get) => ({
  sshManagerOpen: false,
  sshHosts: [],
  sshHostsLoading: false,
  sshHostsError: null,
  sshHost: '',
  sshPersistent: true,
  sshForwardOnly: false,
  sshExitOnForwardFailure: true,
  sshForwards: [],
  sshError: null,
  setSshManagerOpen: (open) => set({ sshManagerOpen: open }),
  setSshHosts: (hosts) => set({ sshHosts: hosts }),
  setSshHostsLoading: (loading) => set({ sshHostsLoading: loading }),
  setSshHostsError: (error) => set({ sshHostsError: error }),
  setSshHost: (host) => set({ sshHost: host }),
  setSshPersistent: (persistent) => set({ sshPersistent: persistent }),
  setSshForwardOnly: (forwardOnly) => set({ sshForwardOnly: forwardOnly }),
  setSshExitOnForwardFailure: (exit) => set({ sshExitOnForwardFailure: exit }),
  setSshForwards: (forwards) =>
    set((state) => ({
      sshForwards: typeof forwards === 'function' ? forwards(state.sshForwards) : forwards,
    })),
  setSshError: (error) => set({ sshError: error }),
  addSshForward: () =>
    set((state) => ({
      sshForwards: [
        ...state.sshForwards,
        {
          id: makeId(),
          type: 'local',
          bindAddress: '',
          listenPort: '',
          destinationHost: 'localhost',
          destinationPort: '',
        },
      ],
    })),
  removeSshForward: (id) =>
    set((state) => ({
      sshForwards: state.sshForwards.filter((f) => f.id !== id),
    })),
  updateSshForward: (id, patch) =>
    set((state) => ({
      sshForwards: state.sshForwards.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  refreshSshHosts: async () => {
    if (!IS_TAURI) {
      set({ sshHosts: [], sshHostsLoading: false, sshHostsError: null });
      return;
    }
    set({ sshHostsLoading: true, sshHostsError: null });
    try {
      const list = await invoke<SshHostEntry[]>('list_ssh_hosts');
      set({ sshHosts: list });
    } catch (err) {
      set({ sshHostsError: formatError(err) });
    } finally {
      set({ sshHostsLoading: false });
    }
  },
  copySshCommand: async () => {
    const preview = get().getSshCommandPreview();
    if (!preview) return;
    const ok = await copyToClipboard(preview);
    try {
      useUIStore.getState().showNotice(ok ? 'Copied SSH command' : 'Could not copy SSH command');
    } catch {
      // best-effort
    }
  },
  getSshCommandPreview: () => {
    const { sshHost, sshForwards, sshExitOnForwardFailure, sshForwardOnly } = get();
    return buildSshCommand({
      host: sshHost,
      forwards: sshForwards,
      exitOnForwardFailure: sshExitOnForwardFailure,
      forwardOnly: sshForwardOnly,
    });
  },
}));
