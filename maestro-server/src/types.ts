// Ordering types (separate from task/session models - UI ordering only)
export interface Ordering {
  projectId: string;
  entityType: string;
  orderedIds: string[];  // Ordered array of entity IDs
  updatedAt: number;
}

export interface UpdateOrderingPayload {
  orderedIds: string[];
}

// Task list types (first-class entity)
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

// Task graph types (DAG-based task execution)
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
  executionSessionId?: string;
  lastRunAt?: number;
}

// Worker strategy types
export type WorkerStrategy = 'simple' | 'tree';
export type OrchestratorStrategy = 'default' | 'intelligent-batching' | 'dag';
export type AgentTool = 'claude-code' | 'codex' | 'hermes' | 'gemini';
export type LaunchProvider = 'claude' | 'openai' | 'hermes' | 'gemini';
export type LaunchReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type LaunchSpeed = 'standard' | 'fast';
export type LaunchAccessMode = 'safe' | 'acceptEdits' | 'plan' | 'fullAccess';

export interface LaunchConfig {
  provider: LaunchProvider;
  model: string;
  reasoningEffort?: LaunchReasoningEffort;
  speed?: LaunchSpeed;
  accessMode?: LaunchAccessMode;
}

// Model Profile — a named, workspace-global launch config ("class" of model)
// that team members reference by id. Updating a profile re-points every member
// bound to it, so the fleet can be upgraded in one place (dependency inversion).
export interface ModelProfile {
  id: string;
  name: string;
  description?: string;
  launchConfig: LaunchConfig;
  isDefault?: boolean;                 // true for the auto-seeded tiers
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
}

export interface CreateModelProfilePayload {
  name: string;
  description?: string;
  launchConfig: LaunchConfig;
}

export interface UpdateModelProfilePayload {
  name?: string;
  description?: string;
  launchConfig?: LaunchConfig;
}

/**
 * A durable, cross-project record of one session prompting another via
 * POST /api/sessions/:id/prompt. Stored flat at <dataDir>/session-prompts/<id>.json.
 * `content` is the FULL, clean message WITHOUT the [From: name (id)] terminal prefix.
 */
export interface SessionPrompt {
  id: string;                                   // sp_<ts>_<rand>
  fromSessionId: string;
  toSessionId: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  content: string;                              // full, clean (no [From: ...] prefix)
  mode: 'send' | 'paste';
  fromTeamMember: TeamMemberSnapshot | null;
  toTeamMember: TeamMemberSnapshot | null;
  fromSessionName: string | null;
  toSessionName: string | null;
  timestamp: number;
}

/** Input for SessionPromptService.record — snapshots/names are resolved by the service. */
export interface RecordSessionPromptInput {
  fromSessionId: string;
  toSessionId: string;
  content: string;
  mode: 'send' | 'paste';
}

/** A session participating in a Huddle, with resolved (best-effort) metadata. */
export interface HuddleSessionRef {
  sessionId: string;
  sessionName: string | null;
  projectId: string | null;
  teamMember: TeamMemberSnapshot | null;
}

/**
 * A Huddle is a connected component over the graph where each SessionPrompt is
 * an undirected edge fromSessionId<->toSessionId. All-time and cross-project.
 * Every huddle has >=2 sessions (built from edges, so singletons never appear).
 */
export interface Huddle {
  id: string;                    // huddle_<short hash of sorted sessionIds> — stable
  sessionIds: string[];          // sorted ascending
  sessions: HuddleSessionRef[];
  prompts: SessionPrompt[];      // sorted by timestamp ascending
  promptCount: number;
  lastActivity: number;          // max prompt timestamp in the component
}

// Four-mode model types
export type AgentMode = 'worker' | 'coordinator' | 'coordinated-worker' | 'coordinated-coordinator';
/** Legacy mode aliases for backward compatibility */
export type LegacyAgentMode = 'execute' | 'coordinate';
/** All accepted mode values (includes legacy aliases) */
export type AgentModeInput = AgentMode | LegacyAgentMode;

