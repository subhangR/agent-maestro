// Maestro REST client — a thin native-fetch wrapper, ported 1:1 from
// maestro-ui's utils/MaestroClient.ts and re-typed against @/domain contracts.
//
// v1 = NO AUTH (CONVENTIONS §3): no Authorization header, no cookie, no
// ?token=. `getToken()` is an injectable future seam that returns null today;
// when auth lands it returns the stored token and withToken() appends ?token=
// (the server reads the cookie + ?token=, NEVER Authorization: Bearer).
//
// The client is DI'd `(config, opts)` so it is testable and re-creatable when
// the user changes server host (Ledger rebuilds ServerConfig → new client).

import type {
  Project,
  Ordering,
  Task,
  TaskImage,
  DocEntry,
  Session,
  TeamMember,
  Team,
  TeamTreeNode,
  TaskList,
  TaskGraph,
  ModelProfile,
  SpellDefinition,
  SpellEntity,
  SpellInvocationPayload,
  CustomPrompt,
  SessionPrompt,
  Huddle,
  SpellEntityType,
  // REST payloads + response envelopes
  CreateTaskPayload,
  UpdateTaskPayload,
  CreateTaskListPayload,
  UpdateTaskListPayload,
  CreateTaskGraphPayload,
  UpdateTaskGraphPayload,
  CreateSessionPayload,
  UpdateSessionPayload,
  SpawnSessionResponse,
  CreateTeamMemberPayload,
  UpdateTeamMemberPayload,
  CreateModelProfilePayload,
  UpdateModelProfilePayload,
  CreateTeamPayload,
  UpdateTeamPayload,
  CreateCustomPromptPayload,
  UpdateCustomPromptPayload,
  GitPrInfo,
  GitStatusResponse,
  GitCapabilities,
  WorkflowTemplate,
  ClaudeCodeSkill,
  SessionCommandUsage,
  SessionStatsResponse,
} from '@/domain';
import { spawnSessionRequestSchema, type SpawnSessionRequest } from '@/domain/schemas/spawn';

import type { ServerConfig } from '../config/serverConfig';
import { DEFAULT_TIMEOUT_MS, HEALTH_PATH } from '../constants';
import { MaestroApiError, TimeoutError, NetworkError } from './errors';
import { buildQuery } from './buildQuery';

export interface MaestroClientOptions {
  /** FUTURE SEAM (v1 returns null): provides the auth token appended as ?token=. */
  getToken?: () => string | null;
  /** Per-request timeout in ms (default 20s). */
  timeoutMs?: number;
}

/** RN image upload body (no browser File API — caller supplies base64). */
export interface UploadTaskImageBody {
  filename: string;
  /** Raw base64 (no `data:` prefix). */
  data: string;
  mimeType: string;
}

/** RN diagram injection body (no browser Blob — caller supplies base64 PNG). */
export interface InjectDiagramBody {
  /** Raw base64 PNG (no `data:` prefix). */
  pngBase64: string;
  /** Excalidraw scene JSON string. */
  sceneJson: string;
  name?: string;
}

export class MaestroClient {
  private readonly config: ServerConfig;
  private readonly getToken: () => string | null;
  private readonly timeoutMs: number;

