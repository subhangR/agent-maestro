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
export type ClaudeModel =
  | 'haiku'
  | 'sonnet'
  | 'sonnet[1m]'
  | 'opus'
  | 'opus[1m]'
  | 'claude-fable-5'
  | 'claude-fable-5[1m]'
  | 'claude-opus-5'
  | 'claude-opus-5[1m]'
  | 'claude-opus-4-8'
  | 'claude-opus-4-8[1m]'
  | 'claude-opus-4-7'
  | 'claude-opus-4-7[1m]'
  | 'claude-sonnet-5'
  | 'claude-sonnet-5[1m]'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5'
  | 'claude-opus-4-6';
// Codex models
export type CodexModel =
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5.5'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.3-codex'
  | 'gpt-5.3-codex-spark'
  | 'gpt-5.2'
  | 'gpt-5.2-codex';
// Gemini models
export type GeminiModel = 'gemini-3-pro-preview' | 'gemini-2.5-pro';
// Hermes models
export type HermesModel =
  | 'hermes-default'
  | 'anthropic:claude-opus-4-8'
  | 'nous:anthropic/claude-opus-4.8'
  | 'openrouter:anthropic/claude-opus-4.8'
  | 'anthropic/claude-opus-4.8'
  | 'anthropic/claude-sonnet-4.6'
  | 'openai/gpt-5.6-sol'
  | 'openai/gpt-5.6-terra'
  | 'openai/gpt-5.6-luna'
  | 'openai/gpt-5.5'
  | 'openai/gpt-5.4'
  | 'openai/gpt-5.4-mini'
  | 'openai/gpt-5.3-codex'
  | 'openai/gpt-5.3-codex-spark'
  | 'openai/gpt-5.2'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-luna'
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.3-codex'
  | 'gpt-5.3-codex-spark'
  | 'gpt-5.2';
// Kimi (Moonshot AI) and GLM (Zhipu AI) models — CLI-based providers. Model ids
// mirror the CLI/server conventions (kimi-*/moonshot-*, glm-*/chatglm-*).
export type KimiModel = 'kimi-k2-0711-preview' | (string & {});
export type GlmModel = 'glm-4' | 'glm-4-plus' | (string & {});
// Union of all supported models
export type ModelType = ClaudeModel | CodexModel | GeminiModel | HermesModel | KimiModel | GlmModel;
export type AgentTool = 'claude-code' | 'codex' | 'hermes' | 'gemini' | 'kimi' | 'glm';
export type LaunchProvider = 'claude' | 'openai' | 'hermes' | 'gemini' | 'kimi' | 'glm';
export type LaunchReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type LaunchSpeed = 'standard' | 'fast';
export type LaunchAccessMode = 'safe' | 'acceptEdits' | 'plan' | 'fullAccess';

export interface LaunchConfig {
  provider: LaunchProvider;
  model: ModelType | string;
  reasoningEffort?: LaunchReasoningEffort;
  speed?: LaunchSpeed;
  accessMode?: LaunchAccessMode;
}

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

// Hydrated member inside a resolved team tree (mirrors server TeamTreeMember).
export interface TeamTreeMember {
  id: string;
  name: string;
  role: string;
  identity?: string;
  avatar?: string;
  mode?: AgentMode;
  isLeader: boolean;
}

