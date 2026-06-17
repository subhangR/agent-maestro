// navigation/bootstrap.ts — the PRODUCTION bootstrapper (Compass).
//
// Productionizes __qa__/devharness/DevHarness.tsx's `connect()` into a single
// reusable async function the connect screen calls on submit. It wires Conduit's
// REST client into @/state, probes /health, hydrates the entity store for the
// first project, then stands up the realtime sockets and pushes status into the
// UI store. The returned handle lets the connect/disconnect flow tear realtime
// down. v1 is NO AUTH — bare host:port, nothing else.
import { buildServerConfig, MaestroClient } from '@/services/api';
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
  useEntityStore,
  useUiStore,
  usePrefsStore,
} from '@/state';
import { asProjectId } from '@/domain';

/** Live handle stashed so a disconnect can stop realtime. */
let activeRealtime: Realtime | null = null;

export interface BootstrapResult {
  /** The realtime handle (entity-sync + pty). Call `.stop()` to tear down. */
  realtime: Realtime;
  /** The first project's id that realtime + fetches were scoped to (may be null). */
  projectId: string | null;
}

/**
 * Connect to a maestro-server at the given bare `host:port` and bring the app
 * online. Throws if the health probe fails (caller shows the error).
 *
 * Sequence (mirrors DevHarness.connect exactly):
 *   buildServerConfig → new MaestroClient → setMaestroClient → probeHealth
 *   → fetchProjects → (first project) fetchTasks/Sessions/TeamMembers/Teams
 *   → createRealtime({ getWsUrl, getPtyWsUrl, ledger })
 *   → entitySync.onStatus(→ uiStore.setRealtimeStatus)
 *   → entitySync.setActiveProject → start()
 */
export async function bootstrap(host: string): Promise<BootstrapResult> {
  // Tear down any prior realtime before re-connecting.
  if (activeRealtime) {
    activeRealtime.stop();
    activeRealtime = null;
  }

  // 1. Build ServerConfig from the bare host:port the user typed.
  const cfg = buildServerConfig(host);

  // 2. Instantiate the real client + wire it into @/state.
  const client = new MaestroClient(cfg);
  setMaestroClient(client);

  // 3. GET {serverUrl}/health first — the boot gate.
  const ok = await client.probeHealth();
  if (!ok) throw new Error('health probe returned false');

  // 4. REST fetch → populates the entity store. Projects first so we can scope
  // the project-scoped fetches to the first project.
  await fetchProjects();
  // Prefer the last active project (restored from prefs on cold boot); fall back
  // to the first project when there's no stored choice or it's gone on this host.
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

  // 5. Wire realtime (entity-sync WS + /pty) against the SAME config. The ledger
  // is the realtime→state seam (Pulse's ingest functions).
  const ledger: RealtimeLedger = { ingestBatch, ingestEvent, resyncProject };
  const rt = createRealtime({
    getWsUrl: () => cfg.wsUrl,
    getPtyWsUrl: () => cfg.ptyWsUrl,
    ledger,
  });
  activeRealtime = rt;
  // Expose the pty transport to @/state so getPtyTransport() (reply-to-agent)
  // resolves. `rt.pty` structurally satisfies the PtyClientApi seam (Wave 1).
  setPtyTransport(rt.pty);

  // Push realtime status into the UI store (Forge reads `connected`). The
  // realtime layer has an extra 'idle' state the UI store doesn't model — map it
  // to 'disconnected' (no live socket yet).
  rt.entitySync.onStatus((s) =>
    useUiStore.getState().setRealtimeStatus(s === 'idle' ? 'disconnected' : s),
  );
  // Scope entity-sync (and the active project for resync) to the first project.
  const projectId = firstProject ? asProjectId(firstProject) : null;
  useUiStore.getState().setActiveProject(projectId);
  usePrefsStore.getState().setLastProjectId(firstProject);
  rt.entitySync.setActiveProject(projectId);
  rt.start();

  return { realtime: rt, projectId: firstProject };
}

/**
 * Boot-time auto-reconnect. Hydrates prefs (AsyncStorage path), reads the last
 * host, and reconnects if present. Returns true if a connection was established;
 * false when there's no stored host OR the stored host is unreachable (a stale
 * host falls back to the connect screen rather than throwing). The boot gate
 * (app/index.tsx) uses this to decide tabs vs. the connect screen.
 */
export async function bootstrapFromStoredHost(): Promise<boolean> {
  await hydratePrefs();
  const host = usePrefsStore.getState().lastHost;
  if (!host) return false;
  try {
    await bootstrap(host);
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
