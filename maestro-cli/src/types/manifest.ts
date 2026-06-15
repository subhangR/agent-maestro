/**
 * Complete manifest specification for Maestro sessions
 * Based on docs/final-maestro-cli-docs/01-MANIFEST-SCHEMA.md
 *
 * This file defines the TypeScript types for the Maestro manifest format.
 * The manifest is used to configure agent sessions with task context and settings.
 */


/** Agent mode — four-mode model covering all session scenarios */
export type AgentMode = 'worker' | 'coordinator' | 'coordinated-worker' | 'coordinated-coordinator';

/** Team context lens used by the prompt identity v2 contract */
export type TeamContextLens = 'full_expertise' | 'slim_roster';

/** Legacy mode aliases for backward compatibility */
export type LegacyAgentMode = 'execute' | 'coordinate';

/** All accepted mode values (includes legacy aliases) */
export type AgentModeInput = AgentMode | LegacyAgentMode;

/** Helper: is this a worker-type mode? */
export function isWorkerMode(mode: AgentModeInput): boolean {
  return mode === 'worker' || mode === 'coordinated-worker' || mode === 'execute';
}

/** Helper: is this a coordinator-type mode? */
export function isCoordinatorMode(mode: AgentModeInput): boolean {
  return mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate';
}

/** Helper: is this a coordinated (has parent coordinator) mode? */
export function isCoordinatedMode(mode: AgentModeInput): boolean {
  return mode === 'coordinated-worker' || mode === 'coordinated-coordinator';
}

/** Normalize legacy mode values to the four-mode model */
export function normalizeMode(mode: AgentModeInput, hasCoordinator?: boolean): AgentMode {
  if (mode === 'execute') {
    return hasCoordinator ? 'coordinated-worker' : 'worker';
  }
  if (mode === 'coordinate') {
    return hasCoordinator ? 'coordinated-coordinator' : 'coordinator';
  }
  return mode as AgentMode;
}

/** Helper: does this mode require exactly one self identity profile? */
export function requiresSingleSelfIdentity(mode: AgentModeInput): boolean {
  return mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate';
}

/** Resolve team context lens for a mode */
export function resolveTeamContextLensForMode(mode: AgentModeInput): TeamContextLens {
  return isWorkerMode(mode) ? 'full_expertise' : 'slim_roster';
}

/** Supported agent tools */
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

/**
 * Main manifest interface - contains all configuration for a Maestro session
 */
export interface MaestroManifest {
  /** Manifest format version (currently "1.0") */
  manifestVersion: string;

  /** Agent mode: worker/coordinator in canonical four-mode model */
  mode: AgentMode;

  /** Tasks information and context (array to support multi-task sessions) */
  tasks: TaskData[];

  /** Session configuration (model, permissions, etc.) */
  session: SessionConfig;

  /** Optional additional context for the agent */
  context?: AdditionalContext;

  /** Optional standard skills to load from ~/.skills/ */
  skills?: string[];

  /** Agent tool to use for this session (defaults to 'claude-code') */
  agentTool?: AgentTool;

  /** Canonical provider/model/capability config for launch-time agent selection */
  launchConfig?: LaunchConfig;

  /** Reference task IDs for context (docs from these tasks are provided to the agent) */
  referenceTaskIds?: string[];

  /** Team members available for coordination (only in coordinate mode) */
  availableTeamMembers?: TeamMemberData[];

  /**
   * Recursive team structure (only in coordinator mode, when the session is bound
   * to a saved team). Drives recursive delegation: the leader routes work to members
   * by expertise and spawns sub-team leaders as sub-coordinators.
   */
  teamStructure?: TeamStructureNode;

  /** Team member ID for this session (single team member running this session) */
  teamMemberId?: string;

  /** Team member name */
  teamMemberName?: string;

  /** Team member role */
  teamMemberRole?: string;

  /** Team member avatar */
  teamMemberAvatar?: string;

  /** Team member identity/instructions */
  teamMemberIdentity?: string;

  /** Team member persistent memory entries */
  teamMemberMemory?: string[];

  /** Team member capability overrides (Phase 2) */
  teamMemberCapabilities?: Record<string, boolean>;