// Recursive, fully-resolved team tree (mirrors server TeamTreeNode). Backs the org chart.
export interface TeamTreeNode {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId: string;
  status?: TeamStatus;
  members: TeamTreeMember[];
  subTeams: TeamTreeNode[];
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
  modelProfileId?: string;
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
  modelProfileId?: string;
  agentTool?: AgentTool;
  mode?: AgentMode;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  strategy?: string;
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
  modelProfileId?: string;
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

// Token usage snapshot — matches maestro-server/src/types.ts TokenUsageSnapshot.
export interface TokenUsageSnapshot {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  provider: string | null;
  model: string | null;
  capturedAt: number;
}

// Token analytics response shapes — mirror TokenAnalyticsService.
export interface GlobalTokenSummary {
  totals: TokenUsageSnapshot;
  byProvider: Partial<Record<string, TokenUsageSnapshot>>;
  byModel: Record<string, TokenUsageSnapshot>;
  sessionCount: number;
  windowMs: number;
}

export interface SessionTokenEntry {
  sessionId: string;
  tokenUsage: TokenUsageSnapshot | null;
}

export interface TaskTokenSummary {
  taskId: string;
  sessions: SessionTokenEntry[];
  totals: TokenUsageSnapshot;
}

// Quota limits on a model profile.
export interface ModelProfileQuotas {
  maxTokensPerSession?: number;
  maxTokensPerDay?: number;
  maxConcurrentSessions?: number;
}

// Model profile types — a named, workspace-global launch config that team members
// reference by id. Mirrors maestro-server/src/types.ts ModelProfile.
export interface ModelProfile {
  id: string;
  name: string;
  description?: string;
  launchConfig: LaunchConfig;
  quotas?: ModelProfileQuotas;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModelProfilePayload {
  name: string;
  description?: string;
  launchConfig: LaunchConfig;
  quotas?: ModelProfileQuotas;
}

export interface UpdateModelProfilePayload {
  name?: string;
  description?: string;
  launchConfig?: LaunchConfig;
  quotas?: ModelProfileQuotas;
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

// Pipeline stage model for multi-agent workflow visualization.
// The 7 canonical stages reflect the standard software delivery lifecycle.
// Timeline events may carry metadata.stage (PipelineStageName) for explicit
// attribution; absent that, derivePipeline.ts uses keyword heuristics.
export type PipelineStageName =
  | 'empathize' | 'define' | 'ideate' | 'design' | 'build'
  | 'secure' | 'test' | 'review' | 'ship' | 'analyze';
export type PipelineStageStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface PipelineStage {
  name: PipelineStageName;
  status: PipelineStageStatus;
  agentLabel?: string;    // optional name of the agent working this stage
  startedAt?: number;
  completedAt?: number;
}




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
  kind?: 'markdown' | 'diagram';
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
  // Canonical GitHub repository URL (https://github.com/<owner>/<repo>) for
  // Collab Spaces. Server-owned, optional; absent on projects with no saved repo.
  githubUrl?: string;
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

/**
 * A prompt sent between two sessions (sender → receiver). Mirrors the
 * server's GET /api/sessions/:id/prompts response — returned sorted by
 * timestamp ascending, including prompts where this session is sender OR
 * receiver. Reused by Session Stats and Huddles.
 */
export interface SessionPrompt {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  content: string;
  mode: 'send' | 'paste';
  fromTeamMember: TeamMemberSnapshot | null;
  toTeamMember: TeamMemberSnapshot | null;
  fromSessionName: string | null;
  toSessionName: string | null;
  timestamp: number;
}

/**
 * One member of a Huddle — a session that exchanged prompts with the other
 * members. Mirrors the server's Huddle.sessions[] entry (Phase 2A).
 */
export interface HuddleSessionMember {
  sessionId: string;
  sessionName: string | null;
  projectId: string | null;
  teamMember: TeamMemberSnapshot | null;
}

/**
 * A connected component of cross-session prompting — a disjoint set of
 * sessions plus the inter-session prompts they exchanged. Huddles are
 * cross-project (a huddle can contain sessions from other projects, unlike
 * the project-scoped open/done/archived tabs).
 *
 * Mirrors the server's GET /api/huddles response (Phase 2A) — sorted by
 * lastActivity descending.
 */
export interface Huddle {
  id: string;
  sessionIds: string[];
  sessions: HuddleSessionMember[];
  prompts: SessionPrompt[];
  promptCount: number;
  lastActivity: number;
}

// One tracked maestro CLI invocation (written by the CLI command-tracker).
export interface CommandUsageRecord {
  ts: string;
  sessionId: string | null;
  projectId: string | null;
  command: string | null;
  argv: string[];
  exitCode: number;
  durationMs: number;
  success: boolean;
  cliVersion: string | null;
}

export interface CommandUsagePerCommand {
  command: string;
  total: number;
  failed: number;
}

export interface CommandUsageSummary {
  total: number;
  succeeded: number;
  failed: number;
  byCommand: CommandUsagePerCommand[];
}

export interface SessionCommandUsage {
  sessionId: string;
  summary: CommandUsageSummary;
  records: CommandUsageRecord[];
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

  // Assigned team for this task — spawning launches the team's leader as a
  // coordinator that recursively delegates to members/sub-teams.
  teamId?: string | null;

  // Per-member launch overrides saved on the task
  memberOverrides?: Record<string, MemberLaunchOverride>;

  // Task-level launch config (agent tool + model) chosen in the task modal.
  // Applied at spawn when neither the request nor a member override sets one.
  launchConfig?: LaunchConfig | null;

  // Run this task with --dangerously-skip-permissions
  dangerousMode?: boolean;

  // Spawn sessions in an isolated git worktree
  useWorktree?: boolean;

