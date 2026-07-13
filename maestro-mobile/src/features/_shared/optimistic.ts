// optimistic — a THIN Phase-3 scaffold over Ledger's single optimistic writer
// (`@/state`'s optimisticPatch/rollback/clearOptimistic). Forge's inline edits
// (status flips, pin/complete, assignee) will call `optimisticEdit` so the store
// updates instantly, the server PATCH runs, and the result reconciles (clear on
// success → server is truth; rollback on failure → restore prior values).
//
// Phase 2 only EXPORTS this — no screen calls it yet (all mutations land in
// Phase 3). Kept here, single-owned by Stream B, so every stream shares ONE
// optimistic path instead of re-deriving the clear/rollback dance per call site.
import {
  optimisticPatch,
  rollback,
  clearOptimistic,
  type EntityMapKey,
  type OptimisticToken,
} from '@/state';
import type {
  Project,
  Task,
  TaskList,
  Session,
  TeamMember,
  Team,
  ModelProfile,
  TaskGraph,
  CustomPrompt,
} from '@/domain';

// Mirrors @/state's internal EntityValueMap (not exported there) so the patch
// argument stays type-checked per map key. Keep in lockstep with EntityMapKey.
interface OptimisticValueMap {
  projects: Project;
  tasks: Task;
  taskLists: TaskList;
  sessions: Session;
  teamMembers: TeamMember;
  teams: Team;
  modelProfiles: ModelProfile;
  taskGraphs: TaskGraph;
  customPrompts: CustomPrompt;
}

export interface OptimisticEditResult {
  /** True when the server write succeeded (override cleared); false → rolled back. */
  ok: boolean;
  /** The error thrown by `commit`, if any. */
  error?: unknown;
}

/**
 * Apply an optimistic field patch, run the server write, then reconcile.
 *
 *   await optimisticEdit('sessions', id, { humanCompletedAt: now }, () =>
 *     client.completeSession(id),
 *   );
 *
 * If the entity isn't in the store the patch is a no-op but `commit` still runs
 * (so a write against an un-cached entity isn't silently dropped).
 */
export async function optimisticEdit<K extends EntityMapKey>(
  mapKey: K,
  id: string,
  patch: Partial<OptimisticValueMap[K]>,
  commit: () => Promise<unknown>,
): Promise<OptimisticEditResult> {
  const token: OptimisticToken | null = optimisticPatch(mapKey, id, patch);
  try {
    await commit();
    if (token) clearOptimistic(mapKey, id, ...token.fields);
    return { ok: true };
  } catch (error) {
    if (token) rollback(token);
    return { ok: false, error };
  }
}

export type { EntityMapKey, OptimisticToken } from '@/state';
