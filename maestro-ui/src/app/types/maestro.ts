// Canonical types matching maestro-server/src/types.ts
// plus UI-specific optional fields

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled' | 'blocked' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high';
export type MaestroSessionStatus = 'spawning' | 'idle' | 'working' | 'completed' | 'failed' | 'stopped';
export type SpawnSource = 'ui' | 'session';
export type TaskSessionStatus = 'queued' | 'working' | 'blocked' | 'completed' | 'failed' | 'skipped';
// Four-mode model
export type AgentMode = 'worker' | 'coordinator' | 'coordinated-worker' | 'coordinated-coordinator';
/** Legacy mode aliases for backward compatibility */
export type LegacyAgentMode = 'execute' | 'coordinate';
export type AgentModeInput = AgentMode | LegacyAgentMode;
// Claude models
export type ClaudeModel = 'haiku' | 'sonnet' | 'sonnet[1m]' | 'opus' | 'opus[1m]';
// Codex models
export type CodexModel = 'gpt-5.3-codex' | 'gpt-5.2-codex';
// Gemini models
export type GeminiModel = 'gemini-3-pro-preview' | 'gemini-2.5-pro';
// Union of all supported models
export type ModelType = ClaudeModel | CodexModel | GeminiModel;
export type AgentTool = 'claude-code' | 'codex' | 'gemini';

// Strategy types
export type WorkerStrategy = 'simple' | 'queue';
export type OrchestratorStrategy = 'default' | 'intelligent-batching' | 'dag';

// Team Member types
export type TeamMemberStatus = 'active' | 'archived';
export type TeamMemberScope = 'project' | 'global';

// Team types
export type TeamStatus = 'active' | 'archived';

export interface Team {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId: string;
  memberIds: string[];
  subTeamIds: string[];
  parentTeamId?: string;
  status: TeamStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamPayload {
  projectId: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId: string;
  memberIds?: string[];
  subTeamIds?: string[];
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
  avatar?: string;
  leaderId?: string;
  memberIds?: string[];
  subTeamIds?: string[];
  status?: TeamStatus;
}

export interface TeamMember {
  id: string;
  projectId: string;
  scope?: TeamMemberScope;
  name: string;
  role: string;
  identity: string;
  avatar: string;
  model?: string;
  agentTool?: AgentTool;
  mode?: AgentMode;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  strategy?: WorkerStrategy | OrchestratorStrategy;
  skillIds?: string[];
  isDefault: boolean;
  status: TeamMemberStatus;
  soundInstrument?: InstrumentType;  // The instrument this team member "plays" in the ensemble

  capabilities?: {
    can_spawn_sessions?: boolean;
    can_edit_tasks?: boolean;
    can_report_task_level?: boolean;
    can_report_session_level?: boolean;
  };

  // Phase 2: Command permission overrides
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };

  // Phase 3: Workflow customization
  workflowTemplateId?: string;
  customWorkflow?: string;

  // Self-awareness: persistent memory
  memory?: string[];

  createdAt: string;
  updatedAt: string;
}

// Workflow template types (Phase 3)
export interface WorkflowPhase {
  name: string;
  instruction: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  mode: AgentMode;
  phases: WorkflowPhase[];
  builtIn: boolean;
}

export interface TeamMemberSnapshot {
  name: string;
  avatar: string;
  role: string;
  model?: string;
  agentTool?: AgentTool;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
}

export interface CreateTeamMemberPayload {
  projectId: string;
  scope?: TeamMemberScope;
  name: string;
  role: string;
  identity: string;
  avatar: string;
  model?: ModelType;
  agentTool?: AgentTool;
  mode?: AgentMode;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  skillIds?: string[];
  capabilities?: TeamMember['capabilities'];
  commandPermissions?: TeamMember['commandPermissions'];
  workflowTemplateId?: string;
  customWorkflow?: string;
  soundInstrument?: InstrumentType;
}

export interface UpdateTeamMemberPayload {
  name?: string;
  role?: string;
  identity?: string;
  avatar?: string;
  model?: ModelType;
  agentTool?: AgentTool;
  mode?: AgentMode;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  skillIds?: string[];
  status?: TeamMemberStatus;
  scope?: TeamMemberScope;
  capabilities?: TeamMember['capabilities'];
  commandPermissions?: TeamMember['commandPermissions'];
  workflowTemplateId?: string;
  customWorkflow?: string;
  memory?: string[];
  soundInstrument?: InstrumentType;
}

// Session timeline event types
export type SessionTimelineEventType =
  | 'session_started'    // Session spawned
  | 'session_stopped'    // Session stopped
  | 'task_started'       // Started working on a task
  | 'task_completed'     // Finished a task
  | 'task_failed'        // Failed a task
  | 'task_skipped'       // Skipped a task
  | 'task_blocked'       // Blocked on a task
  | 'needs_input'        // Waiting for user input
  | 'progress'           // General progress update
  | 'error'              // Error occurred
  | 'milestone'          // Milestone reached
  | 'doc_added';         // Document added




// Sound configuration types
export type InstrumentType = 'piano' | 'guitar' | 'violin' | 'trumpet' | 'drums';

