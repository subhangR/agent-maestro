// THE single normalized entity store — the only set() writer in the app.
// Mirrors maestro-ui's useMaestroStore shape: one Zustand 5 store holding every
// server entity as a Record<BrandedId, Entity> map, plus per-project ordering
// id-arrays and op-keyed loading/error flags.
//
// Design notes:
//   - Branded-id-keyed maps (Record<SessionId, Session>, …) — O(1) upsert/delete,
//     trivial last-writer-wins, reference-stable reads for untouched entities.
//   - The store CREATOR holds pure state only. All mutations live in sibling
//     modules (ingest/fetchActions/optimistic) that call useEntityStore.setState
//     or the exported `batchSet`. There is exactly ONE store, so Pulse's single
//     ingestBatch coalesces a mixed-entity flush into ONE render pass.
//   - `useSessionStore`/`useTaskStore` (see ./selectors) are selector NAMESPACES
//     over THIS store — not separate stores.
import { create } from 'zustand';
import type {
  Project,
  Task,
  TaskList,
  Session,
  TeamMember,
  Team,
  ModelProfile,
  TaskGraph,
  CustomPrompt,
  ProjectId,
  TaskId,
  TaskListId,
  SessionId,
  TeamMemberId,
  TeamId,
  ModelProfileId,
  TaskGraphId,
  CustomPromptId,
} from '@/domain';
import { createBatchSet } from './batchSet';

export interface EntityState {
  projects: Record<ProjectId, Project>;
  tasks: Record<TaskId, Task>;
  taskLists: Record<TaskListId, TaskList>;
  sessions: Record<SessionId, Session>;
  teamMembers: Record<TeamMemberId, TeamMember>;
  teams: Record<TeamId, Team>;
  modelProfiles: Record<ModelProfileId, ModelProfile>;
  taskGraphs: Record<TaskGraphId, TaskGraph>;
  customPrompts: Record<CustomPromptId, CustomPrompt>;

  // Per-project ordering — the canonical list source for screens (iterate the
  // ordered id-array, pull entities by id with atomic selectors).
  taskOrdering: Record<ProjectId, TaskId[]>;
  sessionOrdering: Record<ProjectId, SessionId[]>;
  taskListOrdering: Record<ProjectId, TaskListId[]>;

  // Ephemeral op flags, keyed by operation (e.g. "tasks", "sessions:spawn").
  loading: Record<string, boolean>;
  errors: Record<string, string>;
}

function makeInitialState(): EntityState {
  return {
    projects: {},
    tasks: {},
    taskLists: {},
    sessions: {},
    teamMembers: {},
    teams: {},
    modelProfiles: {},
    taskGraphs: {},
    customPrompts: {},
    taskOrdering: {},
    sessionOrdering: {},
    taskListOrdering: {},
    loading: {},
    errors: {},
  };
}

export const useEntityStore = create<EntityState>(() => makeInitialState());

// ---------------------------------------------------------------------------
// The ONE batchSet bound to this store. Pulse/Conduit never call set directly;
// they call actions (ingest/fetch) which use this.
// ---------------------------------------------------------------------------

const controller = createBatchSet<EntityState>((updater) => useEntityStore.setState(updater));

export const batchSet = controller.batchSet;
/** Test/diagnostic access to the coalescer (flush / pendingCount). */
export const batchController = controller;

// ---------------------------------------------------------------------------
// loading / errors helpers (ported setLoading/setError) — low-frequency, direct
// set (not batched). No-ops return `prev` so subscribers don't churn.
// ---------------------------------------------------------------------------

export function setLoading(key: string, isLoading: boolean): void {
  useEntityStore.setState((prev): Partial<EntityState> => {
    if (isLoading === !!prev.loading[key]) return prev;
    if (isLoading) return { loading: { ...prev.loading, [key]: true } };
    const { [key]: _omit, ...rest } = prev.loading;
    return { loading: rest };
  });
}

export function setError(key: string, error: string | null): void {
  useEntityStore.setState((prev) => {
    if (!error && !prev.errors[key]) return prev;
    if (error) return { errors: { ...prev.errors, [key]: error } };
    const { [key]: _omit, ...rest } = prev.errors;
    return { errors: rest };
  });
}

/** Wipe all entity state (e.g. on host change). Fresh empty maps each call. */
export function resetEntities(): void {
  useEntityStore.setState(makeInitialState(), true);
}
