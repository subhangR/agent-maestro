import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../platform';
import { DirectoryListing } from '../app/types/app-state';
import { formatError } from '../utils/formatters';

interface PathPickerState {
  pathPickerOpen: boolean;
  pathPickerTarget: 'project' | 'session' | null;
  pathPickerListing: DirectoryListing | null;
  pathPickerInput: string;
  pathPickerLoading: boolean;
  pathPickerError: string | null;
  setPathPickerOpen: (open: boolean) => void;
  setPathPickerTarget: (target: 'project' | 'session' | null) => void;
  setPathPickerListing: (listing: DirectoryListing | null) => void;
  setPathPickerInput: (input: string) => void;
  setPathPickerLoading: (loading: boolean) => void;
  setPathPickerError: (error: string | null) => void;
  loadPathPicker: (path: string | null) => Promise<void>;
  openPathPicker: (target: 'project' | 'session', initial: string | null) => void;
  closePathPicker: () => void;
}

export const usePathPickerStore = create<PathPickerState>((set, get) => ({
  pathPickerOpen: false,
  pathPickerTarget: null,
  pathPickerListing: null,
  pathPickerInput: '',
  pathPickerLoading: false,
  pathPickerError: null,
  setPathPickerOpen: (open) => set({ pathPickerOpen: open }),
  setPathPickerTarget: (target) => set({ pathPickerTarget: target }),
  setPathPickerListing: (listing) => set({ pathPickerListing: listing }),
  setPathPickerInput: (input) => set({ pathPickerInput: input }),
  setPathPickerLoading: (loading) => set({ pathPickerLoading: loading }),
  setPathPickerError: (error) => set({ pathPickerError: error }),
  loadPathPicker: async (path) => {
    if (!IS_TAURI) {
      set({ pathPickerError: 'Path picker is not available in browser mode.', pathPickerLoading: false });
      return;
    }
    set({ pathPickerLoading: true, pathPickerError: null });
    try {
      const listing = await invoke<DirectoryListing>('list_directories', { path });
      set({ pathPickerListing: listing, pathPickerInput: listing.path });
    } catch (err) {
      set({ pathPickerError: formatError(err) });
    } finally {
      set({ pathPickerLoading: false });
    }
  },
  openPathPicker: (target, initial) => {
    set({ pathPickerTarget: target, pathPickerOpen: true });
    void get().loadPathPicker(initial);
  },
  closePathPicker: () => {
    set({ pathPickerOpen: false, pathPickerTarget: null });
  },
}));
