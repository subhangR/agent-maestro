import { User } from 'firebase/auth';
import { maestroClient } from '../utils/MaestroClient';
import type {
  CreateTaskPayload,
  CreateTeamMemberPayload,
  MaestroTask,
  TeamMember,
  TaskPriority,
  Spell,
  SpellRuleInput,
  SpellColorSlug,
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
    await SpaceTeamMembersClient.recordAdopt(spaceTm.spaceId, spaceTm.id, user.uid, created.id);
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
 * Reconstructs create/update rule payloads from a shared spell.
 *
 * v2 shared spells carry the full rules array (label/enabled/trigger/action —
 * already validated at the read boundary by SpaceSpellsClient), so the install
 * is a faithful round-trip; rule ids are regenerated locally by the server.
 *
 * Legacy v1 docs (no `rules`) predate the multi-rule model and can only
 * offer their human-readable `body`/`description` — those install a single
 * DISABLED inject-prompt rule so nothing fires until the user reviews it.
 */
function rulesFromSharedSpell(spaceSpell: SpaceSpell, targetName: string): SpellRuleInput[] {
  if (spaceSpell.rules && spaceSpell.rules.length > 0) {
    return spaceSpell.rules.map((r) => ({
      ...(r.label ? { label: r.label } : {}),
      enabled: r.enabled,
      trigger: r.trigger,
      action: r.action,
    }));
  }
  return [
    {
      label: 'Imported from space (legacy shared spell — review before enabling)',
      enabled: false,
      trigger: { type: 'hook', hookEvent: 'Stop' },
      action: {
        type: 'inject-prompt',
        prompt: spaceSpell.body || spaceSpell.description || targetName,
      },
    },
  ];
}

/**
 * Install a shared spell into the user's *global* spell library.
 * If a spell with the same name already exists, the caller decides whether
 * to Replace / Rename / Cancel. The default with no `onConflict` is to
 * surface the conflict to the caller via `{ status: 'conflict' }`.
 */
export async function installSpaceSpell(
  user: User,
  spaceSpell: SpaceSpell,
  options?: SpellInstallOptions,
): Promise<SpellInstallResult> {
  const targetName = options?.nameOverride?.trim() || spaceSpell.name;
  const rules = rulesFromSharedSpell(spaceSpell, targetName);
  const color: SpellColorSlug = spaceSpell.color ?? 'violet';

  const existing: Spell[] = await maestroClient.listSpells();
  const conflict = existing.find((p) => p?.name === targetName);

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
        color,
        rules,
      });
      await recordInstallBestEffort(user, spaceSpell, conflict.id);
      return { status: 'replaced' };
    }
    // strategy === 'rename' but no nameOverride supplied — fall through to install
  }

  const created = await maestroClient.createSpell({
    name: targetName,
    description: spaceSpell.description ?? '',
    icon: spaceSpell.icon ?? undefined,
    color,
    rules,
  });
  await recordInstallBestEffort(user, spaceSpell, created?.id);
  return { status: 'installed' };
}

/** Best-effort fan-out write: don't fail the install if it errors. */
async function recordInstallBestEffort(
  user: User,
  spaceSpell: SpaceSpell,
  localSpellId?: string,
): Promise<void> {
  try {
    await SpaceSpellsClient.recordInstall(spaceSpell.spaceId, spaceSpell.id, user.uid, localSpellId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[SpaceAdapters] recordInstall failed:', err);
  }
}
