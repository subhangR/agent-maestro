import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  SecureStorageMode,
  PersistedStateV1,
} from '../app/types/app-state';
import { IS_TAURI } from '../platform';
import { PersistedTerminalSession } from '../app/types/session';
import { formatError } from '../utils/formatters';
import { useProjectStore } from './useProjectStore';
import { useSessionStore } from './useSessionStore';
import { usePromptStore } from './usePromptStore';
import { useEnvironmentStore } from './useEnvironmentStore';
import { useAssetStore } from './useAssetStore';
import { useAgentShortcutStore } from './useAgentShortcutStore';
import { useUIStore } from './useUIStore';

// Module-level ref
let secureStoragePrompted = false;

interface SecureStorageState {
  secureStorageMode: SecureStorageMode | null;
  persistenceDisabledReason: string | null;
  secureStorageSettingsOpen: boolean;
  secureStorageSettingsMode: SecureStorageMode;
  secureStorageSettingsBusy: boolean;
  secureStorageSettingsError: string | null;
  secureStorageRetrying: boolean;
  setSecureStorageMode: (mode: SecureStorageMode | null | ((prev: SecureStorageMode | null) => SecureStorageMode | null)) => void;
  setPersistenceDisabledReason: (reason: string | null) => void;
  setSecureStorageSettingsOpen: (open: boolean) => void;
  setSecureStorageSettingsMode: (mode: SecureStorageMode) => void;
  openSecureStorageSettings: () => void;
  closeSecureStorageSettings: () => void;
  applySecureStorageSettings: () => Promise<void>;
  retrySecureStorage: () => Promise<void>;
  checkInitialPrompt: () => void;
}

function buildPersistedState(): PersistedStateV1 {
  const { projects, activeProjectId, activeSessionByProject } = useProjectStore.getState();
  const { sessions } = useSessionStore.getState();
  const { prompts } = usePromptStore.getState();
  const { environments } = useEnvironmentStore.getState();
  const { assets, assetSettings } = useAssetStore.getState();
  const { agentShortcutIds } = useAgentShortcutStore.getState();
  const secureStorageMode = useSecureStorageStore.getState().secureStorageSettingsMode;

  const persistedSessions: PersistedTerminalSession[] = sessions
    .filter((s: any) => !s.closing)
    .map((s: any) => ({
      persistId: s.persistId,
      projectId: s.projectId,
      name: s.name,
      launchCommand: s.launchCommand,
      restoreCommand: s.restoreCommand ?? null,
      sshTarget: s.sshTarget ?? null,
      sshRootDir: s.sshRootDir ?? null,
      lastRecordingId: s.lastRecordingId ?? null,
      cwd: s.cwd,
      persistent: s.persistent,
      createdAt: s.createdAt,
    }))
    .sort((a: any, b: any) => a.createdAt - b.createdAt);

  return {
    schemaVersion: 1,
    secureStorageMode,
    projects,
    activeProjectId,
    sessions: persistedSessions,
    activeSessionByProject,
    prompts,
    environments,
    assets,
    assetSettings,
    agentShortcutIds,
  };
}

