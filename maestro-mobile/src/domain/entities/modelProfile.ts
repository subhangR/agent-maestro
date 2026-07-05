// Mirrors maestro-server/src/types.ts ModelProfile — do not edit shape without re-running the drift guard.
import type { Iso8601 } from '../primitives';
import type { LaunchConfig } from './launchOverride';

/**
 * A named, workspace-global launch config ("class" of model) that team members
 * reference by id. Updating a profile re-points every bound member.
 */
export interface ModelProfile {
  id: string;
  name: string;
  description?: string;
  launchConfig: LaunchConfig;
  /** true for the auto-seeded tiers. */
  isDefault?: boolean;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}
