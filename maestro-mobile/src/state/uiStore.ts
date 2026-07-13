// Ephemeral app-level UI state (NOT persisted, except themeMode which mirrors
// the persisted prefsStore.theme). Three concerns, three owners of writes:
//   - activeProjectId  → Compass/Forge set it on project switch; the ingest
//                        layer reads it (getState) to drive resync on WS open.
//   - realtimeStatus   → Pulse pushes connection status via setRealtimeStatus;
//                        Forge reads `connected` for the offline banner.
//   - themeMode        → settings UI sets it; write-through to prefsStore for
//                        persistence. Applying it to Unistyles is Bedrock's
//                        setThemeMode (wired at app boot) — kept out of here so
//                        this store stays pure/testable (no native dependency).
import { create } from 'zustand';
import type { ProjectId } from '@/domain';
import type { ThemeMode } from '@/theme';
import { usePrefsStore } from './prefsStore';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface UiState {
  activeProjectId: ProjectId | null;
  realtimeStatus: RealtimeStatus;
  /** Convenience mirror of `realtimeStatus === 'connected'` for offline banners. */
  connected: boolean;
  themeMode: ThemeMode;
  setActiveProject: (id: ProjectId | null) => void;
  setRealtimeStatus: (status: RealtimeStatus) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  realtimeStatus: 'disconnected',
  connected: false,
  themeMode: usePrefsStore.getState().theme,
  setActiveProject: (id) => set({ activeProjectId: id }),
  setRealtimeStatus: (status) => set({ realtimeStatus: status, connected: status === 'connected' }),
  setThemeMode: (mode) => {
    usePrefsStore.getState().setTheme(mode);
    set({ themeMode: mode });
  },
}));

/** Non-React read of the active project id (used by the ingest/resync path). */
export const getActiveProjectId = (): ProjectId | null => useUiStore.getState().activeProjectId;
