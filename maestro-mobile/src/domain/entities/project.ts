// Mirrors maestro-server/src/types.ts Project — do not edit shape without re-running the drift guard.
import type { EpochMs } from '../primitives';

export interface Project {
  id: string;
  name: string;
  workingDir: string;
  description?: string;
  /** Marks this as a master project with cross-project access. */
  isMaster?: boolean;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

// Ordering — UI-only entity (separate from task/session models).
export interface Ordering {
  projectId: string;
  entityType: string;
  orderedIds: string[];
  updatedAt: EpochMs;
}