/** Helper: is this a worker-type mode? */
export function isWorkerMode(mode: string): boolean {
  return mode === 'worker' || mode === 'coordinated-worker' || mode === 'execute';
}
/** Helper: is this a coordinator-type mode? */
export function isCoordinatorMode(mode: string): boolean {
  return mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate';
}
/**
 * Normalize a mode value to the four-mode model. The "coordinated-" prefix is
 * derived from `hasCoordinator` (i.e. whether a parent coordinator session
 * exists), not from the input itself — so an already-coordinated input is
 * downgraded to its base mode when spawned without a coordinator. This keeps
 * the resolved mode coherent with `coordinatorSessionId`.
 */
export function normalizeMode(mode: string, hasCoordinator?: boolean): AgentMode {
  if (mode === 'execute' || mode === 'worker' || mode === 'coordinated-worker')
    return hasCoordinator ? 'coordinated-worker' : 'worker';
  if (mode === 'coordinate' || mode === 'coordinator' || mode === 'coordinated-coordinator')
    return hasCoordinator ? 'coordinated-coordinator' : 'coordinator';
  return mode as AgentMode;
}

// Per-member launch override for team launch configuration
export interface MemberLaunchOverride {
  launchConfig?: LaunchConfig;
  agentTool?: AgentTool;               // Legacy launch override; normalized into launchConfig
  model?: string;                      // Legacy launch override; normalized into launchConfig
  reasoningEffort?: LaunchReasoningEffort; // Legacy launch override; normalized into launchConfig
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  skillIds?: string[];
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
}

// Base types
export interface Project {
  id: string;
  name: string;
  workingDir: string;
  description?: string;
  isMaster?: boolean;        // Marks this as a master project with cross-project access
  createdAt: number;
  updatedAt: number;
}

// Team Member entity (first-class, separate from Task)
export type TeamMemberStatus = 'active' | 'archived';
export type TeamMemberScope = 'project' | 'global';

// Discriminator for auto-seeded, non-deletable system team members.
export type SystemTeamMemberKind = 'alexa-coordinator';

export interface TeamMember {
  id: string;                          // "tm_<timestamp>_<random>" or deterministic for defaults
  projectId: string;
  systemKind?: SystemTeamMemberKind;   // Set for auto-seeded system members (non-deletable, recreated on startup)
  scope?: TeamMemberScope;             // 'project' (default) or 'global' — global members shared across all projects
  name: string;                        // "Worker", "Coordinator", "Frontend Dev"
  role: string;                        // "Default executor", "Task orchestrator"
  identity?: string;                   // Custom instructions / persona prompt (optional; empty means no persona)
  avatar: string;                      // Emoji: "🔧", "🎯", "🎨"
  model?: string;                      // "opus", "sonnet", "haiku" — fallback when no modelProfileId
  modelProfileId?: string;             // Points at a ModelProfile; resolved to a launch config at spawn
  agentTool?: AgentTool;               // "claude-code", "codex", "hermes", "gemini"
  mode?: AgentMode;                    // "execute" or "coordinate"
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  strategy?: string;                   // Deprecated: kept for backward compatibility
  skillIds?: string[];
  isDefault: boolean;                  // true for Worker & Coordinator
  status: TeamMemberStatus;            // 'active' | 'archived'

  capabilities?: {
    can_spawn_sessions?: boolean;
    can_edit_tasks?: boolean;
    can_report_task_level?: boolean;
    can_report_session_level?: boolean;
  };

  // Phase 2: Command permission overrides
  commandPermissions?: {
    groups?: Record<string, boolean>;    // e.g. { task: true, session: false }
    commands?: Record<string, boolean>;  // e.g. { "session:spawn": true }
  };

  // Phase 3: Workflow customization
  workflowTemplateId?: string;         // Built-in template ID or 'custom'
  customWorkflow?: string;             // Freeform workflow text (when workflowTemplateId === 'custom')

  // Self-awareness: persistent memory for the team member
  memory?: string[];                   // Important details the agent remembers across sessions

  // Sound identity — the instrument this team member "plays" in the session ensemble
  soundInstrument?: string;            // 'piano' | 'guitar' | 'violin' | 'trumpet' | 'drums'

  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
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
  identity?: string;
  avatar: string;
  model?: string;
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
  soundInstrument?: string;
}

