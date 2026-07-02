import { User } from 'firebase/auth';
import { maestroClient } from '../utils/MaestroClient';
import type {
  CreateTaskPayload,
  CreateTeamMemberPayload,
  MaestroTask,
  TeamMember,
  TaskPriority,
} from '../app/types/maestro';
import { SpaceTask, SpaceTeamMember, SpaceSpell } from './spaceShareTypes';
import { SpaceTasksClient } from './SpaceTasksClient';
import { SpaceTeamMembersClient } from './SpaceTeamMembersClient';
import { SpaceSpellsClient } from './SpaceSpellsClient';

/**
 * Materialize a shared space task into the user's active local Maestro
 * project, then record the pull on the shared doc so the badge updates for
 * everyone.
 */
export async function pullSpaceTaskToLocal(
  user: User,
  spaceTask: SpaceTask,
  projectId: string,
): Promise<MaestroTask> {
  const priority: TaskPriority = (spaceTask.priority as TaskPriority) ?? 'medium';
  const payload: CreateTaskPayload = {
    projectId,
    title: spaceTask.title,
    description: spaceTask.description ?? '',
    priority,
  };
  const created = await maestroClient.createTask(payload);
  // Best-effort fan-out write: don't fail the pull if it errors.
  try {
    await SpaceTasksClient.recordPull(spaceTask.spaceId, spaceTask.id, user.uid, created.id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[SpaceAdapters] recordPull failed:', err);
  }
  return created;
}

const ALLOWED_AGENT_MODES = new Set([
  'worker',
  'coordinator',
  'coordinated-worker',
  'coordinated-coordinator',
]);

/**
 * Materialize a shared team member into the user's active local Maestro
 * project, then record the adoption on the shared doc.
 */
export async function adoptSpaceTeamMember(
  user: User,
  spaceTm: SpaceTeamMember,
  projectId: string,
): Promise<TeamMember> {
  const mode = spaceTm.mode && ALLOWED_AGENT_MODES.has(spaceTm.mode)
    ? (spaceTm.mode as CreateTeamMemberPayload['mode'])
    : undefined;
  const payload: CreateTeamMemberPayload = {
    projectId,
    name: spaceTm.name,
    role: spaceTm.role || 'Adopted from space',
    identity: spaceTm.identity ?? '',
    avatar: spaceTm.avatar ?? '',
    model: (spaceTm.model ?? undefined) as CreateTeamMemberPayload['model'],
    agentTool: (spaceTm.agentTool ?? undefined) as CreateTeamMemberPayload['agentTool'],
    mode,
    skillIds: spaceTm.skillIds ?? [],
    commandPermissions: spaceTm.commandPermissions ?? {},
  };
  const created = await maestroClient.createTeamMember(payload);
  try {
    await SpaceTeamMembersClient.recordAdopt(spaceTm.spaceId, spaceTm.id, user.uid);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[SpaceAdapters] recordAdopt failed:', err);
  }
  return created;
}

export type SpellInstallConflict = 'replace' | 'rename' | 'cancel';

export interface SpellInstallOptions {
  /** Override the installed prompt name (used by the Rename flow). */
  nameOverride?: string;
  /**
   * If a custom prompt with the target name already exists, callers can pass
   * a strategy to handle it. `cancel` aborts; `replace` updates the existing
   * prompt; `rename` is handled by passing a new `nameOverride`.
   */
  onConflict?: SpellInstallConflict;
}

export interface SpellInstallResult {
  status: 'installed' | 'replaced' | 'cancelled' | 'conflict';
  conflictingId?: string;
  conflictingName?: string;
}

/**
 * Install a shared spell into the user's *global* custom-prompt library.
 * If a prompt with the same name already exists, the caller decides whether
 * to Replace / Rename / Cancel. The default with no `onConflict` is to
 * surface the conflict to the caller via `{ status: 'conflict' }`.
 */
export async function installSpaceSpell(
  user: User,
  spaceSpell: SpaceSpell,
  options?: SpellInstallOptions,
): Promise<SpellInstallResult> {
  const targetName = options?.nameOverride?.trim() || spaceSpell.name;
  // NOTE: staging's spell system is rule-based (createSpell/updateSpell/listSpells),
  // replacing the old content-based custom-prompt API. The shared-spell `body`/`entityType`
  // fields have no direct home in the new model yet — spell push/pull is deferred, so we
  // map name/description/icon and install a single disabled inject-prompt rule (below).
  const existing = await maestroClient.listSpells();
  const conflict = (existing as any[]).find((p) => p?.name === targetName);

  if (conflict) {
    const strategy = options?.onConflict;
    if (!strategy) {
      return { status: 'conflict', conflictingId: conflict.id, conflictingName: conflict.name };
    }
    if (strategy === 'cancel') {
      return { status: 'cancelled' };
    }
    if (strategy === 'replace') {
      await maestroClient.updateSpell(conflict.id, {
        name: targetName,
        description: spaceSpell.description ?? '',
        icon: spaceSpell.icon ?? undefined,
      });
      try {
        await SpaceSpellsClient.recordInstall(spaceSpell.spaceId, spaceSpell.id, user.uid);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[SpaceAdapters] recordInstall failed:', err);
      }
      return { status: 'replaced' };
    }
    // strategy === 'rename' but no nameOverride supplied — fall through to install
  }

  await maestroClient.createSpell({
    name: targetName,
    description: spaceSpell.description ?? '',
    icon: spaceSpell.icon ?? undefined,
    color: 'violet',
    // Spells are multi-rule now. Shared-spell body/entityType have no home in the
    // new model yet, so install a single disabled inject-prompt rule as a stub.
    rules: [
      {
        enabled: false,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'inject-prompt', prompt: spaceSpell.description || targetName },
      },
    ],
  });
  try {
    await SpaceSpellsClient.recordInstall(spaceSpell.spaceId, spaceSpell.id, user.uid);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[SpaceAdapters] recordInstall failed:', err);
  }
  return { status: 'installed' };
}
