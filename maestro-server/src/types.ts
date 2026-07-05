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

  // P1: Spells to auto-activate when sessions are spawned on this task
  spellIds?: string[];
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

  // P1: Spells currently active on this session (foundation for trigger/loop/gate behavior)
  activeSpells: ActiveSpell[];
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

/**
 * Fixed palette of spell ring colors. The hex value is the source of truth used
 * to render concentric border rings on list tiles, the spaces rail, and terminal
 * panels. Slugs are stable identifiers persisted on the Spell entity.
 */
export const SPELL_COLORS = [
  { slug: 'amber',   hex: '#f59e0b' },
  { slug: 'rose',    hex: '#f43f5e' },
  { slug: 'violet',  hex: '#8b5cf6' },
  { slug: 'sky',     hex: '#0ea5e9' },
  { slug: 'emerald', hex: '#10b981' },
  { slug: 'fuchsia', hex: '#d946ef' },
  { slug: 'lime',    hex: '#84cc16' },
  { slug: 'cyan',    hex: '#06b6d4' },
  { slug: 'indigo',  hex: '#6366f1' },
] as const;
export type SpellColorSlug = typeof SPELL_COLORS[number]['slug'];

/**
 * Frozen action taxonomy (v2 — §11.1). `gate` is dropped; the dispatcher no
 * longer blocks tool calls. The behavioral config for each action lives in the
 * discriminated `SpellActionConfig` union below.
 */
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

/**
 * Severity of an in-app `notify-channel` notification (C3 scope-down). The
 * former free-text `channel` routing hint was dropped — notify-channel is now
 * an honest in-app-only surface, so all that remains is the display severity.
 */
export type SpellNotifyLevel = 'info' | 'success' | 'warn';

/**
 * How a spell is cast across its target sessions (C1). `single`/`broadcast`
 * behave identically server-side (attach to each target); `coordinate`
 * additionally wires the targets into an Ensemble.
 */
export type SpellCastMode = 'single' | 'broadcast' | 'coordinate';

/**
 * Hook event a rule's trigger fires on. v2 expands the list to 8 (adds
 * SubagentStop + SessionEnd — these have REAL hook wiring, §11.6).
 */
export type SpellHookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'Notification'
  | 'SessionStart'
  | 'SessionEnd';

/**
 * Trigger (discriminated union on `type`). `schedule` is schema-ready but
 * REJECTED at save in v1 (§11.4) — the engine ships in a later phase.
 */
export type SpellTrigger =
  | { type: 'hook'; hookEvent: SpellHookEvent; matcher?: string }
  | { type: 'schedule'; cron?: string; intervalMs?: number };

/**
 * Action + its config, modelled as a discriminated union on `type` (PI-1) so
 * the dispatcher switch and editor config panel narrow exhaustively — no
 * `(spell as any)` field access. run-command exposes NO `timeoutMs` and runs
 * async fire-and-forget (§11.5).
 */
export type SpellActionConfig =
  | { type: 'inject-prompt'; prompt: string }
  | { type: 'feed-context'; prompt: string }
  | { type: 'run-command'; command: string; args?: string[]; cwd?: string; feedOutput?: boolean }
  | { type: 'continue-loop'; loopType?: SpellLoopType; maxIterations?: number }
  | { type: 'notify-channel'; message?: string; level?: SpellNotifyLevel };

/**
 * A single { trigger → action } binding within a spell. A spell holds 1..20
 * rules; each is independently enabled/disabled and matched at dispatch time.
 */
export interface SpellRule {
  id: string;              // idGenerator('rule'); stable
  label?: string;          // optional human handle; drives summary line + reset UX (PI-3)
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
}

/**
 * Per-event capability matrix (§11.2) — single source of truth shared by the
 * Zod schema and the editor action dropdown. An action not listed for an event
 * is unselectable in the UI and rejected by the schema. `continue-loop` only
 * means anything on Stop/SubagentStop; SessionEnd is terminal (no further turn
 * to inject/feed/loop into).
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

/**
 * First-class Spell entity (v2 — multi-rule). Persisted as data/spells/<id>.json
 * and merged with the curated SPELL_LIBRARY seeds at read time. `isDefault: true`
 * spells are non-deletable (see FileSystemSpellRepository).
 */