export interface UpdateTeamMemberPayload {
  name?: string;
  role?: string;
  identity?: string;
  avatar?: string;
  model?: string;
  modelProfileId?: string;
  agentTool?: AgentTool;
  mode?: AgentMode;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  strategy?: string;
  skillIds?: string[];
  status?: TeamMemberStatus;
  scope?: TeamMemberScope;
  capabilities?: TeamMember['capabilities'];
  commandPermissions?: TeamMember['commandPermissions'];
  workflowTemplateId?: string;
  customWorkflow?: string;
  memory?: string[];
  soundInstrument?: string;
}

// Team entity (groups TeamMembers together for coordination)
export type TeamStatus = 'active' | 'archived';

export interface Team {
  id: string;                          // 'team_<timestamp>_<random>'
  projectId: string;
  name: string;
  description?: string;
  avatar?: string;                     // Emoji
  leaderId: string;                    // Team member ID — the coordinator/leader
  memberIds: string[];                 // Team member IDs in this team
  subTeamIds: string[];                // Other Team IDs for team-of-teams hierarchy
  parentTeamId?: string | null;        // Reverse lookup — which team contains this one
  status: TeamStatus;
  metadata?: Record<string, any>;
  createdAt: string;                   // ISO 8601
  updatedAt: string;                   // ISO 8601
}

export interface TeamSnapshot {
  id: string;
  name: string;
  avatar?: string;
  leaderId: string;
  memberCount: number;
}

// Hydrated member shape used inside a resolved team tree.
export interface TeamTreeMember {
  id: string;
  name: string;
  role: string;
  identity?: string;
  avatar?: string;
  mode?: AgentMode;
  isLeader: boolean;
}

// Recursive, fully-resolved team tree used by the org chart, manifest, and CLI.
export interface TeamTreeNode {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId: string;
  status: TeamStatus;
  members: TeamTreeMember[];
  subTeams: TeamTreeNode[];
}

export interface CreateTeamPayload {
  projectId: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId: string;
  memberIds: string[];
  subTeamIds?: string[];
  parentTeamId?: string | null;
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
  avatar?: string;
  leaderId?: string;
  memberIds?: string[];
  subTeamIds?: string[];
  parentTeamId?: string | null;
  status?: TeamStatus;
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  taskSessionStatuses?: Record<string, TaskSessionStatus>;  // Per-session status map: { [sessionId]: status }
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  initialPrompt: string;

  // PHASE IV-A: Many-to-many relationships
  sessionIds: string[];        // Multiple sessions working on this task
  skillIds: string[];          // Skills assigned (Phase IV-B)
  agentIds: string[];          // Agents assigned (Phase IV-C)

  dependencies: string[];
  // NOTE: timeline moved to Session - each session has its own timeline

  // Reference task IDs for context (docs from these tasks are provided to the agent)
  referenceTaskIds?: string[];

  // Pinned tasks appear in the dedicated "Pinned" tab for quick re-execution
  pinned?: boolean;

  // Assigned team member for this task
  teamMemberId?: string;

  // Multiple team member identities for this task (takes precedence over teamMemberId)
  teamMemberIds?: string[];

  // Assigned team for this task. When set, spawning launches the team's leader as
  // a coordinator that recursively delegates to members/sub-teams.
  teamId?: string | null;

  // Per-member launch overrides saved on the task
  memberOverrides?: Record<string, MemberLaunchOverride>;

  // Run this task with --dangerously-skip-permissions
  dangerousMode?: boolean;

  // Spawn sessions in an isolated git worktree
  useWorktree?: boolean;

  // Due date for the task (ISO date string "YYYY-MM-DD" or null)
  dueDate: string | null;

  // Images attached to this task
  images?: TaskImage[];

  // Client-generated idempotency key for deduplicating draft auto-creates
  clientRequestId?: string;
}

export interface Session {
  id: string;
  projectId: string;

  // PHASE IV-A: Changed from taskId to taskIds
  taskIds: string[];           // Multiple tasks in this session

  name: string;                // Session name
  agentId?: string;            // Agent running this session (Phase IV-C)
  claudeSessionId?: string;    // Pre-generated Claude CLI session ID for resume support
  env: Record<string, string>; // Environment variables
  strategy?: string;    // Deprecated: kept for backward compatibility

