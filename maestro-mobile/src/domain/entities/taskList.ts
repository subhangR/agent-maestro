// Mirrors maestro-server/src/types.ts TaskList — do not edit shape without re-running the drift guard.
import type { EpochMs } from '../primitives';

export interface TaskList {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  orderedTaskIds: string[];
  createdAt: EpochMs;
  updatedAt: EpochMs;
}