export type SoundCategoryType =
  | 'success' | 'error' | 'critical_error' | 'warning' | 'attention'
  | 'action' | 'creation' | 'deletion' | 'update' | 'progress'
  | 'achievement' | 'neutral' | 'link' | 'unlink' | 'loading'
  | 'notify_task_completed' | 'notify_task_failed' | 'notify_task_blocked'
  | 'notify_task_session_completed' | 'notify_task_session_failed'
  | 'notify_session_completed' | 'notify_session_failed'
  | 'notify_needs_input' | 'notify_progress';

export interface ProjectSoundConfig {
  instrument: InstrumentType;
  enabledCategories?: SoundCategoryType[];
  categoryOverrides?: Record<string, {
    instrument?: InstrumentType;
    enabled?: boolean;
  }>;
  templateId?: string;
}

export interface SoundTemplate {
  id: string;
  name: string;
  builtIn: boolean;
  instrument: InstrumentType;
  enabledCategories: SoundCategoryType[];
  categoryOverrides?: Record<string, { instrument?: InstrumentType; enabled?: boolean }>;
}

export interface DocEntry {
  id: string;
  title: string;
  filePath: string;
  content?: string;
  taskId?: string;
  addedAt: number;
  addedBy?: string;
  sessionId?: string;
  sessionName?: string;
}

export interface TaskImage {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  addedAt: number;
}

export interface MaestroProject {
  id: string;
  name: string;
  workingDir: string;
  description?: string;
  isMaster?: boolean;
  createdAt: number;
  updatedAt: number;
  // UI specific fields that might come from API or be computed
  basePath?: string | null;
  environmentId: string | null;
  assetsEnabled?: boolean;
  // Sound settings (legacy fields kept for backward compat migration)
  soundInstrument?: string;
  soundSettings?: {
    enabledCategories?: string[];
  };
  // New project-level sound config
  soundConfig?: ProjectSoundConfig;
}



export interface SessionTimelineEvent {
  id: string;
  type: SessionTimelineEventType;
  timestamp: number;
  message?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export interface MaestroSessionEvent {
  id: string;
  timestamp: number;
  type: string;
  data?: any;
}

export interface MaestroTask {
  // Core Identity
  id: string;
  projectId: string;
  parentId: string | null;

  // Content
  title: string;
  description: string;
  initialPrompt: string; // Standardized from 'prompt'

  // Status & Priority
  status: TaskStatus;
  priority: TaskPriority;
  taskSessionStatuses?: Record<string, TaskSessionStatus>;  // Per-session status map: { [sessionId]: status }

  // Timestamps
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;

  // Relationships
  sessionIds: string[];
  skillIds: string[];
  agentIds: string[];
  dependencies: string[];
  // NOTE: timeline moved to Session

  // Reference task IDs for context (docs from these tasks are provided to the agent)
  referenceTaskIds?: string[];

  // Pinned tasks appear in the dedicated "Pinned" tab for quick re-execution
  pinned?: boolean;

  // Assigned team member for this task
  teamMemberId?: string;

  // Multiple team member identities for this task
  teamMemberIds?: string[];

  // Per-member launch overrides saved on the task
  memberOverrides?: Record<string, MemberLaunchOverride>;

  // Run this task with --dangerously-skip-permissions
  dangerousMode?: boolean;

  // Spawn sessions in an isolated git worktree
  useWorktree?: boolean;

  // Due date for the task (ISO date string "YYYY-MM-DD" or null)
  dueDate?: string | null;

  // Docs attached to this task
  docs?: DocEntry[];

  // Images attached to this task
  images?: TaskImage[];

  // UI/Populated Fields (Optional)
  subtasks?: MaestroTask[];
  sessionCount?: number; // UI computed field
  lastUpdate?: string | null; // UI computed field
}

// Subtask alias - in the new model, subtasks are just Tasks
export type MaestroSubtask = MaestroTask;

export interface MaestroSession {
  id: string;
  projectId: string;
  taskIds: string[];
  name: string;
  agentId?: string;
  claudeSessionId?: string;
  env: Record<string, string>;
  metadata?: Record<string, any>;
  status: MaestroSessionStatus;
  startedAt: number;
  lastActivity: number;
  completedAt: number | null;
  hostname: string;
  platform: string;
  events: MaestroSessionEvent[];
  timeline: SessionTimelineEvent[];  // Session's activity timeline
  needsInput?: {
    active: boolean;
    message?: string;
    since?: number;
  };
  mode?: AgentMode;
  strategy?: WorkerStrategy;
  orchestratorStrategy?: OrchestratorStrategy;
  spawnSource?: SpawnSource;
  spawnedBy?: string;
  manifestPath?: string;
  model?: ModelType;
  docs?: DocEntry[];
  teamMemberId?: string;
  teamMemberSnapshot?: TeamMemberSnapshot;

  // Multiple team member identities
  teamMemberIds?: string[];
  teamMemberSnapshots?: TeamMemberSnapshot[];

