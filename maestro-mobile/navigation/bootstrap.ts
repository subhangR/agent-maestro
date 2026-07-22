// navigation/bootstrap.ts — the PRODUCTION bootstrapper (Compass).
//
// Productionizes __qa__/devharness/DevHarness.tsx's `connect()` into reusable
// async functions the connect screen + server switcher call. It wires Conduit's
// REST client into @/state, probes /health (learning the server's authMode),
// hydrates the entity store for the first project, then stands up the realtime
// sockets and pushes status into the UI store.
//
// MULTI-SERVER: a "server" is a saved ServerProfile (see serverProfilesStore).
// Same protocol/APIs everywhere; switching just re-points the app at another
// backend (separate data per server — no cross-server sync). Auth is auto-detected
// from GET /health `authMode`:
//   'none'     — open server; connect straight through (Tailscale/loopback).
//   'password' — exchange a password for a ?token= JWT.
//   'firebase' — the Hub/gateway; ride the Firebase ID token (owned by the Collab
//                firebaseAuth module; consumed here via the hubToken seam).
import {
  buildServerConfig,
  MaestroClient,
  MaestroApiError,
  login,
  AuthRequiredError,
  getTokenForAuthMode,
  ensureHubFirebaseToken,
  refreshHubFirebaseToken,
  hasHubFirebaseAuth,
  HubSignInRequiredError,
  type AuthMode,
} from '@/services/api';
import { createRealtime, type Realtime, type RealtimeLedger } from '@/services/realtime';
import {
  setMaestroClient,
  fetchProjects,
  fetchTasks,
  fetchSessions,
  fetchTeamMembers,
  fetchTeams,
  ingestBatch,
  ingestEvent,
  resyncProject,
  hydratePrefs,
  setPtyTransport,
  resetEntities,
  useEntityStore,
  useUiStore,
  usePrefsStore,
  useServerProfilesStore,
  migrateLegacyHost,
  hydrateServerProfiles,
  type ServerProfile,
} from '@/state';
import { asProjectId } from '@/domain';

/** Live handle stashed so a disconnect can stop realtime. */
let activeRealtime: Realtime | null = null;

/** True for an https URL carrying an explicit non-443 port — almost always a
 *  stale scheme on a plain-http dev server (so an http retry is worth a shot). */
function isHttpsNonStandardPort(serverUrl: string): boolean {
  try {
    const u = new URL(serverUrl);
    return u.protocol === 'https:' && u.port !== '' && u.port !== '443';
  } catch {
    return false;
  }
}

export interface BootstrapResult {
  /** The realtime handle (entity-sync + pty). Call `.stop()` to tear down. */
  realtime: Realtime;
  /** The first project's id that realtime + fetches were scoped to (may be null). */
  projectId: string | null;
  /** The auth mode detected from the server's /health during this connect. */
  authMode: AuthMode;
}

export interface BootstrapOptions {
  /** Password for a 'password'-authMode server (exchanged for a ?token= JWT). */
  password?: string;
  /** Hint from a saved profile; the live /health probe is authoritative. */
  authMode?: AuthMode;
}

/**
 * Connect to a maestro-server at the given `host` and bring the app online.
 * Throws on an unreachable host, a needed-but-missing password (AuthRequiredError),
 * or a needed-but-missing Firebase sign-in (HubSignInRequiredError).
 *
 * Sequence:
 *   buildServerConfig → probe /health (detect authMode + reachability, http retry)
 *   → satisfy auth (password login / firebase token) → new MaestroClient
 *   → setMaestroClient → guarded getProjects → fetch first project's entities
 *   → createRealtime({ getWsUrl, getPtyWsUrl, ledger }) → start()
 */
