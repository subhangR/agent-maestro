// Mirrors maestro-server/src/types.ts enums + mode helpers — do not edit shape
// without re-running the drift guard (tsconfig.drift.json).
//
// Every closed set the server defines as a string-literal union is mirrored
// here verbatim. `as const` arrays are provided for the unions the UI iterates
// (dropdowns, tab orders). normalizeMode/isWorkerMode/isCoordinatorMode are
// copied byte-for-byte from the server so spawn/display logic stays identical.

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

/**
 * Server `Task.status` — the authoritative 7-value union delivered over REST/WS.
 * NOTE: the CLI manifest's TaskStatus is a 6-value subset (no `archived`);
 * anchor on THIS one — it is what the wire carries.
 */
export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'cancelled'
  | 'blocked'
  | 'archived';

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'completed',
  'cancelled',
  'blocked',
  'archived',
] as const satisfies readonly TaskStatus[];

/** Per-session status stored in `Task.taskSessionStatuses[sessionId]`. */
export type TaskSessionStatus = 'working' | 'blocked' | 'completed' | 'failed' | 'skipped';

export const TASK_SESSION_STATUSES = [
  'working',
  'blocked',
  'completed',
  'failed',
  'skipped',
] as const satisfies readonly TaskSessionStatus[];

/**
 * Server `Task.priority` — 3-value. NOTE: the CLI's TaskData adds `'critical'`,
 * but the server entity is 3-value. Mobile renders 3 (no "critical" chip).
 */
export type TaskPriority = 'low' | 'medium' | 'high';

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const satisfies readonly TaskPriority[];

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Server `Session.status` — 6 values. The Atelier design's `run`/`wait` are
 * NOT here; they are derived display states (see derive/sessionStatus.ts).
 */
export type SessionStatus = 'spawning' | 'idle' | 'working' | 'completed' | 'failed' | 'stopped';

export const SESSION_STATUSES = [
  'spawning',
  'idle',
  'working',
  'completed',
  'failed',
  'stopped',
] as const satisfies readonly SessionStatus[];

export type SessionTimelineEventType =
  | 'session_started'
  | 'session_stopped'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_skipped'
  | 'task_blocked'
  | 'needs_input'
  | 'progress'
  | 'error'
  | 'milestone'
  | 'doc_added'
  | 'prompt_received';

// ---------------------------------------------------------------------------
// Agent mode (four-mode model + legacy aliases)
// ---------------------------------------------------------------------------

export type AgentMode = 'worker' | 'coordinator' | 'coordinated-worker' | 'coordinated-coordinator';
/** Legacy mode aliases for backward compatibility. */
export type LegacyAgentMode = 'execute' | 'coordinate';
/** All accepted mode values (includes legacy aliases). */
export type AgentModeInput = AgentMode | LegacyAgentMode;

export const AGENT_MODES = [
  'worker',
  'coordinator',
  'coordinated-worker',
  'coordinated-coordinator',
] as const satisfies readonly AgentMode[];

/** Helper: is this a worker-type mode? (verbatim from server types.ts) */
export function isWorkerMode(mode: string): boolean {
  return mode === 'worker' || mode === 'coordinated-worker' || mode === 'execute';
}

/** Helper: is this a coordinator-type mode? (verbatim from server types.ts) */
export function isCoordinatorMode(mode: string): boolean {
  return mode === 'coordinator' || mode === 'coordinated-coordinator' || mode === 'coordinate';
}

/** Helper: is this a coordinated (has-parent) mode? (mobile addition) */
export function isCoordinatedMode(mode: string): boolean {
  return mode === 'coordinated-worker' || mode === 'coordinated-coordinator';
}

/**
 * Normalize a mode value to the four-mode model. (verbatim from server types.ts)
 * The "coordinated-" prefix is derived from `hasCoordinator`, not the input.
 */
export function normalizeMode(mode: string, hasCoordinator?: boolean): AgentMode {
  if (mode === 'execute' || mode === 'worker' || mode === 'coordinated-worker')
    return hasCoordinator ? 'coordinated-worker' : 'worker';
  if (mode === 'coordinate' || mode === 'coordinator' || mode === 'coordinated-coordinator')
    return hasCoordinator ? 'coordinated-coordinator' : 'coordinator';
  return mode as AgentMode;
}

// ---------------------------------------------------------------------------
// Launch / tools
// ---------------------------------------------------------------------------

/** Server `AgentTool` — 4-value. Design uses claude|codex|gemini|terminal; reconcile in derive/agentTool.ts. */
export type AgentTool = 'claude-code' | 'codex' | 'hermes' | 'gemini';

export const AGENT_TOOLS = ['claude-code', 'codex', 'hermes', 'gemini'] as const satisfies readonly AgentTool[];

export type LaunchProvider = 'claude' | 'openai' | 'hermes' | 'gemini';

export const LAUNCH_PROVIDERS = ['claude', 'openai', 'hermes', 'gemini'] as const satisfies readonly LaunchProvider[];

export type LaunchReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const LAUNCH_REASONING_EFFORTS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly LaunchReasoningEffort[];

export type LaunchSpeed = 'standard' | 'fast';

export type LaunchAccessMode = 'safe' | 'acceptEdits' | 'plan' | 'fullAccess';

/** Permission mode applied to a member/session run. */
export type PermissionMode = 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';

export const PERMISSION_MODES = [
  'acceptEdits',
  'interactive',
  'readOnly',
  'bypassPermissions',
] as const satisfies readonly PermissionMode[];

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export type WorkerStrategy = 'simple' | 'tree';
export type OrchestratorStrategy = 'default' | 'intelligent-batching' | 'dag';

// ---------------------------------------------------------------------------
// Task graph
// ---------------------------------------------------------------------------

export type TaskGraphStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'paused';

// ---------------------------------------------------------------------------
// Team member / team
// ---------------------------------------------------------------------------

export type TeamMemberStatus = 'active' | 'archived';
export type TeamMemberScope = 'project' | 'global';
/** Discriminator for auto-seeded, non-deletable system team members. */
export type SystemTeamMemberKind = 'alexa-coordinator';
export type TeamStatus = 'active' | 'archived';

// ---------------------------------------------------------------------------
// Spell
// ---------------------------------------------------------------------------

export type SpellEntityType = 'maestro' | 'skill' | 'team-member' | 'task' | 'doc' | 'session' | 'custom-prompt';

export const SPELL_ENTITY_TYPES = [
  'maestro',
  'skill',
  'team-member',
  'task',
  'doc',
  'session',
  'custom-prompt',
] as const satisfies readonly SpellEntityType[];

/** Direction of a recorded session→session prompt. */
export type SessionPromptMode = 'send' | 'paste';