  constructor(config: ServerConfig, opts: MaestroClientOptions = {}) {
    this.config = config;
    this.getToken = opts.getToken ?? (() => null);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** The config this client was built with (host display, ws urls for Pulse). */
  get serverConfig(): ServerConfig {
    return this.config;
  }

  /** Append ?token= LAST so it composes with any existing query. Inert in v1. */
  private withToken(url: string, token: string | null): string {
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }

  /** Generic fetch wrapper: timeout, no-auth, normalized errors, 204/empty handling. */
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = this.getToken(); // FUTURE SEAM; null in v1
    const url = this.withToken(`${this.config.apiBaseUrl}${endpoint}`, token);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers ?? {}),
        },
        // No `credentials`, no Cookie, no Authorization — v1 talks to an open server.
      });

      if (!res.ok) throw await MaestroApiError.fromResponse(res);
      if (res.status === 204) return undefined as T;

      const text = await res.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (e) {
      if (e instanceof MaestroApiError) throw e;
      if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') {
        throw new TimeoutError(endpoint);
      }
      throw new NetworkError(endpoint, e);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Unauthenticated health probe (GET {serverUrl}/health, outside /api) used to
   * validate a host before saving it. Returns true on a 2xx, false otherwise.
   */
  async probeHealth(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.config.serverUrl}${HEALTH_PATH}`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // ==================== PROJECTS ====================

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects');
  }

  async getProject(id: string): Promise<Project> {
    return this.request<Project>(`/projects/${id}`);
  }

  async createProject(data: {
    name: string;
    workingDir?: string;
    description?: string;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProject(
    id: string,
    data: { name?: string; workingDir?: string; description?: string; createdAt?: number; updatedAt?: number },
  ): Promise<Project> {
    return this.request<Project>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<{ success: boolean; id: string }> {
    return this.request<{ success: boolean; id: string }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  async setProjectMaster(projectId: string, isMaster: boolean): Promise<Project> {
    return this.request<Project>(`/projects/${projectId}/master`, {
      method: 'PUT',
      body: JSON.stringify({ isMaster }),
    });
  }

  // ==================== TASKS ====================

  async getTasks(projectId?: string): Promise<Task[]> {
    return this.request<Task[]>(`/tasks${buildQuery({ projectId })}`);
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/tasks/${id}`);
  }

  async createTask(data: CreateTaskPayload): Promise<Task> {
    return this.request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(id: string, updates: UpdateTaskPayload): Promise<Task> {
    return this.request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteTask(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' });
  }

  async getTaskChildren(taskId: string): Promise<Task[]> {
    return this.request<Task[]>(`/tasks/${taskId}/children`);
  }

  // ==================== TASK LISTS ====================

  async getTaskLists(projectId: string): Promise<TaskList[]> {
    return this.request<TaskList[]>(`/task-lists${buildQuery({ projectId })}`);
  }

  async getTaskList(id: string): Promise<TaskList> {
    return this.request<TaskList>(`/task-lists/${id}`);
  }

  async createTaskList(data: CreateTaskListPayload): Promise<TaskList> {
    return this.request<TaskList>('/task-lists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTaskList(id: string, updates: UpdateTaskListPayload): Promise<TaskList> {
    return this.request<TaskList>(`/task-lists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteTaskList(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/task-lists/${id}`, { method: 'DELETE' });
  }

  async addTaskToList(listId: string, taskId: string): Promise<TaskList> {
    return this.request<TaskList>(`/task-lists/${listId}/tasks/${taskId}`, { method: 'POST' });
  }

  async removeTaskFromList(listId: string, taskId: string): Promise<TaskList> {
    return this.request<TaskList>(`/task-lists/${listId}/tasks/${taskId}`, { method: 'DELETE' });
  }

  async reorderTaskListTasks(listId: string, orderedTaskIds: string[]): Promise<TaskList> {
    return this.request<TaskList>(`/task-lists/${listId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ orderedTaskIds }),
    });
  }

  // ==================== TASK GRAPHS ====================

  async fetchTaskGraphs(projectId: string): Promise<TaskGraph[]> {
    return this.request<TaskGraph[]>(`/task-graphs${buildQuery({ projectId })}`);
  }

  async fetchTaskGraph(id: string): Promise<TaskGraph> {
    return this.request<TaskGraph>(`/task-graphs/${id}`);
  }

  async createTaskGraph(data: CreateTaskGraphPayload): Promise<TaskGraph> {
    return this.request<TaskGraph>('/task-graphs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTaskGraph(id: string, updates: UpdateTaskGraphPayload): Promise<TaskGraph> {
    return this.request<TaskGraph>(`/task-graphs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteTaskGraph(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/task-graphs/${id}`, { method: 'DELETE' });
  }

  async validateTaskGraph(
    id: string,
  ): Promise<{ valid: boolean; errors: string[]; topologicalOrder?: string[]; parallelLayers?: string[][] }> {
    return this.request(`/task-graphs/${id}/validate`, { method: 'POST' });
  }

  // ==================== ORDERING ====================

  async getOrdering(projectId: string, entityType: 'task' | 'session'): Promise<Ordering> {
    return this.request<Ordering>(`/ordering/${entityType}/${encodeURIComponent(projectId)}`);
  }

  async saveOrdering(
    projectId: string,
    entityType: 'task' | 'session',
    orderedIds: string[],
  ): Promise<Ordering> {
    return this.request<Ordering>(`/ordering/${entityType}/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  }

  async getTaskListOrdering(projectId: string): Promise<Ordering> {
    return this.request<Ordering>(`/ordering/task-list/${encodeURIComponent(projectId)}`);
  }

  async saveTaskListOrdering(projectId: string, orderedIds: string[]): Promise<Ordering> {
    return this.request<Ordering>(`/ordering/task-list/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      body: JSON.stringify({ orderedIds }),
    });
  }

  // ==================== SESSIONS ====================

  /**
   * List sessions. Ledger defaults list fetches to `fields:'summary'` (lighter
   * mobile payload) with a merge-guard so a summary can't clobber a populated
   * session; detail screens pass `fields:'full'`.
   */
  async getSessions(
    opts: { taskId?: string; projectId?: string; fields?: 'summary' | 'full' } = {},
  ): Promise<Session[]> {
    return this.request<Session[]>(
      `/sessions${buildQuery({ taskId: opts.taskId, projectId: opts.projectId, fields: opts.fields })}`,
    );
  }

  async getSession(id: string): Promise<Session> {
    return this.request<Session>(`/sessions/${id}`);
  }

  async createSession(data: CreateSessionPayload): Promise<Session> {
    return this.request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSession(id: string, updates: UpdateSessionPayload): Promise<Session> {
    return this.request<Session>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteSession(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/sessions/${id}`, { method: 'DELETE' });
  }

  /**
   * Explicitly terminate a session's server-hosted PTY (MAESTRO_PTY_HOST=server).
   * Unlike closing the /pty socket — which only detaches — this kills the process
   * and marks the session stopped.
   */
  async stopSessionPty(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/sessions/${id}/pty/stop`, { method: 'POST' });
  }

  async addTaskToSession(sessionId: string, taskId: string): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}/tasks/${taskId}`, { method: 'POST' });
  }

  async removeTaskFromSession(sessionId: string, taskId: string): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}/tasks/${taskId}`, { method: 'DELETE' });
  }

  /**
   * Spawn a session. The caller supplies measured `cols`/`rows` (Relay measures —
   * CONVENTIONS §8); spawnSource is forced to 'ui' (mobile cannot send the
   * X-Session-Id coordinator header → 'session' would 403). Optionally validates
   * the outbound body against the server's .strict() schema first, turning the
   * server's opaque 400 into a precise client-side error.
   */
  async spawnSession(
    data: SpawnSessionRequest,
    opts: { validate?: boolean } = {},
  ): Promise<SpawnSessionResponse> {
    const body = { ...data, spawnSource: 'ui' as const };
    const payload = opts.validate ? spawnSessionRequestSchema.parse(body) : body;
    return this.request<SpawnSessionResponse>('/sessions/spawn', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async resumeSession(
    sessionId: string,
    size?: { cols?: number; rows?: number },
  ): Promise<{ success: boolean; sessionId: string; claudeSessionId: string }> {
    return this.request(`/sessions/${sessionId}/resume`, {
      method: 'POST',
      body: JSON.stringify(size ?? {}),
    });
  }

  async addSessionTimelineEvent(
    sessionId: string,
    event: { type: string; message?: string; taskId?: string; metadata?: Record<string, unknown> },
  ): Promise<Session> {
    return this.request<Session>(`/sessions/${sessionId}/timeline`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  /** Comprehensive session stats (tokens, message/tool counts, last N transcript messages). */
  async getSessionStats(
    sessionId: string,
    opts: { lastMessages?: number } = {},
  ): Promise<SessionStatsResponse> {
    return this.request<SessionStatsResponse>(
      `/sessions/${sessionId}/stats${buildQuery({ lastMessages: opts.lastMessages })}`,
    );
  }

  async getSessionPrompts(sessionId: string): Promise<SessionPrompt[]> {
    return this.request<SessionPrompt[]>(`/sessions/${encodeURIComponent(sessionId)}/prompts`);
  }

  async getSessionCommandUsage(sessionId: string): Promise<SessionCommandUsage> {
    return this.request<SessionCommandUsage>(`/sessions/${encodeURIComponent(sessionId)}/command-usage`);
  }

  /** Cross-project huddles — disjoint sets of sessions that have prompted each other. */
  async getHuddles(): Promise<Huddle[]> {
    return this.request<Huddle[]>('/huddles');
  }

  // ==================== DOCS ====================

  async getSessionDocs(sessionId: string): Promise<DocEntry[]> {
    return this.request<DocEntry[]>(`/sessions/${sessionId}/docs`);
  }

  async getTaskDocs(taskId: string): Promise<DocEntry[]> {
    return this.request<DocEntry[]>(`/tasks/${taskId}/docs`);
  }

  async addSessionDoc(
    sessionId: string,
    title: string,
    content: string,
    kind?: 'markdown' | 'diagram',
  ): Promise<DocEntry> {
    const ext = kind === 'diagram' ? '.excalidraw' : '.md';
    const filePath = `${title.replace(/[^a-z0-9_\-]/gi, '_')}${ext}`;
    return this.request<DocEntry>(`/sessions/${sessionId}/docs`, {
      method: 'POST',
      body: JSON.stringify({ title, filePath, content, kind }),
    });
  }

  async addTaskDoc(
    taskId: string,
    sessionId: string,
    title: string,
    content: string,
    kind?: 'markdown' | 'diagram',
  ): Promise<DocEntry> {
    const ext = kind === 'diagram' ? '.excalidraw' : '.md';
    const filePath = `${title.replace(/[^a-z0-9_\-]/gi, '_')}${ext}`;
    return this.request<DocEntry>(`/tasks/${taskId}/docs`, {
      method: 'POST',
      body: JSON.stringify({ title, filePath, content, sessionId, kind }),
    });
  }

  async updateDocContent(sessionId: string, docId: string, content: string): Promise<DocEntry> {
    return this.request<DocEntry>(`/sessions/${sessionId}/docs/${docId}/content`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async getProjectDocs(projectId: string): Promise<DocEntry[]> {
    return this.request<DocEntry[]>(`/projects/${projectId}/docs`);
  }

  async getProjectDocsPaginated(
    projectId: string,
    kind: 'markdown' | 'diagram',
    limit: number,
    offset: number,
  ): Promise<{
    data: DocEntry[];
    pagination: { offset: number; limit: number; total: number; hasMore: boolean };
  }> {
    return this.request(`/projects/${projectId}/docs${buildQuery({ kind, limit, offset })}`);
  }

  // ==================== TASK IMAGES ====================

  /**
   * Upload an image to a task. RN has no browser File API, so the caller supplies
   * base64 directly (e.g. from expo-image-picker base64 output).
   */
  async uploadTaskImage(taskId: string, body: UploadTaskImageBody): Promise<TaskImage> {
    return this.request<TaskImage>(`/tasks/${taskId}/images`, {
      method: 'POST',
      body: JSON.stringify({ filename: body.filename, data: body.data, mimeType: body.mimeType }),
    });
  }

  /** URL for serving a task image — pure string, usable in an <Image source={{uri}}>. */
  getTaskImageUrl(taskId: string, imageId: string): string {
    return this.withToken(`${this.config.apiBaseUrl}/tasks/${taskId}/images/${imageId}`, this.getToken());
  }

  async deleteTaskImage(taskId: string, imageId: string): Promise<void> {
    await this.request<{ success: boolean }>(`/tasks/${taskId}/images/${imageId}`, {
      method: 'DELETE',
    });
  }

  // ==================== SKILLS ====================

  /** All available Claude Code skills; pass a project path to also discover project-level skills. */
  async getSkills(projectPath?: string): Promise<ClaudeCodeSkill[]> {
    return this.request<ClaudeCodeSkill[]>(`/skills${buildQuery({ projectPath })}`);
  }

  // ==================== TEAM MEMBERS ====================

  async getTeamMembers(projectId: string): Promise<TeamMember[]> {
    return this.request<TeamMember[]>(`/team-members${buildQuery({ projectId })}`);
  }

  async createTeamMember(data: CreateTeamMemberPayload): Promise<TeamMember> {
    return this.request<TeamMember>('/team-members', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeamMember(
    id: string,
    projectId: string,
    updates: UpdateTeamMemberPayload,
  ): Promise<TeamMember> {
    return this.request<TeamMember>(`/team-members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, projectId }),
    });
  }

  async deleteTeamMember(id: string, projectId: string): Promise<void> {
    await this.request<{ success: boolean }>(
      `/team-members/${id}${buildQuery({ projectId })}`,
      { method: 'DELETE' },
    );
  }

  async archiveTeamMember(id: string, projectId: string): Promise<void> {
    await this.request<TeamMember>(`/team-members/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async unarchiveTeamMember(id: string, projectId: string): Promise<void> {
    await this.request<TeamMember>(`/team-members/${id}/unarchive`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async resetDefaultTeamMember(id: string, projectId: string): Promise<void> {
    await this.request<TeamMember>(`/team-members/${id}/reset`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  // ==================== MODEL PROFILES ====================

  async getModelProfiles(): Promise<ModelProfile[]> {
    return this.request<ModelProfile[]>('/model-profiles');
  }

  async createModelProfile(data: CreateModelProfilePayload): Promise<ModelProfile> {
    return this.request<ModelProfile>('/model-profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateModelProfile(id: string, updates: UpdateModelProfilePayload): Promise<ModelProfile> {
    return this.request<ModelProfile>(`/model-profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteModelProfile(id: string): Promise<void> {
    await this.request<{ success: boolean }>(`/model-profiles/${id}`, { method: 'DELETE' });
  }

  // ==================== TEAMS ====================

  async getTeams(projectId: string): Promise<Team[]> {
    return this.request<Team[]>(`/teams${buildQuery({ projectId })}`);
  }

  async getTeamTree(projectId: string, id: string): Promise<TeamTreeNode> {
    return this.request<TeamTreeNode>(`/teams/${id}/tree${buildQuery({ projectId })}`);
  }

  async createTeam(data: CreateTeamPayload): Promise<Team> {
    return this.request<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeam(id: string, projectId: string, updates: UpdateTeamPayload): Promise<Team> {
    return this.request<Team>(`/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...updates, projectId }),
    });
  }

  async deleteTeam(id: string, projectId: string): Promise<void> {
    await this.request<{ success: boolean }>(`/teams/${id}${buildQuery({ projectId })}`, {
      method: 'DELETE',
    });
  }

  async archiveTeam(id: string, projectId: string): Promise<void> {
    await this.request<Team>(`/teams/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async unarchiveTeam(id: string, projectId: string): Promise<void> {
    await this.request<Team>(`/teams/${id}/unarchive`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  // ==================== WORKFLOW TEMPLATES ====================

  async getWorkflowTemplates(mode?: string): Promise<WorkflowTemplate[]> {
    return this.request<WorkflowTemplate[]>(`/workflow-templates${buildQuery({ mode })}`);
  }

  async getWorkflowTemplate(id: string): Promise<WorkflowTemplate> {
    return this.request<WorkflowTemplate>(`/workflow-templates/${encodeURIComponent(id)}`);
  }

  // ==================== SPELLS ====================

  async getSpellDefinitions(): Promise<SpellDefinition[]> {
    return this.request<SpellDefinition[]>('/spells/definitions');
  }

  async getSpellEntities(type: SpellEntityType, projectId?: string): Promise<SpellEntity[]> {
    return this.request<SpellEntity[]>(`/spells/entities/${type}${buildQuery({ projectId })}`);
  }

  async invokeSpell(invocation: SpellInvocationPayload): Promise<void> {
    await this.request<{ success: boolean }>('/spells/invoke', {
      method: 'POST',
      body: JSON.stringify(invocation),
    });
  }

  async getCustomPrompts(): Promise<SpellEntity[]> {
    return this.request<SpellEntity[]>('/spells/custom-prompts');
  }

  async createCustomPrompt(data: CreateCustomPromptPayload): Promise<CustomPrompt> {
    return this.request<CustomPrompt>('/spells/custom-prompts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCustomPrompt(id: string, data: UpdateCustomPromptPayload): Promise<CustomPrompt> {
    return this.request<CustomPrompt>(`/spells/custom-prompts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCustomPrompt(id: string): Promise<void> {
    await this.request<{ success: boolean }>(`/spells/custom-prompts/${id}`, { method: 'DELETE' });
  }

  // ==================== GIT ====================

  async getGitCapabilities(projectId?: string): Promise<GitCapabilities> {
    return this.request<GitCapabilities>(`/git/capabilities${buildQuery({ projectId })}`);
  }

  async getSessionGit(sessionId: string): Promise<GitStatusResponse> {
    return this.request<GitStatusResponse>(`/sessions/${encodeURIComponent(sessionId)}/git`);
  }

  async getSessionGitDiff(sessionId: string, file?: string): Promise<{ diff: string }> {
    return this.request<{ diff: string }>(
      `/sessions/${encodeURIComponent(sessionId)}/git/diff${buildQuery({ file })}`,
    );
  }

  async renameSessionBranch(sessionId: string, name: string): Promise<{ branchName: string }> {
    return this.request<{ branchName: string }>(
      `/sessions/${encodeURIComponent(sessionId)}/git/branch`,
      { method: 'POST', body: JSON.stringify({ name }) },
    );
  }

  async mergeSessionWorktree(
    sessionId: string,
    targetBranch?: string,
  ): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}/git/merge`, {
      method: 'POST',
      body: JSON.stringify({ targetBranch }),
    });
  }

  async createSessionPr(
    sessionId: string,
    data: { title: string; body: string; baseBranch?: string },
  ): Promise<GitPrInfo> {
    return this.request<GitPrInfo>(`/sessions/${encodeURIComponent(sessionId)}/git/pr`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSessionPr(sessionId: string): Promise<GitPrInfo | null> {
    const result = await this.request<{ pr: GitPrInfo | null }>(
      `/sessions/${encodeURIComponent(sessionId)}/git/pr`,
    );
    return result.pr;
  }

  async discardSessionWorktree(sessionId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/sessions/${encodeURIComponent(sessionId)}/git/worktree`,
      { method: 'DELETE' },
    );
  }

  // ==================== DIAGRAM INJECTION ====================

  /**
   * Export an Excalidraw diagram (PNG + scene JSON) to a session's working dir
   * and inject a prompt referencing both paths. RN has no Blob API, so the caller
   * supplies base64 PNG directly (see CONVENTIONS §12 — diagrams are docs).
   */
  async injectDiagramToSession(
    sessionId: string,
    body: InjectDiagramBody,
  ): Promise<{ pngPath: string; excalidrawPath: string }> {
    return this.request<{ pngPath: string; excalidrawPath: string }>(
      `/sessions/${sessionId}/inject-diagram`,
      {
        method: 'POST',
        body: JSON.stringify({ pngBase64: body.pngBase64, sceneJson: body.sceneJson, name: body.name }),
      },
    );
  }
}