  /** Team member command permission overrides (Phase 2) */
  teamMemberCommandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };

  /** @deprecated Compatibility only: ignored by prompt composition */
  teamMemberWorkflowTemplateId?: string;

  /** @deprecated Compatibility only: ignored by prompt composition */
  teamMemberCustomWorkflow?: string;

  /** Coordinator session ID (the session that spawned this worker) */
  coordinatorSessionId?: string;

  /** Initial directive from the coordinator (embedded in manifest for guaranteed delivery) */
  initialDirective?: {
    subject: string;
    message: string;
    fromSessionId: string;
  };

  /** Multiple team member profiles for multi-identity sessions */
  teamMemberProfiles?: TeamMemberProfile[];

  /** Whether this is a master session with cross-project access */
  isMaster?: boolean;

  /** All projects in the workspace (populated for master sessions) */
  masterProjects?: MasterProjectInfo[];
}

/** Project info included in master session manifests */
export interface MasterProjectInfo {
  id: string;
  name: string;
  workingDir: string;
  description?: string;
  isMaster?: boolean;
}

/**
 * Team member profile for multi-identity sessions
 * Contains full member data for prompt rendering
 */
export interface TeamMemberProfile {
  id: string;
  name: string;
  role?: string;
  avatar: string;
  identity: string;
  capabilities?: Record<string, boolean>;
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
  /** @deprecated Compatibility only: ignored by prompt composition */
  workflowTemplateId?: string;
  /** @deprecated Compatibility only: ignored by prompt composition */
  customWorkflow?: string;
  model?: string;
  agentTool?: AgentTool;
  memory?: string[];
}

/**
 * Team member data for manifest (used in coordinate mode prompts)
 */
export interface TeamMemberData {
  /** Team member task ID */
  id: string;
  /** Display name */
  name: string;
  /** Role description (e.g. "frontend developer", "tester") */
  role: string;
  /** Persona/instruction prompt */
  identity: string;
  /** Emoji or icon identifier */
  avatar: string;
  /** Agent mode (canonical four-mode model) */
  mode?: AgentMode;
  /** Permission mode for spawning */
  permissionMode?: string;
  /** Skill IDs assigned to this member */
  skillIds?: string[];
  /** Preferred model */
  model?: string;
  /** Agent tool to use */
  agentTool?: AgentTool;
  /** Capability overrides from team member */
  capabilities?: Record<string, boolean>;
  /** Command permission overrides from team member */
  commandPermissions?: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
  /** Persistent memory entries */
  memory?: string[];
}

/** A member inside a recursive team structure node. */
export interface TeamStructureMember {
  id: string;
  name: string;
  role: string;
  identity?: string;
  avatar?: string;
  mode?: AgentMode;
  isLeader: boolean;
}

/** A node in the recursive team structure (mirrors the server's TeamTreeNode). */
export interface TeamStructureNode {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  leaderId: string;
  status?: string;
  members: TeamStructureMember[];
  subTeams: TeamStructureNode[];
}

/**
 * Unified task status (single source of truth)
 */
export type TaskStatus =
  | 'todo'          // Not yet started
  | 'in_progress'   // Actively being worked on
  | 'in_review'     // Awaiting review
  | 'completed'     // Work finished
  | 'cancelled'     // Cancelled
  | 'blocked';      // Blocked by dependency or issue

/**
 * Who triggered the status change
 */
export type UpdateSource = 'user' | 'session';

/**
 * Status update payload
 */
export interface StatusUpdate {
  status: TaskStatus;
  updateSource: UpdateSource;
  sessionId?: string;
  reason?: string;
}

/**
 * Task data (unified status model)
 */
export interface TaskData {
  // Core fields
  /** Unique task identifier */
  id: string;

  /** Human-readable task title */
  title: string;

  /** Detailed task description */
  description: string;

  /** Parent task ID (null for root tasks) */
  parentId?: string | null;

  /** List of acceptance criteria - clear success conditions */
  acceptanceCriteria: string[];

  /** List of task IDs this task depends on */
  dependencies?: string[];

  /** Task priority level */
  priority?: 'low' | 'medium' | 'high' | 'critical';

  /** Project this task belongs to */
  projectId: string;