  status: SessionStatus;
  startedAt: number;
  lastActivity: number;
  completedAt: number | null;
  humanCompletedAt?: number | null;  // Set when a human marks the session complete (moves it to Completed tab)
  archivedAt?: number | null;  // Set when a session is closed/archived (moves it to Archived tab; takes precedence over completed)
  hostname: string;
  platform: string;
  events: SessionEvent[];
  timeline: SessionTimelineEvent[];  // Session's activity timeline
  docs: DocEntry[];                  // Documents created/added during session
  metadata?: Record<string, any>;  // Additional metadata (skill, spawnedBy, etc.)
  needsInput?: {
    active: boolean;
    message?: string;
    since?: number;
  };
  teamMemberId?: string;
  teamMemberSnapshot?: TeamMemberSnapshot;

  // Multiple team member identities for this session
  teamMemberIds?: string[];
  teamMemberSnapshots?: TeamMemberSnapshot[];
  parentSessionId?: string | null;
  rootSessionId?: string | null;   // Top-most session in a spawn chain
  teamSessionId?: string | null;   // Shared ID linking coordinator + workers (= coordinator's session ID)
  teamId?: string | null;          // Optional saved Team reference
  isMasterSession?: boolean;       // Derived from project.isMaster at spawn time
}

// Supporting types
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled' | 'blocked' | 'archived';
export type TaskSessionStatus = 'working' | 'blocked' | 'completed' | 'failed' | 'skipped';
export type TaskPriority = 'low' | 'medium' | 'high';
export type SessionStatus = 'spawning' | 'idle' | 'working' | 'completed' | 'failed' | 'stopped';

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
  | 'doc_added'          // Documentation added
  | 'prompt_received';   // Prompt received from another session

export interface SessionTimelineEvent {
  id: string;
  type: SessionTimelineEventType;
  timestamp: number;
  message?: string;
  taskId?: string;                    // Which task this event relates to
  metadata?: Record<string, any>;     // Extensible metadata
}

// Document entry for session/task docs
export interface DocEntry {
  id: string;
  title: string;
  filePath: string;
  kind?: 'markdown' | 'diagram';      // Default "markdown" for back-compat; "diagram" stores .excalidraw content
  content?: string;                   // Optional inline markdown content (deprecated: stored in separate files)
  contentFilePath?: string;           // Path to file storing doc content (replaces inline content)
  taskId?: string;                    // Which task this doc relates to
  addedAt: number;
  addedBy?: string;                   // Session that added this doc
}

// Image attached to a task
export interface TaskImage {
  id: string;
  filename: string;                   // Original filename
  mimeType: string;                   // e.g. 'image/png', 'image/jpeg'
  size: number;                       // File size in bytes
  addedAt: number;
}

export interface SessionEvent {
  id: string;
  timestamp: number;
  type: string;
  data?: any;
}

// Spell types
export type SpellEntityType = 'maestro' | 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

export interface SpellDefinition {
  name: string;
  entityType: SpellEntityType;
  label: string;
  description: string;
  icon?: string;
  promptTemplate: string;
}

export interface SpellEntity {
  id: string;
  type: SpellEntityType;
  name: string;
  description?: string;
  icon?: string;
  availableSpells: string[];
  metadata?: Record<string, any>;
}

export interface SpellInvocationPayload {
  entityType: SpellEntityType;
  entityId: string;
  spellName: string;
  targetSessionId: string;
  projectId: string;
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

// API request/response types
export interface CreateTaskPayload {
  projectId: string;
  parentId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  initialPrompt?: string;
  skillIds?: string[];
  referenceTaskIds?: string[];
  teamMemberId?: string;
  teamMemberIds?: string[];
  teamId?: string | null;
  memberOverrides?: Record<string, MemberLaunchOverride>;
  dangerousMode?: boolean;
  useWorktree?: boolean;
  dueDate?: string;
  clientRequestId?: string;
}

export type UpdateSource = 'user' | 'session';

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: TaskStatus;
  sessionStatus?: TaskSessionStatus;  // Backward compat: session-source updates send single status (mapped to taskSessionStatuses[sessionId])
  taskSessionStatuses?: Record<string, TaskSessionStatus>;  // Direct map update (for user/internal updates)
  priority?: TaskPriority;
  sessionIds?: string[];      // PHASE IV-A: Update sessions
  skillIds?: string[];         // PHASE IV-B
  agentIds?: string[];         // PHASE IV-C
  referenceTaskIds?: string[];
  pinned?: boolean;
  teamMemberId?: string;
  teamMemberIds?: string[];
  teamId?: string | null;
  dueDate?: string | null;
  memberOverrides?: Record<string, MemberLaunchOverride>;  // Per-member launch overrides
  dangerousMode?: boolean;
  useWorktree?: boolean;
  images?: TaskImage[];
  // NOTE: timeline removed - use session timeline via /sessions/:id/timeline
  // Update source tracking
  updateSource?: UpdateSource;  // Who is making the update
  sessionId?: string;           // Session ID if updateSource === 'session'
}