export interface Spell {
  id: string;
  name: string;
  /** Human summary only — NO longer the injected body (that lives on each rule's action). */
  description: string;
  icon?: string;
  color: SpellColorSlug;
  rules: SpellRule[];
  /** True for curated library entries; false (or omitted) for user-created. */
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Per-session activation state for a Spell. Lives on Session.activeSpells.
 * `color` is denormalized so UI rings can render without a second lookup. The
 * dispatcher re-reads the spell's rules at fire time, so no trigger fields are
 * denormalized here — only per-rule loop counters.
 */
export interface ActiveSpell {
  spellId: string;
  color: SpellColorSlug;
  enabled: boolean;
  /** ruleId → iteration count (continue-loop is per-rule now). */
  ruleIterations: Record<string, number>;
  /**
   * C4: per-rule RUNTIME enablement override on this session. A ruleId mapped to
   * `false` is skipped by the dispatcher even though the spell definition's
   * `rule.enabled` is true. Absent / `true` → the definition's enablement wins.
   */
  ruleEnabled?: Record<string, boolean>;
  ensembleId?: string;
  castAt: number;
  /** Session ID that cast it, or `null` for UI-cast. */
  castBy: string | null;
}

/** Rule as accepted on create/update — server assigns `id` where missing. */
export interface SpellRuleInput {
  id?: string;
  label?: string;
  enabled: boolean;
  trigger: SpellTrigger;
  action: SpellActionConfig;
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
  /** Defaults to 'send' when omitted or null. */
  spellName?: string | null;
  /** Single target. Either this or `targetSessionIds[0]` must resolve to a session. */
  targetSessionId?: string;
  /** Forward-compat multi-target list (Phase 2 fan-out). */
  targetSessionIds?: string[];
  /** Session that initiated the invoke (null = UI). */
  invokerSessionId?: string;
  projectId: string;
  /** Forward-compat per-spell args from CLI --args. */
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

// --- P2: Hook Dispatch protocol (v2 — multi-rule, no gate) ---
//
// The CLI binds every hook event once to `maestro hook dispatch <EVENT>`, which
// POSTs to /api/hooks/dispatch and translates DispatchResult into:
//   - exit 0 + stdout for inject-prompt / feed-context
//   - exit 2 + stderr "reason" for continue-loop(continue:true) on Stop/SubagentStop
//   - exit 0 + side effects for run-command (async, fire-and-forget) / notify-channel
//
// Composition (when multiple rules across multiple active spells fire on one event):
//   - feed-context stdout is concatenated in (activeSpell × rule) order (join('\n\n'))
//   - continue-loop signals compose by "any continue wins" on Stop/SubagentStop
//   - run-command / notify-channel actions all execute (side effects accumulate)
//
// There is NO block path — `gate` was dropped, so composeResult never emits
// exit 2 for a block. On any internal rule error the rule is skipped (fail-open)
// and the error is surfaced for logging; other rules continue.
//
// The contract is intentionally small so the CLI can stay dumb: receive a
// DispatchResult, fold it into exit code + stdout/stderr.
export interface HookDispatchPayload {
  sessionId: string;
  event: SpellHookEvent;
  /** Arbitrary structured payload forwarded from the Claude hook environment. */
  payload?: Record<string, any>;
  /** C2: side-effect-free probe — match + compose, execute nothing. */
  dryRun?: boolean;
}

/** Per-rule outcome status surfaced on spell:rule_fired (C5 adds blocked/skipped). */
export type HookRuleOutcomeStatus = 'ok' | 'error' | 'blocked' | 'skipped';

export interface HookDispatchSpellOutcome {
  spellId: string;
  /** The rule that produced this outcome. */
  ruleId?: string;
  action: SpellActionType;
  /** When set, the rule contributed feed-context text. */
  stdout?: string;
  /** When set, a continue-loop rule wants to continue (Stop/SubagentStop only). */
  continue?: boolean;
  reason?: string;
  /** Internal error swallowed by fail-open handling, surfaced for logging. */
  error?: string;
  /**
   * Resolved status for observability (C5). Defaults to 'error' when `error` is
   * set, else 'ok'. 'blocked' = permission-gated; 'skipped' = concurrency cap.
   */
  status?: HookRuleOutcomeStatus;
}

/** C2: per-rule dry-run match report entry. */
export interface DispatchMatchReport {
  spellId: string;
  ruleId?: string;
  action: SpellActionType;
  /** Whether this rule's action WOULD run on a live dispatch. */
  wouldExecute: boolean;
  /** Why it would NOT run (permission gate, disabled rule, etc.). */
  skipReason?: string;
}

export interface DispatchResult {
  /** Process exit code the CLI should use: 0 = allow, 2 = continue-loop. */
  exitCode: 0 | 2;
  /** Concatenated stdout payloads from feed-context actions. */
  stdout: string;
  /** Composed reason — loop continue reason. */
  reason?: string;
  /** Always false in v2 (gate dropped); retained for CLI wire compatibility. */
  blocked: boolean;
  /** True when the result represents a loop continue signal (Stop/SubagentStop). */
  continued: boolean;
  /** Per-rule breakdown, for logging and CLI debug. */
  spells: HookDispatchSpellOutcome[];
  timestamp: number;
  /** C2: true when this result came from a dry-run probe (nothing executed). */
  dryRun?: boolean;
  /** C2: per-rule match report — only populated on dry-run. */
  matched?: DispatchMatchReport[];
}

// --- P4: Ensemble — persisted multi-session coordination unit ---
export interface Ensemble {
  id: string;
  name: string;
  /** SpellColorSlug so ensemble rings share the spell palette. */
  color: SpellColorSlug;
  /** Shared goal communicated to every member at activation. */
  objective: string;
  memberSessionIds: string[];
  leaderSessionId?: string | null;
  /** The "coordinate" spell that wires members together (default: spell_coordinate). */
  spellId: string;
  /** Session ID that created it, or `null` for UI-created. */
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  disbandedAt?: number | null;
}

export interface CreateEnsemblePayload {
  name: string;
  color: SpellColorSlug;
  objective: string;
  memberSessionIds: string[];
  leaderSessionId?: string | null;
  spellId: string;
  createdBy?: string | null;
}

export interface UpdateEnsemblePayload {
  name?: string;
  color?: SpellColorSlug;
  objective?: string;
  leaderSessionId?: string | null;
}

export interface EnsembleMessagePayload {
  /** Free-form message broadcast to every member session as a prompt. */
  content: string;
  /** Session that initiated the message (null = UI). */
  senderSessionId?: string | null;
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
  spellIds?: string[];
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
  spellIds?: string[];
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
  activeSpells?: ActiveSpell[]; // P1: replace the session's active spell list
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