  /** ISO 8601 timestamp when task was created */
  createdAt: string;

  /** Custom metadata (agent assignments, tags, etc.) */
  metadata?: Record<string, any>;

  /** Unified status (single source of truth). Optional in manifests. */
  status?: TaskStatus;

  // SESSION TRACKING
  /** Associated session IDs */
  sessionIds?: string[];

  /** Current active session ID */
  activeSessionId?: string;

  /** Attached media files for this task (absolute paths on disk) */
  images?: Array<{
    path: string;
    filename: string;
    mimeType: string;
  }>;
}

/**
 * Session configuration for Claude Code
 */
export interface SessionConfig {
  /** Model to use (e.g. sonnet, claude-fable-5, claude-opus-4-8, claude-opus-4-7[1m], gpt-5.5, hermes-default, gemini-3-pro-preview) */
  model: string;

  /** Permission mode for the session */
  permissionMode: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';

  /** Thinking mode configuration */
  thinkingMode?: 'auto' | 'interleaved' | 'disabled';

  /** Maximum number of agent turns before stopping */
  maxTurns?: number;

  /** Session timeout in milliseconds */
  timeout?: number;

  /** Working directory for the session (defaults to project root) */
  workingDirectory?: string;

  /** Canonical provider/model/capability config for the spawned CLI */
  launchConfig?: LaunchConfig;

  /**
   * Explicit list of allowed commands for this session.
   * If not specified, defaults are determined by mode.
   * Format: 'command' or 'parent:subcommand' (e.g., 'task:list', 'queue:start')
   */
  allowedCommands?: string[];
}

/**
 * Additional context provided to the agent
 */
export interface AdditionalContext {
  /** Codebase-specific context */
  codebaseContext?: CodebaseContext;

  /** Related tasks and their relationships */
  relatedTasks?: RelatedTask[];

  /** Project standards and guidelines */
  projectStandards?: ProjectStandards;

  /** Custom context fields */
  custom?: Record<string, any>;
}

/**
 * Context about the codebase
 */
export interface CodebaseContext {
  /** Recent changes relevant to this task */
  recentChanges?: string[];

  /** Files relevant to this task */
  relevantFiles?: string[];

  /** Architecture pattern (e.g., "microservices", "monolithic") */
  architecture?: string;

  /** Technology stack */
  techStack?: string[];

  /** Key dependencies */
  dependencies?: Record<string, string>;
}

/**
 * Information about a related task
 */
export interface RelatedTask {
  /** Task ID */
  id: string;

  /** Task title */
  title: string;

  /** Relationship type */
  relationship: 'blocks' | 'blocked_by' | 'depends_on' | 'related_to';

  /** Current task status */
  status: string;

  /** Optional task description */
  description?: string;
}

/**
 * Project coding standards and guidelines
 */
export interface ProjectStandards {
  /** Coding style guide (e.g., "airbnb", "google") */
  codingStyle?: string;

  /** Testing approach (e.g., "TDD", "BDD") */
  testingApproach?: string;

  /** Documentation format (e.g., "JSDoc", "TypeDoc") */
  documentation?: string;

  /** Git branching strategy (e.g., "Git Flow", "Trunk Based") */
  branchingStrategy?: string;

  /** CI/CD pipeline description */
  cicdPipeline?: string;

  /** Custom project-specific guidelines */
  customGuidelines?: string[];
}

/**
 * Type guard to check if a manifest is for a worker-mode agent
 */
export function isExecuteManifest(manifest: MaestroManifest): boolean {
  return isWorkerMode(manifest.mode);
}

/**
 * Type guard to check if a manifest is for a coordinator-mode agent
 */
export function isCoordinateManifest(manifest: MaestroManifest): boolean {
  return isCoordinatorMode(manifest.mode);
}

/** Minimal team member identity captured at the time a prompt was sent. */
export interface TeamMemberSnapshot {
  name: string;
  avatar: string;
  role: string;
  model?: string;
  agentTool?: AgentTool;
  permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
}

/**
 * A durable, cross-project record of one session prompting another. `content` is
 * the FULL, clean message WITHOUT the [From: name (id)] terminal prefix.
 * Mirror of the server `SessionPrompt` contract.
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
