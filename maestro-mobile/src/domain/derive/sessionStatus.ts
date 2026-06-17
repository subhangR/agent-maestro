// Server → Atelier display reconciliation for sessions. THE canonical status
// vocabulary for the whole app. Bedrock's theme/svg/statusColors.ts, Palette
// tiles, and Ledger selectors all consume `UiSessionStatus` + `toUiSessionStatus`
// from here — never raw `Session.status`, or the "needs input" state is lost.
import type { SessionStatus } from '../enums';

/**
 * The 8-state UI display union (design m-data.jsx SESS_STATUS_LABEL keys) over
 * the 6 server statuses. `run` and `wait` are DERIVED, not server statuses:
 *   - `wait` ⇐ needsInput.active === true (regardless of base status)
 *   - `run`  ⇐ status === 'working'  (the design's word for "actively running")
 * `working` stays in the union for label completeness but is never produced by
 * toUiSessionStatus (it always maps 'working' → 'run').
 */
export type UiSessionStatus =
  | 'spawning'
  | 'idle'
  | 'working'
  | 'run'
  | 'wait'
  | 'completed'
  | 'failed'
  | 'stopped';

/** Display labels (design SESS_STATUS_LABEL): completed→Done, wait→Needs input, run→Running. */
export const UI_SESSION_STATUS_LABEL: Record<UiSessionStatus, string> = {
  spawning: 'Spawning',
  idle: 'Idle',
  working: 'Working',
  run: 'Running',
  wait: 'Needs input',
  completed: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

/** The minimal session shape the derivations read. */
export interface SessionStatusInput {
  status: SessionStatus;
  needsInput?: { active: boolean } | null;
  humanCompletedAt?: number | null;
  archivedAt?: number | null;
}

/**
 * Map a session to its display status. needsInput wins over everything; then
 * 'working' renders as 'run'; otherwise the base status passes through.
 */
export function toUiSessionStatus(session: SessionStatusInput): UiSessionStatus {
  if (session.needsInput?.active) return 'wait';
  if (session.status === 'working') return 'run';
  return session.status;
}

// ---------------------------------------------------------------------------
// Tab derivation (Sessions screen: Active / Completed / Archived).
// Precedence: archivedAt wins → else humanCompletedAt → else Active.
// Lives here (not in a store) so Ledger selectors + Forge can't drift apart.
// ---------------------------------------------------------------------------

export type SessionTab = 'active' | 'completed' | 'archived';

export interface SessionTabInput {
  humanCompletedAt?: number | null;
  archivedAt?: number | null;
}

export function isArchivedTab(session: SessionTabInput): boolean {
  return session.archivedAt != null;
}

export function isCompletedTab(session: SessionTabInput): boolean {
  return session.archivedAt == null && session.humanCompletedAt != null;
}

export function isActiveTab(session: SessionTabInput): boolean {
  return session.archivedAt == null && session.humanCompletedAt == null;
}

/** Single source for which tab a session belongs to. */
export function sessionTab(session: SessionTabInput): SessionTab {
  if (session.archivedAt != null) return 'archived';
  if (session.humanCompletedAt != null) return 'completed';
  return 'active';
}
