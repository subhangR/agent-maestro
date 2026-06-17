// The REST seam. Ledger's fetch-actions call the server through this
// consumer-defined interface — NOT a hard import of Conduit's MaestroClient.
// This is dependency inversion: I declare exactly the read methods I need; the
// app-boot wiring injects Conduit's `@/services/api` MaestroClient (which
// satisfies this surface, directly or via a thin adapter). Keeps my tsc green
// regardless of Conduit's build progress, and keeps `state` from importing
// `services/api` at module scope (acyclic boundary).
//
// v1 = NO AUTH: the injected client carries no token; nothing here knows about
// auth. All types come from @/domain (single source of truth).
import type {
  Project,
  Task,
  TaskList,
  Session,
  TeamMember,
  Team,
  ModelProfile,
  Ordering,
} from '@/domain';

export interface GetSessionsOptions {
  taskId?: string;
  projectId?: string;
  /** Mobile defaults LIST fetches to 'summary' to cut data; detail uses 'full'. */
  fields?: 'summary' | 'full';
}

/** The exact read surface Ledger consumes. Conduit's MaestroClient implements it. */
export interface MaestroClientApi {
  getProjects(): Promise<Project[]>;
  getTasks(projectId: string): Promise<Task[]>;
  getTask(taskId: string): Promise<Task>;
  getTaskLists(projectId: string): Promise<TaskList[]>;
  getTaskList(listId: string): Promise<TaskList>;
  getSessions(opts?: GetSessionsOptions): Promise<Session[]>;
  getSession(sessionId: string): Promise<Session>;
  getTeamMembers(projectId: string): Promise<TeamMember[]>;
  getTeams(projectId: string): Promise<Team[]>;
  getModelProfiles(): Promise<ModelProfile[]>;
  getOrdering(projectId: string, entityType: 'task' | 'session'): Promise<Ordering>;
  getTaskListOrdering(projectId: string): Promise<Ordering>;
}

let client: MaestroClientApi | null = null;

/** App-boot wiring injects the configured MaestroClient (re-injected on host change). */
export function setMaestroClient(next: MaestroClientApi | null): void {
  client = next;
}

/**
 * Get the active client. Throws a clear error if a fetch action runs before the
 * client is wired (a boot-order bug) rather than a confusing null deref.
 */
export function getMaestroClient(): MaestroClientApi {
  if (!client) {
    throw new Error('[state] MaestroClient not set — call setMaestroClient() at app boot before fetching.');
  }
  return client;
}

/** Whether a client has been wired (lets callers no-op a resync pre-connect). */
export function hasMaestroClient(): boolean {
  return client != null;
}
