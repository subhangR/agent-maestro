// Persisted user prefs — the ONLY persisted slice in v1. Tiny, user-scoped,
// read synchronously at boot (pre-paint) via the swappable StateStorage seam.
//
// Persists EXACTLY two things: theme mode + last connected host string. NO
// entity data (server is source of truth; we resync on WS open), NO secrets
// (tokens live in expo-secure-store, Conduit's concern — never here).
//
// `theme` is the stored source of truth that Bedrock's ThemeBoot reads pre-paint
// and applies via `setThemeMode` (see @/theme). `lastHost` is the raw host string
// Conduit feeds through `buildServerConfig` to build the active ServerConfig.
import { create } from 'zustand';
import type { ThemeMode } from '@/theme';
import { resolveDefaultStorage, type StateStorage } from './storage';

const STORAGE_ID = 'maestro-prefs';
const KEY_THEME = 'theme';
const KEY_LAST_HOST = 'lastHost';

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const isThemeMode = (v: string | null): v is ThemeMode =>
  v != null && (THEME_MODES as readonly string[]).includes(v);

// Module-level storage handle. Swappable for tests via `__setPrefsStorage`.
let storage: StateStorage = resolveDefaultStorage(STORAGE_ID);

export interface PrefsState {
  theme: ThemeMode;
  /** Raw host:port string the user last connected to (non-secret). */
  lastHost: string | null;
  setTheme: (mode: ThemeMode) => void;
  setLastHost: (host: string | null) => void;
}

function readInitial(): { theme: ThemeMode; lastHost: string | null } {
  const storedTheme = storage.getString(KEY_THEME);
  return {
    theme: isThemeMode(storedTheme) ? storedTheme : 'system',
    lastHost: storage.getString(KEY_LAST_HOST),
  };
}

export const usePrefsStore = create<PrefsState>((set) => ({
  ...readInitial(),
  setTheme: (mode) => {
    storage.set(KEY_THEME, mode);
    set({ theme: mode });
  },
  setLastHost: (host) => {
    if (host == null) storage.delete(KEY_LAST_HOST);
    else storage.set(KEY_LAST_HOST, host);
    set({ lastHost: host });
  },
}));

/** Await before reading prefs when on the AsyncStorage path. No-op for MMKV/memory. */
export async function hydratePrefs(): Promise<void> {
  if (!storage.hydrate) return;
  await storage.hydrate();
  usePrefsStore.setState(readInitial());
}

/** Test seam: swap the storage backend and re-hydrate the store. */
export function __setPrefsStorage(next: StateStorage): void {
  storage = next;
  usePrefsStore.setState(readInitial());
}
