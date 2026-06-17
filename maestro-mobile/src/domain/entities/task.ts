// Mirrors maestro-server/src/types.ts Task + TaskImage — do not edit shape without re-running the drift guard.
import type { EpochMs, IsoDate } from '../primitives';
import type { TaskStatus, TaskPriority, TaskSessionStatus } from '../enums';
import type { MemberLaunchOverride } from './launchOverride';

/** Image attached to a task. */
export interface TaskImage {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  addedAt: EpochMs;
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  /** Per-session status map: { [sessionId]: status }. */
  taskSessionStatuses?: Record<string, TaskSessionStatus>;
  priority: TaskPriority;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  startedAt: EpochMs | null;
  completedAt: EpochMs | null;
  initialPrompt: string;

  // Many-to-many relationships
  sessionIds: string[];
  skillIds: string[];
  agentIds: string[];

  dependencies: string[];

  referenceTaskIds?: string[];
  pinned?: boolean;
  teamMemberId?: string;
  teamMemberIds?: string[];
  teamId?: string | null;
  memberOverrides?: Record<string, MemberLaunchOverride>;
  dangerousMode?: boolean;
  useWorktree?: boolean;
  /** ISO date "YYYY-MM-DD" or null. */
  dueDate: IsoDate | null;
  images?: TaskImage[];
  clientRequestId?: string;
}
