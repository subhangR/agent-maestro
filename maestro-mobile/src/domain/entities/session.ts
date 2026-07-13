// Mirrors maestro-server/src/types.ts Session + SessionEvent + SessionTimelineEvent — do not edit shape without re-running the drift guard.
import type { EpochMs, JsonObject } from '../primitives';
import type { SessionStatus, SessionTimelineEventType } from '../enums';
import type { DocEntry } from './doc';
import type { TeamMemberSnapshot } from './teamMember';

export interface SessionTimelineEvent {
  id: string;
  type: SessionTimelineEventType;
  timestamp: EpochMs;
  message?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export interface SessionEvent {
  id: string;
  timestamp: EpochMs;
  type: string;
  data?: any;
}

/** Waiting-for-input flag — drives the derived `wait` UI status. */
export interface SessionNeedsInput {
  active: boolean;
  message?: string;
  since?: EpochMs;
}

export interface Session {
  id: string;
  projectId: string;

  taskIds: string[];

  name: string;
  agentId?: string;
  /** Pre-generated Claude CLI session ID for resume support. */
  claudeSessionId?: string;
  env: Record<string, string>;
  /** Deprecated: kept for backward compatibility. */
  strategy?: string;

  status: SessionStatus;
  startedAt: EpochMs;
  lastActivity: EpochMs;
  completedAt: EpochMs | null;
  /** Set when a human marks the session complete (moves it to the Completed tab). */
  humanCompletedAt?: EpochMs | null;
  /** Set when a session is closed/archived (Archived tab; precedence over completed). */
  archivedAt?: EpochMs | null;
  hostname: string;
  platform: string;
  events: SessionEvent[];
  timeline: SessionTimelineEvent[];
  docs: DocEntry[];
  metadata?: Record<string, any>;
  needsInput?: SessionNeedsInput;
  teamMemberId?: string;
  teamMemberSnapshot?: TeamMemberSnapshot;

  teamMemberIds?: string[];
  teamMemberSnapshots?: TeamMemberSnapshot[];
  parentSessionId?: string | null;
  /** Top-most session in a spawn chain. */
  rootSessionId?: string | null;
  /** Shared ID linking coordinator + workers (= coordinator's session ID). */
  teamSessionId?: string | null;
  teamId?: string | null;
  /** Derived from project.isMaster at spawn time. */
  isMasterSession?: boolean;
}

// Note: JsonObject is exported by primitives; re-stated here only as a doc anchor
// for `env` (Record<string,string>) and `metadata` (free-form) wire shapes.
export type { JsonObject };
