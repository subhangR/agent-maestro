import type {
    MaestroTask,
    TaskStatus,
    TaskPriority,
    MaestroSubtask,
    MaestroProject,
    MaestroSession,
    AgentSkill,
    ClaudeCodeSkill,
    CreateTaskPayload,
    UpdateTaskPayload,
    TaskList,
    CreateTaskListPayload,
    UpdateTaskListPayload,
    TaskListOrdering,
    TaskGraph,
    CreateTaskGraphPayload,
    UpdateTaskGraphPayload,
    CreateSessionPayload,
    UpdateSessionPayload,
    SpawnSessionPayload,
    SpawnSessionResponse,
    DocEntry,
    TaskImage,
    Ordering,
    TeamMember,
    CreateTeamMemberPayload,
    UpdateTeamMemberPayload,
    ModelProfile,
    CreateModelProfilePayload,
    UpdateModelProfilePayload,
    Team,
    TeamTreeNode,
    CreateTeamPayload,
    UpdateTeamPayload,
    WorkflowTemplate,
    SpellDefinition,
    SpellEntity,
    SpellEntityType,
    SpellInvocation,
    GitCapabilities,
    GitDiffSummary,
    GitPrInfo,
    SessionStatsResponse,
    SessionPrompt,
    SessionCommandUsage,
    Huddle,
} from '../app/types/maestro';

import { API_BASE_URL } from './serverConfig';
import { IS_TAURI } from '../platform/detect';
import { measureSpawnTerminalSize } from './terminalSize';

// Sentinel error type so callers can detect 401 without string-matching
export class UnauthenticatedError extends Error {
    readonly status = 401;
    constructor() { super('Unauthenticated'); }
}

/**
 * Maestro API Client
 *
 * Provides methods to interact with the Maestro server REST API.
 */
class MaestroClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    /**
     * Generic fetch wrapper with error handling
     */
    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        try {
            const response = await fetch(url, {
                credentials: 'include',
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options?.headers,
                },
            });

            if (response.status === 401 && !IS_TAURI) {
                // Trigger login overlay via auth store (lazy import to avoid circular deps)
                import('../stores/useAuthStore').then(({ useAuthStore }) => {
                    const { authEnabled, setShowLogin } = useAuthStore.getState();
                    if (authEnabled) setShowLogin(true);
                });
                throw new UnauthenticatedError();
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    }

    // ==================== PROJECTS ====================

    /**
     * Get all projects
     */
    async getProjects(): Promise<MaestroProject[]> {
        return this.fetch<MaestroProject[]>('/projects');
    }

    /**
     * Get a single project by ID
     */
    async getProject(id: string): Promise<MaestroProject> {
        return this.fetch<MaestroProject>(`/projects/${id}`);
    }

    /**
     * Create a new project
     */
    async createProject(data: { name: string; workingDir?: string; description?: string; createdAt?: number; updatedAt?: number }): Promise<MaestroProject> {
        return this.fetch<MaestroProject>('/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * Update an existing project
     */
    async updateProject(id: string, data: { name?: string; workingDir?: string; description?: string; createdAt?: number; updatedAt?: number }): Promise<MaestroProject> {
        return this.fetch<MaestroProject>(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    /**
     * Delete a project
     */
    async deleteProject(id: string): Promise<{ success: boolean; id: string }> {
        return this.fetch<{ success: boolean; id: string }>(`/projects/${id}`, {
            method: 'DELETE',
        });
    }

    /**
     * Set or unset master status for a project
     */
    async setProjectMaster(projectId: string, isMaster: boolean): Promise<MaestroProject> {
        return this.fetch<MaestroProject>(`/projects/${projectId}/master`, {
            method: 'PUT',
            body: JSON.stringify({ isMaster }),
        });
    }

    // ==================== TASKS ====================

    /**
     * Get all tasks for a project
     */
    async getTasks(projectId?: string): Promise<MaestroTask[]> {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        return this.fetch<MaestroTask[]>(`/tasks${query}`);
    }

    /**
     * Get a single task by ID
     */
    async getTask(id: string): Promise<MaestroTask> {
        return this.fetch<MaestroTask>(`/tasks/${id}`);
    }

    /**
     * Create a new task
     */
    async createTask(data: CreateTaskPayload): Promise<MaestroTask> {
        return this.fetch<MaestroTask>('/tasks', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * Update an existing task
     */
    async updateTask(id: string, updates: UpdateTaskPayload): Promise<MaestroTask> {
        return this.fetch<MaestroTask>(`/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    /**
     * Delete a task
     */
    async deleteTask(id: string): Promise<{ success: boolean }> {
        return this.fetch<{ success: boolean }>(`/tasks/${id}`, {
            method: 'DELETE',
        });
    }

    // ==================== TASK LISTS ====================

    /**
     * Get all task lists for a project
     */
    async getTaskLists(projectId: string): Promise<TaskList[]> {
        return this.fetch<TaskList[]>(`/task-lists?projectId=${encodeURIComponent(projectId)}`);
    }

    /**
     * Get a single task list by ID
     */
    async getTaskList(id: string): Promise<TaskList> {
        return this.fetch<TaskList>(`/task-lists/${id}`);
    }

    /**
     * Create a new task list
     */
    async createTaskList(data: CreateTaskListPayload): Promise<TaskList> {
        return this.fetch<TaskList>('/task-lists', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * Update an existing task list
     */
    async updateTaskList(id: string, updates: UpdateTaskListPayload): Promise<TaskList> {
        return this.fetch<TaskList>(`/task-lists/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    /**
     * Delete a task list
     */
    async deleteTaskList(id: string): Promise<{ success: boolean }> {
        return this.fetch<{ success: boolean }>(`/task-lists/${id}`, {
            method: 'DELETE',
        });
    }

    /**
     * Add a task to a list
     */
    async addTaskToList(listId: string, taskId: string): Promise<TaskList> {
        return this.fetch<TaskList>(`/task-lists/${listId}/tasks/${taskId}`, {
            method: 'POST',
        });
    }

    /**
     * Remove a task from a list
     */
    async removeTaskFromList(listId: string, taskId: string): Promise<TaskList> {
        return this.fetch<TaskList>(`/task-lists/${listId}/tasks/${taskId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Reorder tasks within a list
     */
    async reorderTaskListTasks(listId: string, orderedTaskIds: string[]): Promise<TaskList> {
        return this.fetch<TaskList>(`/task-lists/${listId}/reorder`, {
            method: 'PUT',
            body: JSON.stringify({ orderedTaskIds }),
        });
    }

    // --- Task Graph API ---

    async fetchTaskGraphs(projectId: string): Promise<TaskGraph[]> {
        return this.fetch<TaskGraph[]>(`/task-graphs?projectId=${encodeURIComponent(projectId)}`);
    }

    async fetchTaskGraph(id: string): Promise<TaskGraph> {
        return this.fetch<TaskGraph>(`/task-graphs/${id}`);
    }

    async createTaskGraph(data: CreateTaskGraphPayload): Promise<TaskGraph> {
        return this.fetch<TaskGraph>('/task-graphs', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateTaskGraph(id: string, updates: UpdateTaskGraphPayload): Promise<TaskGraph> {
        return this.fetch<TaskGraph>(`/task-graphs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    async deleteTaskGraph(id: string): Promise<{ success: boolean }> {
        return this.fetch<{ success: boolean }>(`/task-graphs/${id}`, {
            method: 'DELETE',
        });
    }

    async validateTaskGraph(id: string): Promise<{ valid: boolean; errors: string[]; topologicalOrder?: string[]; parallelLayers?: string[][] }> {
        return this.fetch(`/task-graphs/${id}/validate`, {
            method: 'POST',
        });
    }

    /**
     * Get task list ordering for a project
     */
    async getTaskListOrdering(projectId: string): Promise<TaskListOrdering> {
        return this.fetch<TaskListOrdering>(`/ordering/task-list/${encodeURIComponent(projectId)}`);
    }

    /**
     * Save task list ordering for a project
     */
    async saveTaskListOrdering(projectId: string, orderedIds: string[]): Promise<TaskListOrdering> {
        return this.fetch<TaskListOrdering>(`/ordering/task-list/${encodeURIComponent(projectId)}`, {
            method: 'PUT',
            body: JSON.stringify({ orderedIds }),
        });
    }

    // ==================== SESSIONS ====================

    /**
     * Get all sessions
     */
    async getSessions(taskId?: string): Promise<MaestroSession[]> {
        const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
        return this.fetch<MaestroSession[]>(`/sessions${query}`);
    }

    /**
     * Get a single session by ID
     */
    async getSession(id: string): Promise<MaestroSession> {
        return this.fetch<MaestroSession>(`/sessions/${id}`);
    }

    /**
     * Create a new session
     */
    async createSession(data: CreateSessionPayload): Promise<MaestroSession> {
        return this.fetch<MaestroSession>('/sessions', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * Update an existing session
     */
    async updateSession(id: string, updates: UpdateSessionPayload): Promise<MaestroSession> {
        return this.fetch<MaestroSession>(`/sessions/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    /**
     * Delete a session
     */
    async deleteSession(id: string): Promise<{ success: boolean }> {
        return this.fetch<{ success: boolean }>(`/sessions/${id}`, {
            method: 'DELETE',
        });
    }

    /**
     * Explicitly terminate a session's server-hosted PTY (MAESTRO_PTY_HOST=server).
     * Unlike closing the /pty WebSocket — which only detaches and leaves the PTY
     * running — this actually kills the process and marks the session stopped.
     */
    async stopSessionPty(id: string): Promise<{ success: boolean }> {
        return this.fetch<{ success: boolean }>(`/sessions/${id}/pty/stop`, {
            method: 'POST',
        });
    }

    // PHASE IV-A: New bidirectional relationship methods

    /**
     * Add a task to an existing session
     */
    async addTaskToSession(sessionId: string, taskId: string): Promise<MaestroSession> {
        return this.fetch<MaestroSession>(`/sessions/${sessionId}/tasks/${taskId}`, {
            method: 'POST',
        });
    }

    /**
     * Remove a task from an existing session
     */
    async removeTaskFromSession(sessionId: string, taskId: string): Promise<MaestroSession> {
        return this.fetch<MaestroSession>(`/sessions/${sessionId}/tasks/${taskId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Spawn a session (triggers server to generate manifest and emit spawn request)
     */
    async spawnSession(data: SpawnSessionPayload): Promise<SpawnSessionResponse> {
        // Attach the browser's measured terminal size (caller-provided wins) so
        // the server-hosted PTY boots at the real pane width — see measureSpawnTerminalSize.
        const size = measureSpawnTerminalSize();
        return this.fetch<SpawnSessionResponse>('/sessions/spawn', {
            method: 'POST',
            body: JSON.stringify({ ...size, ...data }),
        });
    }

    async resumeSession(sessionId: string): Promise<{ success: boolean; sessionId: string; claudeSessionId: string }> {
        return this.fetch(`/sessions/${sessionId}/resume`, {
            method: 'POST',
            body: JSON.stringify(measureSpawnTerminalSize()),
        });
    }

    async getTaskChildren(taskId: string): Promise<MaestroTask[]> {
        return this.fetch<MaestroTask[]>(`/tasks/${taskId}/children`);
    }

    // NOTE: Task timeline removed - use addSessionTimelineEvent instead

    /**
     * Add a timeline event to a session
     */
    async addSessionTimelineEvent(sessionId: string, event: { type: string; message?: string; taskId?: string; metadata?: Record<string, any> }): Promise<MaestroSession> {
        return this.fetch<MaestroSession>(`/sessions/${sessionId}/timeline`, {
            method: 'POST',
            body: JSON.stringify(event),
        });
    }

    /**
     * Fetch comprehensive session stats: token totals, message/tool counts,
     * last N messages (parsed from the Claude / Codex JSONL transcript).
     */
    async getSessionStats(sessionId: string, opts: { lastMessages?: number } = {}): Promise<SessionStatsResponse> {
        const qs = opts.lastMessages !== undefined ? `?lastMessages=${opts.lastMessages}` : '';
        return this.fetch<SessionStatsResponse>(`/sessions/${sessionId}/stats${qs}`);
    }

    async getSessionPrompts(sessionId: string): Promise<SessionPrompt[]> {
        return this.fetch<SessionPrompt[]>(`/sessions/${encodeURIComponent(sessionId)}/prompts`);
    }

    async getSessionCommandUsage(sessionId: string): Promise<SessionCommandUsage> {
        return this.fetch<SessionCommandUsage>(`/sessions/${encodeURIComponent(sessionId)}/command-usage`);
    }

    /**
     * Fetch cross-project huddles — disjoint sets of sessions that have
     * exchanged prompts with each other. Sorted by lastActivity descending.
     */
    async getHuddles(): Promise<Huddle[]> {
        return this.fetch<Huddle[]>(`/huddles`);
    }

    // ==================== DOCS ====================

    async getSessionDocs(sessionId: string): Promise<DocEntry[]> {
        return this.fetch<DocEntry[]>(`/sessions/${sessionId}/docs`);
    }

    async getTaskDocs(taskId: string): Promise<DocEntry[]> {
        return this.fetch<DocEntry[]>(`/tasks/${taskId}/docs`);
    }

    async addSessionDoc(sessionId: string, title: string, content: string, kind?: 'markdown' | 'diagram'): Promise<DocEntry> {
        const ext = kind === 'diagram' ? '.excalidraw' : '.md';
        const filePath = `${title.replace(/[^a-z0-9_\-]/gi, '_')}${ext}`;
        return this.fetch<DocEntry>(`/sessions/${sessionId}/docs`, {
            method: 'POST',
            body: JSON.stringify({ title, filePath, content, kind }),
        });
    }

    async addTaskDoc(taskId: string, sessionId: string, title: string, content: string, kind?: 'markdown' | 'diagram'): Promise<DocEntry> {
        const ext = kind === 'diagram' ? '.excalidraw' : '.md';
        const filePath = `${title.replace(/[^a-z0-9_\-]/gi, '_')}${ext}`;
        return this.fetch<DocEntry>(`/tasks/${taskId}/docs`, {
            method: 'POST',
            body: JSON.stringify({ title, filePath, content, sessionId, kind }),
        });
    }

    async updateDocContent(sessionId: string, docId: string, content: string): Promise<DocEntry> {
        return this.fetch<DocEntry>(`/sessions/${sessionId}/docs/${docId}/content`, {
            method: 'PUT',
            body: JSON.stringify({ content }),
        });
    }

    async getProjectDocs(projectId: string): Promise<DocEntry[]> {
        return this.fetch<DocEntry[]>(`/projects/${projectId}/docs`);
    }

    async getProjectDocsPaginated(
        projectId: string,
        kind: 'markdown' | 'diagram',
        limit: number,
        offset: number,
    ): Promise<{ data: DocEntry[]; pagination: { offset: number; limit: number; total: number; hasMore: boolean } }> {
        const params = new URLSearchParams({ kind, limit: String(limit), offset: String(offset) });
        return this.fetch(`/projects/${projectId}/docs?${params}`);
    }

    // ==================== TASK IMAGES ====================

    /**
     * Upload an image to a task (accepts a File object, converts to base64)
     */
    async uploadTaskImage(taskId: string, file: File): Promise<TaskImage> {
        const data = await this.fileToBase64(file);
        return this.fetch<TaskImage>(`/tasks/${taskId}/images`, {
            method: 'POST',
            body: JSON.stringify({
                filename: file.name,
                data,
                mimeType: file.type,
            }),
        });
    }

    /**
     * Get the URL for serving a task image
     */
    getTaskImageUrl(taskId: string, imageId: string): string {
        return `${this.baseUrl}/tasks/${taskId}/images/${imageId}`;
    }

    /**
     * Delete an image from a task
     */
    async deleteTaskImage(taskId: string, imageId: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/tasks/${taskId}/images/${imageId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Convert a File to base64 string
     */
    private fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // Strip the data URL prefix (e.g. "data:image/png;base64,")
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ==================== SKILLS ====================

    /**
     * Get all available Claude Code skills
     * @param projectPath Optional project path to also discover project-level skills
     */
    async getSkills(projectPath?: string): Promise<ClaudeCodeSkill[]> {
        const params = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : '';
        return this.fetch<ClaudeCodeSkill[]>(`/skills${params}`);
    }

    // ==================== ORDERING ====================

    /**
     * Get ordering for a project and entity type
     */
    async getOrdering(projectId: string, entityType: 'task' | 'session'): Promise<Ordering> {
        return this.fetch<Ordering>(`/ordering/${entityType}/${encodeURIComponent(projectId)}`);
    }

    /**
     * Save ordering for a project and entity type
     */
    async saveOrdering(projectId: string, entityType: 'task' | 'session', orderedIds: string[]): Promise<Ordering> {
        return this.fetch<Ordering>(`/ordering/${entityType}/${encodeURIComponent(projectId)}`, {
            method: 'PUT',
            body: JSON.stringify({ orderedIds }),
        });
    }

    // ==================== TEAM MEMBERS ====================

    /**
     * Get all team members for a project
     */
    async getTeamMembers(projectId: string): Promise<TeamMember[]> {
        return this.fetch<TeamMember[]>(`/team-members?projectId=${encodeURIComponent(projectId)}`);
    }

    /**
     * Create a new team member
     */
    async createTeamMember(data: CreateTeamMemberPayload): Promise<TeamMember> {
        return this.fetch<TeamMember>('/team-members', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * Update an existing team member
     */
    async updateTeamMember(id: string, projectId: string, updates: UpdateTeamMemberPayload): Promise<TeamMember> {
        return this.fetch<TeamMember>(`/team-members/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ ...updates, projectId }),
        });
    }

    /**
     * Delete a team member
     */
    async deleteTeamMember(id: string, projectId: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/team-members/${id}?projectId=${encodeURIComponent(projectId)}`, {
            method: 'DELETE',
        });
    }

    /**
     * Archive a team member
     */
    async archiveTeamMember(id: string, projectId: string): Promise<void> {
        await this.fetch<TeamMember>(`/team-members/${id}/archive`, {
            method: 'POST',
            body: JSON.stringify({ projectId }),
        });
    }

    /**
     * Unarchive a team member
     */
    async unarchiveTeamMember(id: string, projectId: string): Promise<void> {
        await this.fetch<TeamMember>(`/team-members/${id}/unarchive`, {
            method: 'POST',
            body: JSON.stringify({ projectId }),
        });
    }

    /**
     * Reset a default team member to its default values
     */
    async resetDefaultTeamMember(id: string, projectId: string): Promise<void> {
        await this.fetch<TeamMember>(`/team-members/${id}/reset`, {
            method: 'POST',
            body: JSON.stringify({ projectId }),
        });
    }

    // ==================== MODEL PROFILES ====================

    /** List all workspace-global model profiles */
    async getModelProfiles(): Promise<ModelProfile[]> {
        return this.fetch<ModelProfile[]>('/model-profiles');
    }

    /** Create a model profile */
    async createModelProfile(data: CreateModelProfilePayload): Promise<ModelProfile> {
        return this.fetch<ModelProfile>('/model-profiles', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /** Update a model profile */
    async updateModelProfile(id: string, updates: UpdateModelProfilePayload): Promise<ModelProfile> {
        return this.fetch<ModelProfile>(`/model-profiles/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    }

    /** Delete a model profile */
    async deleteModelProfile(id: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/model-profiles/${id}`, {
            method: 'DELETE',
        });
    }

    // ==================== TEAMS ====================

    async getTeams(projectId: string): Promise<Team[]> {
        return this.fetch<Team[]>(`/teams?projectId=${encodeURIComponent(projectId)}`);
    }

    async getTeamTree(projectId: string, id: string): Promise<TeamTreeNode> {
        return this.fetch<TeamTreeNode>(`/teams/${id}/tree?projectId=${encodeURIComponent(projectId)}`);
    }

    async createTeam(data: CreateTeamPayload): Promise<Team> {
        return this.fetch<Team>('/teams', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateTeam(id: string, projectId: string, updates: UpdateTeamPayload): Promise<Team> {
        return this.fetch<Team>(`/teams/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ ...updates, projectId }),
        });
    }

    async deleteTeam(id: string, projectId: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/teams/${id}?projectId=${encodeURIComponent(projectId)}`, {
            method: 'DELETE',
        });
    }

    async archiveTeam(id: string, projectId: string): Promise<void> {
        await this.fetch<Team>(`/teams/${id}/archive`, {
            method: 'POST',
            body: JSON.stringify({ projectId }),
        });
    }

    async unarchiveTeam(id: string, projectId: string): Promise<void> {
        await this.fetch<Team>(`/teams/${id}/unarchive`, {
            method: 'POST',
            body: JSON.stringify({ projectId }),
        });
    }

    // ── Workflow Templates ──────────────────────────────────────

    /**
     * Get all workflow templates, optionally filtered by mode.
     */
    async getWorkflowTemplates(mode?: string): Promise<WorkflowTemplate[]> {
        const query = mode ? `?mode=${encodeURIComponent(mode)}` : '';
        return this.fetch<WorkflowTemplate[]>(`/workflow-templates${query}`);
    }

    /**
     * Get a specific workflow template by ID.
     */
    async getWorkflowTemplate(id: string): Promise<WorkflowTemplate> {
        return this.fetch<WorkflowTemplate>(`/workflow-templates/${encodeURIComponent(id)}`);
    }

    // ==================== SPELLS ====================

    async getSpellDefinitions(): Promise<SpellDefinition[]> {
        return this.fetch<SpellDefinition[]>('/spells/definitions');
    }

    async getSpellEntities(type: SpellEntityType, projectId?: string): Promise<SpellEntity[]> {
        const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        return this.fetch<SpellEntity[]>(`/spells/entities/${type}${params}`);
    }

    async invokeSpell(invocation: SpellInvocation): Promise<void> {
        await this.fetch<{ success: boolean }>('/spells/invoke', {
            method: 'POST',
            body: JSON.stringify(invocation),
        });
    }

    async getCustomPrompts(): Promise<SpellEntity[]> {
        return this.fetch<SpellEntity[]>('/spells/custom-prompts');
    }

    async createCustomPrompt(data: { name: string; content: string; description?: string; icon?: string; entityType?: SpellEntityType; tags?: string[] }): Promise<any> {
        return this.fetch<any>('/spells/custom-prompts', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateCustomPrompt(id: string, data: { name?: string; content?: string; description?: string; icon?: string; entityType?: SpellEntityType; tags?: string[] }): Promise<any> {
        return this.fetch<any>(`/spells/custom-prompts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async deleteCustomPrompt(id: string): Promise<void> {
        await this.fetch<{ success: boolean }>(`/spells/custom-prompts/${id}`, { method: 'DELETE' });
    }

    // ── Git ───────────────────────────────────────────────────────────────────

    async getGitCapabilities(projectId?: string): Promise<GitCapabilities> {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
        return this.fetch<GitCapabilities>(`/git/capabilities${query}`);
    }

    async getSessionGit(sessionId: string): Promise<{ hasWorktree: boolean; summary?: GitDiffSummary; pr?: GitPrInfo; suggestedPr?: { title: string; body: string } }> {
        return this.fetch<{ hasWorktree: boolean; summary?: GitDiffSummary; pr?: GitPrInfo; suggestedPr?: { title: string; body: string } }>(
            `/sessions/${encodeURIComponent(sessionId)}/git`
        );
    }

    async getSessionGitDiff(sessionId: string, file?: string): Promise<{ diff: string }> {
        const query = file ? `?file=${encodeURIComponent(file)}` : '';
        return this.fetch<{ diff: string }>(
            `/sessions/${encodeURIComponent(sessionId)}/git/diff${query}`
        );
    }

    async renameSessionBranch(sessionId: string, name: string): Promise<{ branchName: string }> {
        return this.fetch<{ branchName: string }>(
            `/sessions/${encodeURIComponent(sessionId)}/git/branch`,
            { method: 'POST', body: JSON.stringify({ name }) }
        );
    }

    async mergeSessionWorktree(sessionId: string, targetBranch?: string): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
        return this.fetch<{ success: boolean; message: string; conflicts?: string[] }>(
            `/sessions/${encodeURIComponent(sessionId)}/git/merge`,
            { method: 'POST', body: JSON.stringify({ targetBranch }) }
        );
    }

    async createSessionPr(sessionId: string, data: { title: string; body: string; baseBranch?: string }): Promise<GitPrInfo> {
        return this.fetch<GitPrInfo>(
            `/sessions/${encodeURIComponent(sessionId)}/git/pr`,
            { method: 'POST', body: JSON.stringify(data) }
        );
    }

    async getSessionPr(sessionId: string): Promise<GitPrInfo | null> {
        const result = await this.fetch<{ pr: GitPrInfo | null }>(
            `/sessions/${encodeURIComponent(sessionId)}/git/pr`
        );
        return result.pr;
    }

    async discardSessionWorktree(sessionId: string): Promise<{ success: boolean }> {
        return this.fetch<{ success: boolean }>(
            `/sessions/${encodeURIComponent(sessionId)}/git/worktree`,
            { method: 'DELETE' }
        );
    }

    // ==================== DIAGRAM INJECTION ====================

    /**
     * Export a diagram (PNG + .excalidraw) to a session's working directory and inject
     * a prompt referencing both file paths. UI-initiated — no senderSessionId required.
     */
    async injectDiagramToSession(
        sessionId: string,
        pngBlob: Blob,
        sceneJson: string,
        name?: string,
    ): Promise<{ pngPath: string; excalidrawPath: string }> {
        const pngBase64 = await this.blobToBase64(pngBlob);
        return this.fetch<{ pngPath: string; excalidrawPath: string }>(`/sessions/${sessionId}/inject-diagram`, {
            method: 'POST',
            body: JSON.stringify({ pngBase64, sceneJson, name }),
        });
    }

    private blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

}

// Export singleton instance
export const maestroClient = new MaestroClient();


// Export types for convenience
export type { MaestroTask as Task, TaskStatus, TaskPriority, MaestroSubtask as Subtask, MaestroSession as Session, MaestroProject, AgentSkill as Skill };