export const useSecureStorageStore = create<SecureStorageState>((set, get) => ({
  secureStorageMode: null,
  persistenceDisabledReason: null,
  secureStorageSettingsOpen: false,
  secureStorageSettingsMode: 'keychain' as SecureStorageMode,
  secureStorageSettingsBusy: false,
  secureStorageSettingsError: null,
  secureStorageRetrying: false,

  setSecureStorageMode: (mode) => set((s) => ({
    secureStorageMode: typeof mode === 'function' ? mode(s.secureStorageMode) : mode,
  })),
  setPersistenceDisabledReason: (reason) => set({ persistenceDisabledReason: reason }),
  setSecureStorageSettingsOpen: (open) => set({ secureStorageSettingsOpen: open }),
  setSecureStorageSettingsMode: (mode) => set({ secureStorageSettingsMode: mode }),

  openSecureStorageSettings: () => {
    const { secureStorageMode } = get();
    set({
      secureStorageSettingsError: null,
      secureStorageSettingsMode: secureStorageMode ?? 'keychain',
      secureStorageSettingsOpen: true,
    });
  },

  closeSecureStorageSettings: () => {
    if (get().secureStorageSettingsBusy) return;
    set({ secureStorageSettingsOpen: false, secureStorageSettingsError: null });
  },

  applySecureStorageSettings: async () => {
    const { secureStorageSettingsBusy, secureStorageSettingsMode, secureStorageMode } = get();
    if (secureStorageSettingsBusy) return;
    set({ secureStorageSettingsError: null });

    const nextMode = secureStorageSettingsMode;
    if (nextMode === secureStorageMode) {
      set({ secureStorageSettingsOpen: false });
      return;
    }

    const { showNotice, reportError } = useUIStore.getState();

    if (!IS_TAURI) {
      set({ secureStorageMode: 'plaintext', persistenceDisabledReason: null, secureStorageSettingsOpen: false });
      showNotice('Running in browser \u2014 secure storage is not available; state stored in memory only.', 8000);
      return;
    }

    const state = buildPersistedState();
    state.secureStorageMode = nextMode;

    if (nextMode === 'plaintext') {
      set({ secureStorageMode: 'plaintext', persistenceDisabledReason: null });
      try { await invoke('save_persisted_state', { state }); } catch (err) { reportError('Failed to save state', err); }
      set({ secureStorageSettingsOpen: false });
      showNotice('Secure storage disabled: environments + recordings will be stored unencrypted on disk.', 12000);
      return;
    }

    set({ secureStorageSettingsBusy: true });
    showNotice('macOS Keychain access is needed to enable encryption. You may see 1\u20132 prompts; choose \u201cAlways Allow\u201d to avoid future prompts.', 20000);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    try {
      await invoke('reset_secure_storage');
      await invoke('prepare_secure_storage');
      await invoke('save_persisted_state', { state });
      set({ secureStorageMode: 'keychain', persistenceDisabledReason: null });

      const refreshed = await invoke<PersistedStateV1 | null>('load_persisted_state').catch(() => null);
      if (refreshed?.schemaVersion === 1) {
        useEnvironmentStore.getState().setEnvironments(refreshed.environments ?? []);
      }

      set({ secureStorageSettingsOpen: false });
      showNotice('Secure storage enabled: environments + recording inputs are encrypted at rest (key stored in macOS Keychain).', 10000);
    } catch (err) {
      set({ secureStorageSettingsError: formatError(err) });
    } finally {
      set({ secureStorageSettingsBusy: false });
    }
  },

  retrySecureStorage: async () => {
    if (!IS_TAURI) return;
    if (get().secureStorageRetrying) return;
    set({ secureStorageRetrying: true });

    const { showNotice } = useUIStore.getState();
    showNotice('macOS Keychain access is needed to decrypt/encrypt your environments + recordings. Choose \u201cAlways Allow\u201d to avoid future prompts.', 20000);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    try {
      await invoke('reset_secure_storage');
      await invoke('prepare_secure_storage');
      set({ persistenceDisabledReason: null });

      const refreshed = await invoke<PersistedStateV1 | null>('load_persisted_state').catch(() => null);
      if (refreshed?.schemaVersion === 1) {
        useEnvironmentStore.getState().setEnvironments(refreshed.environments ?? []);
      }

      showNotice('Secure storage unlocked.', 7000);
    } catch (err) {
      set({ persistenceDisabledReason: `Secure storage is locked (changes won't be saved): ${formatError(err)}` });
    } finally {
      set({ secureStorageRetrying: false });
    }
  },

  checkInitialPrompt: () => {
    if (!IS_TAURI) {
      set({ secureStorageMode: 'plaintext', persistenceDisabledReason: null });
      return;
    }
    const { secureStorageMode } = get();
    const { hydrated } = useSessionStore.getState();
    if (!hydrated) return;
    if (secureStoragePrompted) return;
    if (secureStorageMode !== null) return;
    secureStoragePrompted = true;
    set({
      secureStorageSettingsError: null,
      secureStorageSettingsMode: 'keychain',
      secureStorageSettingsOpen: true,
    });
  },
}));
