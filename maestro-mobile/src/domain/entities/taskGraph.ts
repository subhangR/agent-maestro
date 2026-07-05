// Mirrors maestro-server/src/types.ts TaskGraph + nodes/edges — do not edit shape without re-running the drift guard.
import type { EpochMs } from '../primitives';
import type { TaskGraphStatus } from '../enums';
import type { MemberLaunchOverride } from './launchOverride';

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
  lastRunAt?: EpochMs;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}
