// -----------------------------------------------------------------------------
// Canonical user-facing labels — SINGLE SOURCE OF TRUTH.
//
// Every user-visible status / priority / role string lives here so the same
// concept never wears two names across the app. Do NOT redefine these maps
// locally in components; import from here. See docs/ui-cleanup-plan.md for the
// locked vocabulary and the reasoning.
// -----------------------------------------------------------------------------

import type {
  TaskStatus,
  TaskPriority,
  AgentMode,
  MaestroSessionStatus,
} from '../types/maestro';

// -- Task status -------------------------------------------------------------
// Used by the task list, the board columns, and shared spaces — one vocabulary.
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Done',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
  archived: 'Archived',
};

// -- Task priority -----------------------------------------------------------
// One casing everywhere (no more LOW / med / Medium drift).
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// -- Activity status ---------------------------------------------------------
// "Activity" is the user-facing name for a running/past agent run (formerly
// "session"/"terminal"). Words are spelled out — never "SPAWN"/"STOP".
export const ACTIVITY_STATUS_LABELS: Record<MaestroSessionStatus, string> = {
  spawning: 'Starting',
  idle: 'Idle',
  working: 'Working',
  completed: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

// Back-compat alias for files still using the old identifier during migration.
export const SESSION_STATUS_LABELS = ACTIVITY_STATUS_LABELS;

// -- Agent role --------------------------------------------------------------
// Only TWO user-facing concepts. The four internal modes collapse onto them.
export const AGENT_ROLE_LABELS: Record<AgentMode, string> = {
  worker: 'Does the work',
  coordinator: 'Manages a team',
  'coordinated-worker': 'Does the work',
  'coordinated-coordinator': 'Manages a team',
};

// Back-compat alias.
export const MODE_LABELS = AGENT_ROLE_LABELS;

// -- Safety / permission -----------------------------------------------------
// The single legible pair for "does the agent ask before running commands".
export const SAFETY_LABELS = {
  ask: 'Ask before running commands',
  autoApprove: 'Auto-approve everything (risky)',
} as const;

// Short chip labels for the per-task permission toggle. Retire "YOLO"/"Safe"
// emoji pairs — these agree with the task-footer "Options" vocabulary.
export const PERMISSION_CHIP_LABELS = {
  safe: 'Safe',
  unrestricted: 'Unrestricted',
} as const;

// Short chip labels for the isolation toggle. Retire "worktree"/"Git worktree".
export const ISOLATION_CHIP_LABELS = {
  inPlace: 'In place',
  isolated: 'Isolated copy',
} as const;

// -- Canonical nouns ---------------------------------------------------------
// Reference for copy authors. Retire: Session/Terminal, Collab/Collab Space,
// Publish/Push, Team Member.
export const NOUNS = {
  agent: 'Agent',
  activity: 'Activity',
  space: 'Space',
  share: 'Share',
} as const;
