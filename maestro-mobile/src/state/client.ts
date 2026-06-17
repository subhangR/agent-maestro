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
  TaskGraph,
  Session,
  SessionId,
  TeamMember,
  Team,
  ModelProfile,
  Ordering,
  // REST payloads + response envelopes (mirrors Conduit's MaestroClient signatures)
  CreateTaskPayload,
  UpdateTaskPayload,
  CreateTaskListPayload,
  UpdateTaskListPayload,
  CreateTaskGraphPayload,
  UpdateTaskGraphPayload,
  CreateTeamMemberPayload,
  UpdateTeamMemberPayload,
  CreateSessionPayload,
  UpdateSessionPayload,
  SpawnSessionResponse,
  SpellInvocationPayload,
} from '@/domain';
import type { SpawnSessionRequest } from '@/domain/schemas/spawn';

export interface GetSessionsOptions {
  taskId?: string;
  projectId?: string;
  /** Mobile defaults LIST fetches to 'summary' to cut data; detail uses 'full'. */
  fields?: 'summary' | 'full';
}

/**
 * The exact read + write surface Ledger consumes. Conduit's MaestroClient
 * implements it (structurally — it has these plus more). Signatures mirror
 * `@/services/api/http/MaestroClient` 1:1 so the concrete client satisfies this
 * interface with no adapter; Forge mutates through Ledger's fetch/mutate actions
 * which call here, never importing `services/api`.
 */
export interface MaestroClientApi {
  // ---- Reads ----
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

  // ---- Tasks (write) ----
  createTask(data: CreateTaskPayload): Promise<Task>;
  updateTask(id: string, updates: UpdateTaskPayload): Promise<Task>;
  deleteTask(id: string): Promise<{ success: boolean }>;

  // ---- Task lists (write) ----
  createTaskList(data: CreateTaskListPayload): Promise<TaskList>;
  updateTaskList(id: string, updates: UpdateTaskListPayload): Promise<TaskList>;
  deleteTaskList(id: string): Promise<{ success: boolean }>;
  addTaskToList(listId: string, taskId: string): Promise<TaskList>;
  removeTaskFromList(listId: string, taskId: string): Promise<TaskList>;
  reorderTaskListTasks(listId: string, orderedTaskIds: string[]): Promise<TaskList>;

  // ---- Task graphs (write) ----
  createTaskGraph(data: CreateTaskGraphPayload): Promise<TaskGraph>;
  updateTaskGraph(id: string, updates: UpdateTaskGraphPayload): Promise<TaskGraph>;
  deleteTaskGraph(id: string): Promise<{ success: boolean }>;
  validateTaskGraph(
    id: string,
  ): Promise<{ valid: boolean; errors: string[]; topologicalOrder?: string[]; parallelLayers?: string[][] }>;

  // ---- Team members (write) ----
  createTeamMember(data: CreateTeamMemberPayload): Promise<TeamMember>;
  updateTeamMember(id: string, projectId: string, updates: UpdateTeamMemberPayload): Promise<TeamMember>;
  deleteTeamMember(id: string, projectId: string): Promise<void>;
  archiveTeamMember(id: string, projectId: string): Promise<void>;
  unarchiveTeamMember(id: string, projectId: string): Promise<void>;

  // ---- Sessions (write + spawn) ----
  createSession(data: CreateSessionPayload): Promise<Session>;
  updateSession(id: string, updates: UpdateSessionPayload): Promise<Session>;
  deleteSession(id: string): Promise<{ success: boolean }>;
  spawnSession(data: SpawnSessionRequest, opts?: { validate?: boolean }): Promise<SpawnSessionResponse>;

  // ---- Spells (reply-to-agent etc.) ----
  invokeSpell(invocation: SpellInvocationPayload): Promise<void>;
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

// ---------------------------------------------------------------------------
// PTY transport seam (same dependency-inversion as the REST client above)
// ---------------------------------------------------------------------------
//
// Forge's terminal screens drive the PTY through this consumer-defined surface
// rather than importing `@/services/realtime` (keeps the acyclic boundary —
// `state` never imports `services`). Compass's bootstrapper injects the concrete
// `realtime.pty` (a PtyTransport) via setPtyTransport() at boot; it satisfies
// this structurally. Mirrors services/realtime PtyTransport 1:1.

/** Unsubscribe handle returned by the PTY event subscriptions. */
export type PtyUnsubscribe = () => void;

/** Server-announced terminal size for a session. */
export interface PtySize {
  cols: number;
  rows: number;
}

/** The slice of the realtime PTY transport Ledger/Forge consume. */
export interface PtyClientApi {
  /** Open (or reuse) the socket for a session. Idempotent. */
  attach(id: SessionId): void;
  /** Close the socket. The server PTY keeps running and is re-attachable. */
  detach(id: SessionId): void;
  /** Send raw keystroke bytes (UTF-8 text and/or control sequences). */
  write(id: SessionId, bytes: Uint8Array): void;
  /** Send a resize control frame. Queued if the socket isn't open yet. */
  resize(id: SessionId, cols: number, rows: number): void;
  /** Pre-decoded terminal output for this session. */
  onOutput(id: SessionId, handler: (text: string) => void): PtyUnsubscribe;
  /** Server-announced terminal size for this session. */
  onSize(id: SessionId, handler: (size: PtySize) => void): PtyUnsubscribe;
  /** Process exit (real exit frame) or `null` (1011 = no live PTY / needs resume). */
  onExit(id: SessionId, handler: (code: number | null) => void): PtyUnsubscribe;
}

let ptyTransport: PtyClientApi | null = null;

/** App-boot wiring injects the realtime PTY transport (re-injected on host change). */
export function setPtyTransport(next: PtyClientApi | null): void {
  ptyTransport = next;
}

/**
 * Get the active PTY transport. Throws a clear error if a terminal action runs
 * before realtime is wired (a boot-order bug) rather than a confusing null deref.
 */
export function getPtyTransport(): PtyClientApi {
  if (!ptyTransport) {
    throw new Error('PtyTransport not set — call setPtyTransport() at app boot');
  }
  return ptyTransport;
}

/** Whether a PTY transport has been wired (lets callers no-op pre-connect). */
export function hasPtyTransport(): boolean {
  return ptyTransport != null;
}
