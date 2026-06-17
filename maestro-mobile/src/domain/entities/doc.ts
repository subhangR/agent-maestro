// Mirrors maestro-server/src/types.ts DocEntry — do not edit shape without re-running the drift guard.
import type { EpochMs } from '../primitives';

/** Document entry for session/task docs. */
export interface DocEntry {
  id: string;
  title: string;
  filePath: string;
  /** Default "markdown" for back-compat; "diagram" stores .excalidraw content. */
  kind?: 'markdown' | 'diagram';
  /** Optional inline markdown content (deprecated: stored in separate files). */
  content?: string;
  /** Path to file storing doc content (replaces inline content). */
  contentFilePath?: string;
  taskId?: string;
  addedAt: EpochMs;
  /** Session that added this doc. */
  addedBy?: string;
}
