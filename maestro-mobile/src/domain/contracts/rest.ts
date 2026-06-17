// REST wire contracts — request bodies + response envelopes.
//
// Request payloads mirror maestro-server/src/types.ts EXACTLY (drift-guarded).
// Response envelopes follow the analysis doc + observed route shapes. Conduit
// (services/api/) consumes these as its single source of request/response types.
import type { EpochMs, JsonObject } from '../primitives';
import type {
  TaskStatus,
  TaskPriority,
  TaskSessionStatus,
  TaskGraphStatus,
  AgentMode,
  AgentTool,
  LaunchReasoningEffort,
  PermissionMode,
  TeamMemberStatus,
  TeamMemberScope,
  TeamStatus,
  SpellEntityType,
} from '../enums';
import type { LaunchConfig, MemberLaunchOverride } from '../entities/launchOverride';
import type { TaskImage, Task } from '../entities/task';
import type { Session, SessionEvent, SessionTimelineEvent, SessionNeedsInput } from '../entities/session';
import type { TeamMemberCapabilities, CommandPermissions } from '../entities/teamMember';
import type { TaskGraphNode, TaskGraphEdge } from '../entities/taskGraph';

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export interface UpdateOrderingPayload {
  orderedIds: string[];
}

// ---------------------------------------------------------------------------
// Task list
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task graph
// ---------------------------------------------------------------------------

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
  lastRunAt?: EpochMs;
}

// ---------------------------------------------------------------------------
// Model profile
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Team member
// ---------------------------------------------------------------------------

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
  permissionMode?: PermissionMode;
  strategy?: string;
  skillIds?: string[];
  capabilities?: TeamMemberCapabilities;
  commandPermissions?: CommandPermissions;
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
  permissionMode?: PermissionMode;
  strategy?: string;
  skillIds?: string[];
  status?: TeamMemberStatus;
  scope?: TeamMemberScope;
  capabilities?: TeamMemberCapabilities;
  commandPermissions?: CommandPermissions;
  workflowTemplateId?: string;
  customWorkflow?: string;
  memory?: string[];
  soundInstrument?: string;
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

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
  /** Backward compat: session-source single status (mapped to taskSessionStatuses[sessionId]). */
  sessionStatus?: TaskSessionStatus;
  taskSessionStatuses?: Record<string, TaskSessionStatus>;
  priority?: TaskPriority;
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
  dangerousMode?: boolean;
  useWorktree?: boolean;
  images?: TaskImage[];
  updateSource?: UpdateSource;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface CreateSessionPayload {
  id?: string;
  projectId: string;
  taskIds: string[];
  name?: string;
  agentId?: string;
  claudeSessionId?: string;
  strategy?: string;
  status?: Session['status'];
  env?: Record<string, string>;
  metadata?: Record<string, any>;
  parentSessionId?: string | null;
  rootSessionId?: string | null;
  teamSessionId?: string | null;
  teamId?: string | null;
  isMasterSession?: boolean;
  _suppressCreatedEvent?: boolean;
}

export interface UpdateSessionPayload {
  taskIds?: string[];
  status?: Session['status'];
  agentId?: string;
  env?: Record<string, string>;
  events?: SessionEvent[];
  timeline?: SessionTimelineEvent[];
  needsInput?: SessionNeedsInput;
  rootSessionId?: string | null;
  teamSessionId?: string | null;
  teamId?: string | null;
  mode?: AgentMode;
  metadata?: Record<string, any>;
  humanCompletedAt?: EpochMs | null;
  archivedAt?: EpochMs | null;
}

// ---------------------------------------------------------------------------
// Spawn — mirrors server SpawnSessionPayload exactly (drift-guarded).
// The OUTBOUND request shape Conduit actually sends (incl. cols/rows) is the
// z.infer of schemas/spawn.ts → SpawnSessionRequest. Keep both: this type is
// the server's TS contract; that one is the validated wire body.
// ---------------------------------------------------------------------------

export interface SpawnSessionPayload {
  projectId: string;
  taskIds: string[];
  mode?: AgentMode;
  strategy?: string;
  /** Mobile always sends 'ui' ('session' needs an X-Session-Id coordinator header → 403). */
  spawnSource?: 'ui' | 'session';
  sessionId?: string;
  sessionName?: string;
  skills?: string[];
  context?: Record<string, any>;
  teamMemberId?: string;
  teamMemberIds?: string[];
  delegateTeamMemberIds?: string[];
  launchConfig?: LaunchConfig;
  agentTool?: AgentTool;
  model?: string;
  reasoningEffort?: LaunchReasoningEffort;
  initialDirective?: {
    subject: string;
    message: string;
    fromSessionId?: string;
  };
  memberOverrides?: Record<string, MemberLaunchOverride>;
  permissionMode?: PermissionMode;
  delegatePermissionMode?: PermissionMode;
  useWorktree?: boolean;
}