  // Team session grouping
  teamSessionId?: string;   // Shared ID linking coordinator + workers (= coordinator's session ID)
  teamId?: string;           // Optional saved Team reference
  parentSessionId?: string;
}

// Payloads
export interface CreateTaskPayload {
  projectId: string;
  parentId?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  initialPrompt?: string; // Standardized
  skillIds?: string[];
  referenceTaskIds?: string[];
  teamMemberId?: string;
  teamMemberIds?: string[];
  memberOverrides?: Record<string, MemberLaunchOverride>;
  dueDate?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: TaskStatus;
  sessionStatus?: TaskSessionStatus;  // Backward compat for session-source updates
  taskSessionStatuses?: Record<string, TaskSessionStatus>;  // Direct map update
  priority?: TaskPriority;
  initialPrompt?: string;
  sessionIds?: string[];
  skillIds?: string[];
  agentIds?: string[];
  referenceTaskIds?: string[];
  pinned?: boolean;
  teamMemberId?: string;
  teamMemberIds?: string[];
  dueDate?: string | null;
  dangerousMode?: boolean;
  useWorktree?: boolean;
  // NOTE: timeline moved to Session - use addTimelineEvent on session
  completedAt?: number | null;
}

export interface TaskList {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  orderedTaskIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskListPayload {
  projectId: string;
  name: string;
  description?: string;
  orderedTaskIds?: string[];
}

export interface UpdateTaskListPayload {
  name?: string;
  description?: string;
  orderedTaskIds?: string[];
}

export interface CreateSessionPayload {
  id?: string;
  projectId: string;
  taskIds: string[];
  name?: string;
  agentId?: string;
}

export interface UpdateSessionPayload {
  taskIds?: string[];
  status?: MaestroSessionStatus;
  agentId?: string;
  events?: MaestroSessionEvent[];
  timeline?: SessionTimelineEvent[];
  completedAt?: number;
  needsInput?: {
    active: boolean;
    message?: string;
    since?: number;
  };
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  type: 'system' | 'mode';
  version: string;
}

export interface ClaudeCodeSkill {
  id: string;
  name: string;
  description: string;
  triggers?: string[];
  role?: string;
  scope?: string;
  outputFormat?: string;
  version?: string;
  language?: string;
  framework?: string;
  tags?: string[];
  category?: string;
  license?: string;
  content: string;
  hasReferences: boolean;
  referenceCount: number;
  // Multi-scope metadata
  skillScope?: 'project' | 'global';
  skillSource?: 'claude' | 'agents';
  skillPath?: string;
}

// Per-member launch override for team launch configuration
export interface MemberLaunchOverride {
  agentTool?: AgentTool;
  model?: ModelType;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  skillIds?: string[];
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
}

export interface SpawnSessionPayload {
  projectId: string;
  taskIds: string[];
  mode?: AgentMode;                    // Three-axis model: 'execute' or 'coordinate'
  spawnSource?: SpawnSource;          // 'ui' or 'session'
  sessionId?: string;                  // Required when spawnSource === 'session' (parent session ID)
  sessionName?: string;
  skills?: string[];
  context?: Record<string, any>;
  teamMemberId?: string;              // Team member running this session (backward compat)
  teamMemberIds?: string[];           // Multiple team member identities for this session
  delegateTeamMemberIds?: string[];   // Team member IDs for coordination delegation pool
  agentTool?: AgentTool;              // Override agent tool for this run
  model?: ModelType;                  // Override model for this run
  memberOverrides?: Record<string, MemberLaunchOverride>;  // Per-member overrides keyed by teamMemberId
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  delegatePermissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  useWorktree?: boolean;
}

/** Input shape for the UI-level session creation callback used by hooks/components. */
export interface CreateMaestroSessionInput {
  task?: MaestroTask;
  tasks?: MaestroTask[];
  project: MaestroProject;
  mode?: AgentMode;
  skillIds?: string[];
  teamMemberId?: string;
  teamMemberIds?: string[];
  delegateTeamMemberIds?: string[];
  agentTool?: AgentTool;
  model?: ModelType;
  memberOverrides?: Record<string, MemberLaunchOverride>;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  delegatePermissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  useWorktree?: boolean;
}

export interface SpawnSessionResponse {
  success: boolean;
  sessionId: string;
  manifestPath: string;
  session: MaestroSession;
}

export type TaskTreeNode = MaestroTask & { children: TaskTreeNode[] };

// Ordering (separate from task/session models - UI ordering only)
export interface Ordering {
  projectId: string;
  entityType: 'task' | 'session';
  orderedIds: string[];
  updatedAt: number;
}

export interface TaskListOrdering {
  projectId: string;
  orderedIds: string[];
  updatedAt: number;
}

// ─── Spell Types ───

export type SpellEntityType = 'maestro' | 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

export interface SpellDefinition {
  name: string;
  label: string;
  description?: string;
}

export interface SpellEntity {
  id: string;
  type: SpellEntityType;
  label: string;
  icon?: string;
  spells: SpellDefinition[];
  metadata?: Record<string, any>;
}

export interface SpellInvocation {
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  projectId: string;
}

export interface SpellInvokedEvent {
  sessionId: string;
  content: string;
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
}