export async function bootstrap(host: string, opts: BootstrapOptions = {}): Promise<BootstrapResult> {
  // Tear down any prior realtime before re-connecting.
  if (activeRealtime) {
    activeRealtime.stop();
    activeRealtime = null;
  }
  // Wipe the previous host's entities so a reconnect to a DIFFERENT server starts
  // clean — fetch* merge into the store, so without this the old host's data lingers.
  resetEntities();

  // 1. Build ServerConfig from the host, then probe /health UNAUTHENTICATED to
  // learn reachability + authMode before we decide how to log in. Recover the
  // common footgun: a stale https:// scheme on a plain-http dev port — retry once
  // over http when the port isn't 443.
  let cfg = buildServerConfig(host);
  const probeClient = () => new MaestroClient(cfg);
  let probe = await probeClient().probeHealthInfo();
  if (!probe.ok && isHttpsNonStandardPort(cfg.serverUrl)) {
    cfg = buildServerConfig(host.replace(/^https:\/\//i, 'http://'));
    probe = await probeClient().probeHealthInfo();
  }
  if (!probe.ok) throw new Error('health probe returned false');
  // authMode/getToken are reassignable: a server whose /health didn't advertise
  // firebase (older gateway) can still be promoted to firebase on a 401 below.
  let authMode = probe.authMode;

  // 2. Satisfy auth for the detected mode BEFORE the first guarded call.
  if (authMode === 'password' && opts.password) {
    const token = await login(cfg.apiBaseUrl, opts.password);
    usePrefsStore.getState().setAuthToken(token);
  }
  if (authMode === 'firebase') {
    // Refresh/obtain a Firebase ID token (triggers Google sign-in when the
    // firebaseAuth module is wired; throws HubSignInRequiredError otherwise).
    await ensureHubFirebaseToken();
  }

  // 3. Build the real client with an authMode-aware token seam. 'firebase' reads
  // the Firebase token cache, 'password' the stored JWT, 'none' carries nothing.
  let getToken = getTokenForAuthMode(authMode, () => usePrefsStore.getState().authToken);
  let client = new MaestroClient(cfg, { getToken });
  setMaestroClient(client);
  const rebuildClient = () => {
    getToken = getTokenForAuthMode(authMode, () => usePrefsStore.getState().authToken);
    client = new MaestroClient(cfg, { getToken });
    setMaestroClient(client);
  };

  // 4. Guarded probe. A 401 means the credential is missing/stale:
  //    password → surface AuthRequiredError so the connect screen asks for one.
  //    firebase → force-refresh the token once and retry; else sign-in required.
  //    none/password + a live Firebase session → this is almost certainly a Hub
  //      whose /health didn't advertise 'firebase' (older gateway): attach the id
  //      token, retry AS firebase, and promote the profile's authMode on success.
  try {
    await client.getProjects();
  } catch (e) {
    if (!(e instanceof MaestroApiError) || e.status !== 401) throw e;

    if (authMode === 'firebase') {
      const refreshed = await refreshHubFirebaseToken(true);
      if (!refreshed) throw new HubSignInRequiredError();
      rebuildClient();
      try {
        await client.getProjects();
      } catch (e2) {
        if (e2 instanceof MaestroApiError && e2.status === 401) throw new HubSignInRequiredError();
        throw e2;
      }
    } else if (hasHubFirebaseAuth()) {
      // Try to obtain a Firebase token (signs in on demand). If the token is then
      // accepted, this backend is a Hub — lock the profile to 'firebase'. If it is
      // still rejected, or no token could be obtained, fall back to the password flow.
      let promoted = false;
      try {
        await ensureHubFirebaseToken();
        authMode = 'firebase';
        rebuildClient();
        await client.getProjects();
        promoted = true;
      } catch (e2) {
        authMode = probe.authMode; // revert; it wasn't a firebase hub
        rebuildClient();
      }
      if (!promoted) {
        usePrefsStore.getState().setAuthToken(null);
        throw new AuthRequiredError();
      }
    } else {
      usePrefsStore.getState().setAuthToken(null);
      throw new AuthRequiredError();
    }
  }

  // 5. REST fetch → populate the entity store. Projects first so project-scoped
  // fetches can target the first (or last-active) project.
  await fetchProjects();
  const projectIds = Object.keys(useEntityStore.getState().projects);
  const storedProject = usePrefsStore.getState().lastProjectId;
  const firstProject =
    (storedProject && projectIds.includes(storedProject) ? storedProject : projectIds[0]) ?? null;
  if (firstProject) {
    await Promise.all([
      fetchTasks(firstProject),
      fetchSessions({ projectId: firstProject }),
      fetchTeamMembers(firstProject),
      fetchTeams(firstProject),
    ]);
  } else {
    await fetchSessions();
  }

  // 6. Wire realtime (entity-sync WS + /pty). WS upgrades are gated separately
  // from REST, so the token rides as ?token= here too — read at call time so
  // reconnects pick up a refreshed token (password JWT or Firebase ID token).
  const withWsToken = (wsUrl: string): string => {
    const token = getToken();
    if (!token) return wsUrl;
    return `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  };
  const ledger: RealtimeLedger = { ingestBatch, ingestEvent, resyncProject };
  const rt = createRealtime({
    getWsUrl: () => withWsToken(cfg.wsUrl),
    getPtyWsUrl: () => withWsToken(cfg.ptyWsUrl),
    ledger,
  });
  activeRealtime = rt;
  setPtyTransport(rt.pty);

  rt.entitySync.onStatus((s) =>
    useUiStore.getState().setRealtimeStatus(s === 'idle' ? 'disconnected' : s),
  );
  const projectId = firstProject ? asProjectId(firstProject) : null;
  useUiStore.getState().setActiveProject(projectId);
  usePrefsStore.getState().setLastProjectId(firstProject);
  rt.entitySync.setActiveProject(projectId);
  rt.start();

  return { realtime: rt, projectId: firstProject, authMode };
}

/**
 * Add a server by host (or reuse an existing profile with the same host), connect
 * to it, and record the detected authMode. On success the profile is upserted +
 * made active and `lastHost` is persisted. Returns the connect result + profile.
 */
export async function addServerAndConnect(
  host: string,
  opts: { password?: string; label?: string } = {},
): Promise<{ result: BootstrapResult; profile: ServerProfile }> {
  const result = await bootstrap(host, { password: opts.password });
  const store = useServerProfilesStore.getState();
  const profile = store.upsertByHost({ host, label: opts.label, authMode: result.authMode });
  store.setActiveProfile(profile.id);
  usePrefsStore.getState().setLastHost(host);
  return { result, profile };
}

/**
 * Switch to a saved profile: connect to it (tearing down the current connection),
 * refresh its detected authMode, make it active, and persist `lastHost`.
 */
export async function switchToProfile(id: string): Promise<BootstrapResult> {
  const store = useServerProfilesStore.getState();
  const profile = store.profiles.find((p) => p.id === id);
  if (!profile) throw new Error(`unknown server profile: ${id}`);
  const result = await bootstrap(profile.host, { authMode: profile.authMode });
  if (result.authMode !== profile.authMode) {
    store.updateProfile(profile.id, { authMode: result.authMode });
  }
  store.setActiveProfile(profile.id);
  usePrefsStore.getState().setLastHost(profile.host);
  return result;
}

/**
 * Boot-time auto-reconnect. Hydrates prefs + server profiles, migrates a legacy
 * single `lastHost` into a profile if needed, and reconnects to the active
 * profile. Returns true if a connection was established; false when there's no
 * saved server OR the active one is unreachable (falls back to the connect screen
 * rather than throwing).
 */
export async function bootstrapFromStoredHost(): Promise<boolean> {
  await hydratePrefs();
  await hydrateServerProfiles();
  const active = migrateLegacyHost(usePrefsStore.getState().lastHost);
  if (!active) return false;
  try {
    await bootstrap(active.host, { authMode: active.authMode });
    useServerProfilesStore.getState().setActiveProfile(active.id);
    usePrefsStore.getState().setLastHost(active.host);
    return true;
  } catch {
    return false;
  }
}

/** Tear down the live realtime connection (used by a disconnect flow). */
export function teardown(): void {
  activeRealtime?.stop();
  activeRealtime = null;
  setPtyTransport(null);
  // Drop the disconnected host's data + active project so the next connect (to the
  // same or a different server) doesn't show stale entities from the old host.
  resetEntities();
  useUiStore.getState().setActiveProject(null);
  useUiStore.getState().setRealtimeStatus('disconnected');
}

/** The current realtime handle, or null when disconnected. */
export function getRealtime(): Realtime | null {
  return activeRealtime;
}

/** Whether a live realtime connection is currently established. */
export function isConnected(): boolean {
  return activeRealtime != null;
}
