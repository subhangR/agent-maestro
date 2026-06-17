// Mirrors maestro-server/src/types.ts Team + TeamSnapshot + TeamTreeNode + TeamTreeMember — do not edit shape without re-running the drift guard.
//
// NOTE for Pulse/Ledger: team:* events are declared in the server TypedEventMap
// but NOT subscribed by the WebSocketBridge (verified L147-203). Teams are
// REST-poll-only — do not assume live team updates over the socket.
import type { Iso8601 } from '../primitives';
import type { AgentMode, TeamStatus } from '../enums';

export interface Team {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  avatar?: string;
  /** Team member ID — the coordinator/leader. */
  leaderId: string;
  memberIds: string[];
  /** Other Team IDs for team-of-teams hierarchy. */
  subTeamIds: string[];
  /** Reverse lookup — which team contains this one. */
  parentTeamId?: string | null;
  status: TeamStatus;
  metadata?: Record<string, any>;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}

export interface TeamSnapshot {
  id: string;
  name: string;
  avatar?: string;
  leaderId: string;
  memberCount: number;
}

/** Hydrated member shape used inside a resolved team tree. */
export interface TeamTreeMember {
  id: string;
  name: string;
  role: string;
  identity?: string;
  avatar?: string;
  mode?: AgentMode;
  isLeader: boolean;
}

/** Recursive, fully-resolved team tree (GET /teams/:id/tree). */
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