// ---------------------------------------------------------------------------
// Custom prompt
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

/** Generic success envelope — most endpoints return the raw entity JSON instead. */
export type SuccessEnvelope = { success: true } & Record<string, unknown>;

/** Error envelope. `code` includes 'VALIDATION_ERROR' (400 from a .strict() schema). */
export interface ErrorEnvelope {
  error: true;
  code: string;
  message: string;
}

/** POST /api/sessions/spawn success body. */
export interface SpawnSessionResponse {
  success: true;
  sessionId: string;
  manifestPath: string;
  message: string;
  session: Session;
}

// ---------------------------------------------------------------------------
// Git responses — observed from gitRoutes.ts res.json shapes (NOT in types.ts,
// so NOT drift-guarded; treat as wire-observed forward contracts).
// ---------------------------------------------------------------------------

export interface GitFileChange {
  path: string;
  status: string;
  additions?: number;
  deletions?: number;
}

export interface GitDiffSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
  files: GitFileChange[];
}

export interface GitPrInfo {
  url: string;
  number: number;
  state: string;
  title?: string;
}

/** GET /api/git/.../status — either no worktree, or a full summary. */
export type GitStatusResponse =
  | { hasWorktree: false }
  | { hasWorktree: true; summary: GitDiffSummary; pr: GitPrInfo | null; suggestedPr?: unknown };

export interface GitDiffResponse {
  diff: string;
}

export interface GitPrInfoResponse {
  pr: GitPrInfo | null;
}

export interface GitBranchResponse {
  branchName: string;
}

export interface GitMergeResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// Auxiliary response types (NOT in maestro-server/src/types.ts — sourced from
// service/route shapes; wire-observed forward contracts, NOT drift-guarded).
// Authored for Conduit's MaestroClient.
// ---------------------------------------------------------------------------

// GET /sessions/:id/stats → LogDigestService.SessionStatsDigest
export interface StatsTextEntry {
  timestamp: EpochMs;
  text: string;
  source: 'assistant' | 'user';
}

export interface SessionStatsResponse {
  sessionId: string;
  source: 'claude' | 'codex' | null;
  jsonlFound: boolean;
  /** True when the file was too large and we truncated. */
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
  firstMessageAt: EpochMs | null;
  lastMessageAt: EpochMs | null;
  lastMessages: StatsTextEntry[];
}

// GET /sessions/:id/command-usage → CommandUsageService.SessionCommandUsage
export interface CommandUsageRecord {
  /** ISO timestamp captured when the CLI process started. */
  ts: string;
  sessionId: string | null;
  projectId: string | null;
  /** Resolved command path, e.g. "task report complete". */
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
  /** Per-command tallies, sorted by total usage descending. */
  byCommand: CommandUsagePerCommand[];
}

export interface SessionCommandUsage {
  sessionId: string;
  summary: CommandUsageSummary;
  records: CommandUsageRecord[];
}

// GET /git/capabilities → GitService.capabilities()
export interface GitCapabilities {
  hasGit: boolean;
  hasGh: boolean;
  ghAuthed: boolean;
}

// GET /workflow-templates → workflowTemplateRoutes WorkflowTemplate[]
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

/**
 * GET /skills → a projected skill DTO (NOT the raw loader Skill { manifest,
 * instructions }). Primary (multi-scope) branch carries skillScope/skillSource/
 * skillPath; the basic-loader fallback carries `scope` instead — both optional
 * here. `content` is present only when the request passes ?fields=full.
 */
export interface ClaudeCodeSkill {
  id: string;
  name: string;
  description: string;
  version: string;
  triggers: string[];
  role?: string;
  /** Multi-scope branch. */
  skillScope?: string;
  skillSource?: string;
  skillPath?: string;
  /** Basic-loader fallback branch. */
  scope?: string;
  outputFormat?: string;
  language?: string;
  framework?: string;
  tags: string[];
  category?: string;
  license?: string;
  hasReferences: boolean;
  referenceCount: number;
  /** Only when ?fields=full. */
  content?: string;
}

/** Re-exported entity types frequently needed alongside REST responses. */
export type { Task, Session, JsonObject };