export interface CreateSessionPayload {
  id?: string;
  projectId: string;
  taskIds: string[];           // PHASE IV-A: Array of task IDs
  name?: string;
  agentId?: string;
  claudeSessionId?: string;    // Pre-generated Claude CLI session ID for resume support
  strategy?: string;   // Deprecated: kept for backward compatibility
  status?: SessionStatus;
  env?: Record<string, string>;
  metadata?: Record<string, any>;
  parentSessionId?: string | null;
  rootSessionId?: string | null;
  teamSessionId?: string | null;
  teamId?: string | null;
  isMasterSession?: boolean;       // Set when spawned in a master project
  _suppressCreatedEvent?: boolean;  // Internal: suppress session:created event
}

export interface UpdateSessionPayload {
  taskIds?: string[];          // PHASE IV-A: Update tasks
  status?: SessionStatus;
  agentId?: string;
  env?: Record<string, string>;  // Environment variables
  events?: SessionEvent[];
  timeline?: SessionTimelineEvent[];  // Append timeline events
  needsInput?: {
    active: boolean;
    message?: string;
    since?: number;
  };
  rootSessionId?: string | null;
  teamSessionId?: string | null;
  teamId?: string | null;
  mode?: AgentMode;            // Update session mode (stored in metadata.mode)
  metadata?: Record<string, any>;  // Merged into session.metadata (shallow merge)
  humanCompletedAt?: number | null;  // Human-driven completion timestamp (null to reopen)
  archivedAt?: number | null;  // Archive timestamp (null to unarchive)
}

/** Payload emitted on session:mode_changed event */
export interface SessionModeChangedPayload {
  sessionId: string;
  mode: AgentMode;
  previousMode: AgentMode;
  changed: boolean;
  timestamp: number;
}

// Spawn session payload (Server-Generated Manifests)
export interface SpawnSessionPayload {
  projectId: string;
  taskIds: string[];
  mode?: AgentMode;                     // Four-mode model: worker/coordinator/coordinated-worker/coordinated-coordinator
  strategy?: string;                    // Deprecated: kept for backward compatibility
  spawnSource?: 'ui' | 'session';      // Who is calling (ui or session)
  sessionId?: string;                   // Required when spawnSource === 'session' (parent session ID)
  sessionName?: string;
  skills?: string[];
  context?: Record<string, any>;
  teamMemberId?: string;                // Team member running this session (backward compat)
  teamMemberIds?: string[];             // Multiple team member identities for this session
  delegateTeamMemberIds?: string[];     // Team member IDs for coordination delegation pool
  launchConfig?: LaunchConfig;          // Canonical launch override for this run
  agentTool?: AgentTool;                // Legacy launch override; normalized into launchConfig
  model?: string;                       // Legacy launch override; normalized into launchConfig
  reasoningEffort?: LaunchReasoningEffort; // Legacy launch override; normalized into launchConfig
  initialDirective?: {
    subject: string;
    message: string;
    fromSessionId?: string;
  };
  memberOverrides?: Record<string, MemberLaunchOverride>; // Per-member launch overrides
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  delegatePermissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  useWorktree?: boolean;
}

// Spawn request event (emitted by server to UI)
export interface SpawnRequestEvent {
  session: Session;
  projectId: string;
  taskIds: string[];
  command: string;
  cwd: string;
  envVars: Record<string, string>;
  manifest?: any;
  spawnSource: 'ui' | 'session';        // Who initiated the spawn
  parentSessionId?: string;              // Parent session ID if session-initiated
  rootSessionId?: string;                // Top-most session ID in the spawn chain
  _isSpawnCreated?: boolean;             // Backward compatibility flag
}
