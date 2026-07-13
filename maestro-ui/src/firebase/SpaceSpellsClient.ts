import { DocumentData } from 'firebase/firestore';
import type {
  SpellTrigger,
  SpellActionConfig,
  SpellColorSlug,
  SpellHookEvent,
} from '../app/types/maestro';
import { ACTIONS_BY_EVENT } from '../app/types/maestro';
import { SpaceSpell, SpaceSpellRule } from './spaceShareTypes';
import { createSpaceResourceClient } from './spaceResourceClient';
import {
  asString,
  asStringOrNull,
  asStringArray,
  asNumber,
  asBoolean,
  asEnum,
} from './firestoreUtils';

const SPELL_COLORS: readonly SpellColorSlug[] = [
  'amber', 'rose', 'violet', 'sky', 'emerald', 'fuchsia', 'lime', 'cyan', 'indigo',
];

const HOOK_EVENTS: readonly SpellHookEvent[] = [
  'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop',
  'SubagentStop', 'Notification', 'SessionStart', 'SessionEnd',
];

function triggerFromData(v: unknown): SpellTrigger | null {
  if (!v || typeof v !== 'object') return null;
  const raw = v as Record<string, unknown>;
  if (raw.type === 'hook') {
    if (typeof raw.hookEvent !== 'string' || !(HOOK_EVENTS as readonly string[]).includes(raw.hookEvent)) {
      return null;
    }
    return {
      type: 'hook',
      hookEvent: raw.hookEvent as SpellHookEvent,
      ...(typeof raw.matcher === 'string' && raw.matcher ? { matcher: raw.matcher } : {}),
    };
  }
  // 'schedule' triggers are Phase-2: the server rejects them at createSpell,
  // so accepting them here would make installs fail wholesale. Dropped until
  // the local spell system supports them.
  return null;
}

function actionFromData(v: unknown): SpellActionConfig | null {
  if (!v || typeof v !== 'object') return null;
  const raw = v as Record<string, unknown>;
  switch (raw.type) {
    case 'inject-prompt':
    case 'feed-context': {
      if (typeof raw.prompt !== 'string' || !raw.prompt) return null;
      return { type: raw.type, prompt: raw.prompt };
    }
    case 'run-command': {
      if (typeof raw.command !== 'string' || !raw.command) return null;
      return {
        type: 'run-command',
        command: raw.command,
        ...(Array.isArray(raw.args) ? { args: raw.args.filter((a): a is string => typeof a === 'string') } : {}),
        ...(typeof raw.cwd === 'string' && raw.cwd ? { cwd: raw.cwd } : {}),
        ...(typeof raw.feedOutput === 'boolean' ? { feedOutput: raw.feedOutput } : {}),
      };
    }
    case 'continue-loop': {
      return {
        type: 'continue-loop',
        ...(typeof raw.loopType === 'string'
          ? { loopType: raw.loopType as Extract<SpellActionConfig, { type: 'continue-loop' }>['loopType'] }
          : {}),
        ...(typeof raw.maxIterations === 'number' ? { maxIterations: raw.maxIterations } : {}),
      };
    }
    case 'notify-channel': {
      // In-app only — the `channel` relay field was dropped from the local
      // model; a legacy shared rule's channel is intentionally not carried.
      return {
        type: 'notify-channel',
        ...(typeof raw.message === 'string' && raw.message ? { message: raw.message } : {}),
      };
    }
    default:
      return null;
  }
}

/**
 * Coerces the shared rules array, dropping any rule whose trigger or action
 * fails validation (a malformed rule from a hostile/buggy writer must never
 * reach the local spell system).
 */
export function spaceSpellRulesFromData(v: unknown): SpaceSpellRule[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const rules: SpaceSpellRule[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const trigger = triggerFromData(raw.trigger);
    const action = actionFromData(raw.action);
    if (!trigger || !action) continue;
    // Mirror the server's per-event capability matrix — a rule the server
    // would 400 on at install time must not survive the read boundary.
    if (trigger.type === 'hook' && !ACTIONS_BY_EVENT[trigger.hookEvent]?.includes(action.type)) {
      continue;
    }
    rules.push({
      ...(typeof raw.label === 'string' && raw.label ? { label: raw.label } : {}),
      enabled: asBoolean(raw.enabled),
      trigger,
      action,
    });
  }
  return rules.length > 0 ? rules : undefined;
}

function fromData(id: string, d: DocumentData): SpaceSpell {
  const installedByUids = asStringArray(d.installedByUids);
  const rules = spaceSpellRulesFromData(d.rules);
  return {
    id,
    spaceId: asString(d.spaceId),
    name: asString(d.name),
    description: asString(d.description),
    body: asString(d.body),
    icon: asStringOrNull(d.icon),
    ...(typeof d.schemaVersion === 'number' ? { schemaVersion: asNumber(d.schemaVersion) } : {}),
    ...(rules
      ? { rules, color: asEnum(d.color, SPELL_COLORS, 'violet') }
      : {}),
    ...(typeof d.entityType === 'string' ? { entityType: d.entityType } : {}),
    sourceSpellId: asStringOrNull(d.sourceSpellId),
    sourceProjectId: asStringOrNull(d.sourceProjectId),
    sourceUserId: asStringOrNull(d.sourceUserId),
    installedByUids,
    installCount: installedByUids.length,
    createdBy: asString(d.createdBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const client = createSpaceResourceClient<SpaceSpell>({
  label: 'SpaceSpells',
  segment: 'spells',
  fromData,
  fanOut: { uidsField: 'installedByUids', linkedField: 'linkedLocalIdsByUid' },
});

export const SpaceSpellsClient = {
  subscribe: client.subscribe,
  list: client.list,

  async update(
    spaceId: string,
    spellId: string,
    patch: Partial<Pick<SpaceSpell, 'name' | 'description' | 'body' | 'icon' | 'color' | 'rules'>>,
  ): Promise<void> {
    await client.update(spaceId, spellId, patch);
  },

  delete: client.delete,

  /**
   * Records that `uid` installed this spell locally (optionally mapping the
   * created local spell id for provenance).
   */
  async recordInstall(spaceId: string, spellId: string, uid: string, localSpellId?: string): Promise<void> {
    await client.recordFanOut(spaceId, spellId, uid, localSpellId);
  },
};
