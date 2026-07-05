// Mirrors maestro-server/src/types.ts SessionPrompt + Huddle + HuddleSessionRef — do not edit shape without re-running the drift guard.
import type { EpochMs } from '../primitives';
import type { SessionPromptMode } from '../enums';
import type { TeamMemberSnapshot } from './teamMember';

/**
 * A durable, cross-project record of one session prompting another via
 * POST /api/sessions/:id/prompt. `content` is the FULL, clean message
 * WITHOUT the [From: name (id)] terminal prefix.
 */
export interface SessionPrompt {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  content: string;
  mode: SessionPromptMode;
  fromTeamMember: TeamMemberSnapshot | null;
  toTeamMember: TeamMemberSnapshot | null;
  fromSessionName: string | null;
  toSessionName: string | null;
  timestamp: EpochMs;
}

/** A session participating in a Huddle, with resolved (best-effort) metadata. */
export interface HuddleSessionRef {
  sessionId: string;
  sessionName: string | null;
  projectId: string | null;
  teamMember: TeamMemberSnapshot | null;
}

/**
 * A connected component over the graph where each SessionPrompt is an
 * undirected edge. All-time and cross-project. Every huddle has >=2 sessions.
 */
export interface Huddle {
  id: string;
  sessionIds: string[];
  sessions: HuddleSessionRef[];
  prompts: SessionPrompt[];
  promptCount: number;
  lastActivity: EpochMs;
}
