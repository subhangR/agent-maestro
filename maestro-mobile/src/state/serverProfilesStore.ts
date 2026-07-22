// Saved server profiles — the roster of maestro backends the user can switch
// between. Each profile is one server: a standalone box (authMode 'none' or
// 'password') OR the multi-user Hub/gateway ('firebase'). Same protocol/APIs
// everywhere; a switch just re-points the app at another backend (separate data
// per server — no cross-server sync).
//
// Persisted (like prefsStore) through the swappable sync StateStorage seam as a
// single JSON blob. NON-SECRET: only labels/hosts/authMode live here — tokens
// stay in their own stores (password → prefs.authToken; firebase → the Firebase
// session, owned by the Collab firebaseAuth module).
import { create } from 'zustand';
import type { AuthMode } from '@/services/api';
import { resolveDefaultStorage, type StateStorage } from './storage';

const STORAGE_ID = 'maestro-servers';
const KEY_STATE = 'serverProfiles';

/** One saved backend. `host` is the raw string fed to buildServerConfig. */
export interface ServerProfile {
  id: string;
  /** User-facing name (defaults to the host if not supplied). */
  label: string;
  /** Raw host:port or URL the user entered. */
  host: string;
  /** Last-detected auth mode (from GET /health). */
  authMode: AuthMode;
}

interface PersistedShape {
  profiles: ServerProfile[];
  activeProfileId: string | null;
}

export interface ServerProfilesState extends PersistedShape {
  /** Add a new profile (or return the existing one with the same host). */
  addProfile: (input: { label?: string; host: string; authMode?: AuthMode }) => ServerProfile;
  /** Add-or-update by host — used after a successful connect/probe. */
  upsertByHost: (input: { label?: string; host: string; authMode?: AuthMode }) => ServerProfile;
  updateProfile: (
    id: string,
    patch: Partial<Pick<ServerProfile, 'label' | 'host' | 'authMode'>>,
  ) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  getActiveProfile: () => ServerProfile | null;
}

let storage: StateStorage = resolveDefaultStorage(STORAGE_ID);

// Monotonic-ish id: timestamp + counter avoids a uuid dep and collisions within
// a session. Profiles are few and user-scoped, so this is ample.
let idCounter = 0;
function makeId(): string {
  return `srv_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

/** Strip protocol/trailing slashes for a tidy default label. */
function defaultLabel(host: string): string {
  return host.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '') || host.trim();
}

/** Same-host match is protocol/case/trailing-slash insensitive. */
function sameHost(a: string, b: string): boolean {
  const norm = (h: string) => h.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/+$/, '');
  return norm(a) === norm(b);
}

function persist(state: PersistedShape): void {
  storage.set(KEY_STATE, JSON.stringify(state));
}

function readInitial(): PersistedShape {
  const raw = storage.getString(KEY_STATE);
  if (!raw) return { profiles: [], activeProfileId: null };
  try {
    const parsed = JSON.parse(raw) as PersistedShape;
    const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const activeProfileId =
      typeof parsed?.activeProfileId === 'string' && profiles.some((p) => p.id === parsed.activeProfileId)
        ? parsed.activeProfileId
        : (profiles[0]?.id ?? null);
    return { profiles, activeProfileId };
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

export const useServerProfilesStore = create<ServerProfilesState>((set, get) => ({
  ...readInitial(),

  addProfile: ({ label, host, authMode = 'none' }) => {
    const existing = get().profiles.find((p) => sameHost(p.host, host));
    if (existing) return existing;
    const profile: ServerProfile = { id: makeId(), label: label?.trim() || defaultLabel(host), host: host.trim(), authMode };
    const profiles = [...get().profiles, profile];
    const activeProfileId = get().activeProfileId ?? profile.id;
    set({ profiles, activeProfileId });
    persist({ profiles, activeProfileId });
    return profile;
  },

  upsertByHost: ({ label, host, authMode }) => {
    const existing = get().profiles.find((p) => sameHost(p.host, host));
    if (existing) {
      const patch: Partial<ServerProfile> = {};
      if (label && label.trim()) patch.label = label.trim();
      if (authMode && authMode !== existing.authMode) patch.authMode = authMode;
      if (Object.keys(patch).length > 0) get().updateProfile(existing.id, patch);
      return get().profiles.find((p) => p.id === existing.id) ?? existing;
    }
    return get().addProfile({ label, host, authMode: authMode ?? 'none' });
  },

  updateProfile: (id, patch) => {
    const profiles = get().profiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
    set({ profiles });
    persist({ profiles, activeProfileId: get().activeProfileId });
  },

  removeProfile: (id) => {
    const profiles = get().profiles.filter((p) => p.id !== id);
    const activeProfileId = get().activeProfileId === id ? (profiles[0]?.id ?? null) : get().activeProfileId;
    set({ profiles, activeProfileId });
    persist({ profiles, activeProfileId });
  },

  setActiveProfile: (id) => {
    set({ activeProfileId: id });
    persist({ profiles: get().profiles, activeProfileId: id });
  },

  getActiveProfile: () => {
    const { profiles, activeProfileId } = get();
    return profiles.find((p) => p.id === activeProfileId) ?? null;
  },
}));

/**
 * One-time migration: if there are no saved profiles yet but a legacy single
 * `lastHost` exists, seed a profile from it and make it active. Idempotent — a
 * no-op once any profile exists. Returns the active profile after migration.
 */
export function migrateLegacyHost(lastHost: string | null): ServerProfile | null {
  const store = useServerProfilesStore.getState();
  if (store.profiles.length === 0 && lastHost && lastHost.trim()) {
    const profile = store.addProfile({ host: lastHost });
    store.setActiveProfile(profile.id);
    return profile;
  }
  return store.getActiveProfile();
}

/** Await before reading profiles on the AsyncStorage path. No-op for MMKV/memory. */
export async function hydrateServerProfiles(): Promise<void> {
  if (!storage.hydrate) return;
  await storage.hydrate();
  useServerProfilesStore.setState(readInitial());
}

/** Test seam: swap the storage backend and re-hydrate the store. */
export function __setServerProfilesStorage(next: StateStorage): void {
  storage = next;
  useServerProfilesStore.setState(readInitial());
}
