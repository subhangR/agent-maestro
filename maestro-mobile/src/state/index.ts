// PUBLIC @/state surface — the ONLY entry point other packages import. Internal
// modules (batchSet, client, fetchActions wiring details) stay private.
//
// Who imports what:
//   Pulse    → ingestBatch / ingestEvent / resyncProject, uiStore.setRealtimeStatus
//   Conduit  → (none; Ledger imports Conduit's client via setMaestroClient at boot)
//   Forge    → hooks + pure select* + optimisticPatch/rollback
//   Compass  → uiStore (activeProjectId/themeMode), prefsStore
//   App boot → setMaestroClient, hydratePrefs, fetchProjects

// ---- Stores ----
export { useEntityStore, batchSet, batchController, setLoading, setError, resetEntities, type EntityState } from './entityStore';
export {
  useUiStore,
  getActiveProjectId,
  type UiState,
  type RealtimeStatus,
} from './uiStore';
export { usePrefsStore, hydratePrefs, type PrefsState } from './prefsStore';
export {
  useServerProfilesStore,
  migrateLegacyHost,
  hydrateServerProfiles,
  type ServerProfile,
  type ServerProfilesState,
} from './serverProfilesStore';

// ---- Realtime → state seam (Pulse) ----
export { ingestEvent, ingestBatch, resyncProject } from './ingest';

// ---- REST client seam (app boot wires Conduit's MaestroClient) ----
export {
  setMaestroClient,
  getMaestroClient,
  hasMaestroClient,
  type MaestroClientApi,
  type GetSessionsOptions,
} from './client';

// ---- PTY transport seam (app boot wires Pulse's realtime.pty) ----
export {
  setPtyTransport,
  getPtyTransport,
  hasPtyTransport,
  type PtyClientApi,
  type PtyUnsubscribe,
  type PtySize,
} from './client';

// ---- Fetch actions (Forge / app boot) ----
export {
  fetchProjects,
  fetchTasks,
  fetchTask,
  fetchTaskLists,
  fetchTaskList,
  fetchSessions,
  fetchSession,
  fetchTeamMembers,
  fetchTeams,
  fetchModelProfiles,
  fetchTaskOrdering,
  fetchSessionOrdering,
  fetchTaskListOrdering,
} from './fetchActions';

// ---- Optimistic mutations (Forge inline edits) ----
export {
  optimisticPatch,
  rollback,
  clearOptimistic,
  applyOverrides,
  type OptimisticToken,
  type EntityMapKey,
} from './optimistic';

// ---- Persistence seam ----
export {
  type StateStorage,
  createMmkvStorage,
  createMemoryStorage,
  createAsyncStorageBackedStorage,
  resolveDefaultStorage,
} from './storage';

// ---- Pure selectors (testable) ----
export * from './selectors';

// ---- Reactive hooks + selector namespaces (Forge) ----
export * from './hooks';