  // Due date for the task (ISO date string "YYYY-MM-DD" or null)
  dueDate?: string | null;

  // Spells attached to this task — baked into manifest at spawn (P1+).
  spellIds?: string[];

  // Docs attached to this task
  docs?: DocEntry[];

  // Images attached to this task
  images?: TaskImage[];

  // Client-generated idempotency key for deduplicating draft auto-creates
  clientRequestId?: string;

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
  humanCompletedAt?: number | null;  // Set when a human marks the session complete
  archivedAt?: number | null;  // Set when a session is closed/archived (Archived tab; precedence over completed)
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
  launchConfig?: LaunchConfig;  // Per-spawn launch override (model/effort/access) surfaced on the session summary DTO
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

  // Spell system — active spells on this session (P1+).
  activeSpells?: ActiveSpell[];
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
  teamId?: string | null;
  memberOverrides?: Record<string, MemberLaunchOverride>;
  launchConfig?: LaunchConfig;
  dueDate?: string;
  useWorktree?: boolean;
  dangerousMode?: boolean;
  clientRequestId?: string;
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
  teamId?: string | null;
  dueDate?: string | null;
  memberOverrides?: Record<string, MemberLaunchOverride>;
  launchConfig?: LaunchConfig | null;  // null clears the task-level model
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

// Task Graph types
export type TaskGraphStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'paused';

export interface TaskGraphNode {
  taskId: string;
  position: { x: number; y: number };
  teamMemberId?: string;
  memberOverrides?: MemberLaunchOverride;
}

export interface TaskGraphEdge {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  label?: string;
}

export interface TaskGraph {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  coordinatorTeamMemberId?: string;
  coordinatorModel?: string;
  status: TaskGraphStatus;
  executionSessionId?: string;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskGraphPayload {
  projectId: string;
  name: string;
  description?: string;
  nodes?: TaskGraphNode[];
  edges?: TaskGraphEdge[];
  coordinatorTeamMemberId?: string;
  coordinatorModel?: string;
}

export interface UpdateTaskGraphPayload {
  name?: string;
  description?: string;
  nodes?: TaskGraphNode[];
  edges?: TaskGraphEdge[];
  coordinatorTeamMemberId?: string;
  coordinatorModel?: string;
  status?: TaskGraphStatus;
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
  humanCompletedAt?: number | null;
  archivedAt?: number | null;
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
  launchConfig?: LaunchConfig;
  agentTool?: AgentTool;
  model?: ModelType | string;
  reasoningEffort?: LaunchReasoningEffort;
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
  teamId?: string | null;             // Saved team this session belongs to (recursive team launch)
  launchConfig?: LaunchConfig;        // Canonical launch override for this run
  agentTool?: AgentTool;              // Legacy launch override; normalized by server
  model?: ModelType | string;         // Legacy launch override; normalized by server
  reasoningEffort?: LaunchReasoningEffort; // Legacy launch override; normalized by server
  memberOverrides?: Record<string, MemberLaunchOverride>;  // Per-member overrides keyed by teamMemberId
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  delegatePermissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  useWorktree?: boolean;
  cols?: number;                       // Web: browser's measured terminal size so the
  rows?: number;                       // server PTY boots at the real pane width, not 80x24
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
  teamId?: string | null;
  launchConfig?: LaunchConfig;
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

export type SessionTreeNode = MaestroSession & { children: SessionTreeNode[] };

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

// ─── Spell Types (redesign v2 — multi-rule; mirrors maestro-server §11.1) ───

/** Frozen palette — must mirror SPELL_COLORS in maestro-server/src/types.ts. */
export type SpellColorSlug =
  | 'amber' | 'rose' | 'violet' | 'sky' | 'emerald'
  | 'fuchsia' | 'lime' | 'cyan' | 'indigo';

/** v1 action taxonomy (no `gate`). */
export type SpellActionType =
  | 'inject-prompt'
  | 'feed-context'
  | 'run-command'
  | 'continue-loop'
  | 'notify-channel';

export type SpellLoopType =
  | 'single-shot'
  | 'continue-until-done'
  | 'plan-execute'
  | 'critic-refine';

/** 8 Claude Code hook events (was 6 — SubagentStop + SessionEnd added). */
export type SpellHookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'Notification'
  | 'SessionStart'
  | 'SessionEnd';

/** Discriminated on `type`. `schedule` is Phase-2 (rejected at save in v1). */
export type SpellTrigger =
  | { type: 'hook'; hookEvent: SpellHookEvent; matcher?: string }
  | { type: 'schedule'; cron?: string; intervalMs?: number };

/** Discriminated on `type` — exhaustive narrowing in dispatcher + editor. */
export type SpellActionConfig =
  | { type: 'inject-prompt'; prompt: string }
  | { type: 'feed-context'; prompt: string }
  | { type: 'run-command'; command: string; args?: string[]; cwd?: string; feedOutput?: boolean }
  | { type: 'continue-loop'; loopType?: SpellLoopType; maxIterations?: number }
  // notify-channel is in-app only (C3): the `channel` relay field was dropped.
  | { type: 'notify-channel'; message?: string };

/**
 * Per-event capability matrix (§11.2) — single source of truth shared by the
 * editor action dropdown (and mirrored by the server Zod schema). An action not
 * listed for an event is unselectable in the UI and rejected server-side.
 */
export const ACTIONS_BY_EVENT: Record<SpellHookEvent, SpellActionType[]> = {
  PreToolUse:       ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  PostToolUse:      ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  UserPromptSubmit: ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  Stop:             ['inject-prompt', 'feed-context', 'run-command', 'continue-loop', 'notify-channel'],
  SubagentStop:     ['inject-prompt', 'feed-context', 'run-command', 'continue-loop', 'notify-channel'],
  Notification:     ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  SessionStart:     ['inject-prompt', 'feed-context', 'run-command', 'notify-channel'],
  SessionEnd:       ['run-command', 'notify-channel'],
};

/** Library category used by SpellLauncher nav. */
export type SpellCategory =
  | 'featured'
  | 'execute'
  | 'plan'
  | 'gate'
  | 'notify'
  | 'custom'
  | 'skills';

export interface SpellRule {
  id: string;                     // idGenerator('rule'); stable per-rule
  label?: string;                 // optional human handle — drives summary line
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

/** Rule shape accepted by create/update payloads (server assigns id if absent). */
export interface SpellRuleInput {
  id?: string;
  label?: string;
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

export interface Spell {
  id: string;
  name: string;
  description: string;            // human summary only (NOT the injected body)
  icon?: string;
  color: SpellColorSlug;
  rules: SpellRule[];             // 1..20
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Per-session activation state for a Spell. Mirrors Session.activeSpells. */
export interface ActiveSpell {
  spellId: string;
  color: SpellColorSlug;
  enabled: boolean;
  ruleIterations: Record<string, number>;  // ruleId → iteration (loops are per-rule)
  ensembleId?: string;
  castAt: number;
  castBy: string | null;
}

export interface CreateSpellPayload {
  name: string;
  description: string;
  icon?: string;
  color: SpellColorSlug;
  rules: SpellRuleInput[];
}

export interface UpdateSpellPayload {
  name?: string;
  description?: string;
  icon?: string;
  color?: SpellColorSlug;
  rules?: SpellRuleInput[];
}

/** Cast mode selected in the launcher, sent to the server (C1). */
export type SpellCastMode = 'single' | 'broadcast' | 'coordinate';

/** Server cast-spell request shape (matches POST /api/spells/:id/activate). */
export interface CastSpellInput {
  spellId: string;
  targetSessionIds: string[];
  invokerSessionId?: string | null;
  /** Sent to the server; `coordinate` additionally forms an ensemble (C1). */
  castMode?: SpellCastMode;
  /** Ensemble name when castMode = coordinate (C1). */
  ensembleName?: string;
}

/** Response of POST /api/spells/:id/activate (C1 — may carry a new ensembleId). */
export interface ActivateSpellResult {
  spell: Spell;
  sessions: Array<{ sessionId: string; activeSpell: ActiveSpell }>;
  /** Present when castMode = coordinate created/reused an ensemble. */
  ensembleId?: string;
}

/** Severity for an in-app spell notification (C3 notify:progress payload). */
export type SpellNotifyLevel = 'info' | 'success' | 'warn';

/** `notify:progress` WS payload (C3) — drives the in-app toast + entry. */
export interface SpellNotifyProgress {
  sessionId: string;
  spellId?: string;
  ruleId?: string;
  message: string;
  level?: SpellNotifyLevel;
}

/** Per-rule dry-run match report row (C2 — POST /api/hooks/dispatch dryRun). */
export interface HookDispatchMatch {
  spellId: string;
  ruleId: string;
  action: string;
  wouldExecute: boolean;
  skipReason?: string;
}

/** Dry-run dispatch result (C2). Mirrors DispatchResult + the match report. */
export interface HookDispatchDryRunResult {
  dryRun: true;
  matched: HookDispatchMatch[];
  [key: string]: unknown;
}

export interface CastResult {
  spellId: string;
  activeSpells: ActiveSpell[];
  sessionIds: string[];
}

/** Ensemble entity — multi-session coordination unit (P4). */
export interface Ensemble {
  id: string;
  name: string;
  color: SpellColorSlug;
  objective: string;
  memberSessionIds: string[];
  leaderSessionId?: string | null;
  spellId: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  disbandedAt?: number | null;
}

// ─── Mechanism B — Casts / Entities / Custom Prompts (mirrors server §types) ───

/** Entity kinds a one-shot cast can be launched from. */
export type SpellEntityType =
  | 'maestro'
  | 'skill'
  | 'team-member'
  | 'task'
  | 'doc'
  | 'session'
  | 'custom-prompt';

/** A castable verb/template available for an entity type (GET /spells/definitions). */
export interface SpellDefinition {
  name: string;
  entityType: SpellEntityType;
  label: string;
  description: string;
  icon?: string;
  promptTemplate: string;
}

/** A concrete entity that can be cast from (GET /spells/entities/:type). */
export interface SpellEntity {
  id: string;
  type: SpellEntityType;
  name: string;
  description?: string;
  icon?: string;
  availableSpells: string[];
  metadata?: Record<string, any>;
}

/** POST /spells/invoke — one-shot cast (Mechanism B, no persistence/ring). */
export interface SpellInvocationPayload {
  entityType: SpellEntityType;
  entityId: string;
  /** Defaults to 'send' when omitted or null. */
  spellName?: string | null;
  targetSessionId?: string;
  targetSessionIds?: string[];
  invokerSessionId?: string | null;
  projectId: string;
  args?: Record<string, any>;
}

export interface SpellInvocationResult {
  success: boolean;
  prompt: string;
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  timestamp: number;
}

/** Reusable one-shot prompt snippet (custom-prompt CRUD). */
export interface CustomPrompt {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  content: string;
  tags?: string[];
  entityType?: SpellEntityType;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCustomPromptPayload {
  name: string;
  description?: string;
  icon?: string;
  content: string;
  tags?: string[];
  entityType?: SpellEntityType;
}

export interface UpdateCustomPromptPayload {
  name?: string;
  description?: string;
  icon?: string;
  content?: string;
  tags?: string[];
  entityType?: SpellEntityType;
}

/** Response of POST /spells/:id/reset-loop (CONTRACT-ADDENDUM Addition 1). */
export interface ResetLoopResult {
  spell: Spell;
  sessionId: string;
  activeSpell: ActiveSpell;
}

/** Minimal Skill type (P6, partial — UI manages local list for now). */
export interface Skill {
  id: string;
  slug: string;
  title: string;
  description?: string;
  scope: 'project' | 'global';
  body?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Git Types ───

export interface GitFileChange {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | '?';
  insertions: number;
  deletions: number;
}

export interface GitDiffSummary {
  branch: string;
  baseBranch: string;
  baseCommit: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
  commitCount: number;
  files: GitFileChange[];
}

export interface GitPrInfo {
  url: string;
  number: number;
  state: 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT';
  checks?: 'passing' | 'failing' | 'pending' | 'none';
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
}

export interface GitCapabilities {
  hasGit: boolean;
  hasGh: boolean;
  ghAuthed: boolean;
}

// Session transcript stats (computed from the Claude / Codex JSONL).
export interface SessionTranscriptMessage {
  timestamp: number;
  text: string;
  source: 'assistant' | 'user';
}

/**
 * Lightweight, tail-only transcript response used by live conversation views.
 * Unlike SessionStatsResponse, this does not scan the complete session log.
 */
export interface SessionLogDigestResponse {
  sessionId: string;
  workerName?: string;
  taskIds: string[];
  state: 'active' | 'idle' | 'needs_input';
  entries: SessionTranscriptMessage[];
  stuck: {
    silentDurationMs: number;
    toolCallsSinceLastText: number;
    warning: string;
  } | null;
  lastActivityTimestamp: number;
  summary?: string;
}

export interface SessionStatsResponse {
  sessionId: string;
  source: 'claude' | 'codex' | null;
  jsonlFound: boolean;
  partial: boolean;
  tokens: {
    input: number;
    output: number;
    cacheCreate: number;
    cacheRead: number;
    total: number;
  };
  messageCount: {
    user: number;
    assistant: number;
    total: number;
  };
  toolCallCount: number;
  toolUsage: Array<{ name: string; count: number }>;
  models: string[];
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  lastMessages: SessionTranscriptMessage[];
}
