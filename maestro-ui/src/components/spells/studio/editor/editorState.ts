/**
 * Editor state model + pure transforms for the Spell Editor (S3).
 *
 * The editor keeps a flattened `EditorRule` (a superset of every action's
 * fields) so switching action type never loses previously-typed values.
 * All persistence shapes (SpellRuleInput / CreateSpellPayload) are derived
 * from this via the build* helpers below. No React / no store here — this
 * module is pure and unit-testable.
 */
import {
  ACTIONS_BY_EVENT,
  type Spell,
  type SpellRuleInput,
  type SpellHookEvent,
  type SpellActionType,
  type SpellActionConfig,
  type SpellLoopType,
  type SpellColorSlug,
  type SpellRule,
} from '../../../../app/types/maestro';
import { isToolEvent } from '../../../../utils/spellSummary';

/** All 8 hook events, in the order the picker lists them. */
export const ALL_HOOK_EVENTS: SpellHookEvent[] = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'Notification', 'Stop', 'SubagentStop', 'SessionEnd',
];

export const LOOP_TYPES: SpellLoopType[] = [
  'single-shot', 'continue-until-done', 'plan-execute', 'critic-refine',
];

/** Full plain-English "fires when…" copy for the hook-event picker (doc 02). */
export const HOOK_EVENT_FIRES_WHEN: Record<SpellHookEvent, string> = {
  SessionStart: 'a session begins',
  UserPromptSubmit: 'you submit a prompt',
  PreToolUse: 'just before the agent runs a tool',
  PostToolUse: 'just after the agent runs a tool',
  Notification: 'the agent emits a notification (e.g. needs input)',
  Stop: 'the agent finishes its turn / would stop',
  SubagentStop: 'a spawned subagent finishes',
  SessionEnd: 'the session is ending (terminal)',
};

/** Short "good for" hint per event (doc 02). */
export const HOOK_EVENT_GOOD_FOR: Record<SpellHookEvent, string> = {
  SessionStart: 'priming context, setup commands',
  UserPromptSubmit: 'injecting standing instructions',
  PreToolUse: 'pre-checks, warnings',
  PostToolUse: 'lint/test after Edit/Write, feedback',
  Notification: 'nudges, progress pings',
  Stop: 'loops, notify-on-done, wrap-up commands',
  SubagentStop: 'loops/notify at subagent boundaries',
  SessionEnd: 'cleanup commands, final notify only',
};

/** What the matcher targets, per event — drives the matcher control help text. */
export const MATCHER_TARGET: Record<SpellHookEvent, string> = {
  SessionStart: 'the raw payload',
  UserPromptSubmit: 'the submitted prompt text',
  PreToolUse: 'the tool name',
  PostToolUse: 'the tool name',
  Notification: 'the message text',
  Stop: 'the raw payload',
  SubagentStop: 'the raw payload',
  SessionEnd: 'the raw payload',
};

export interface ActionMeta {
  label: string;
  /** one-line description shown under the action picker */
  blurb: string;
}
export const ACTION_META: Record<SpellActionType, ActionMeta> = {
  'inject-prompt': { label: 'Inject prompt', blurb: 'Say something to the agent as if you typed it.' },
  'feed-context': { label: 'Feed context', blurb: 'Give the agent extra context it reads (stdout channel).' },
  'run-command': { label: 'Run command', blurb: 'Run a shell command on your machine (async, fire-and-forget).' },
  'continue-loop': { label: 'Continue loop', blurb: 'Keep the agent going instead of stopping.' },
  'notify-channel': { label: 'Notify', blurb: 'Show an in-app notification.' },
};

export const LOOP_TYPE_META: Record<SpellLoopType, { label: string; blurb: string }> = {
  'single-shot': { label: 'Single-shot', blurb: 'Plain "keep going".' },
  'continue-until-done': { label: 'Continue until done', blurb: '"Continue until the task is complete."' },
  'plan-execute': { label: 'Plan → execute', blurb: '"Now execute the plan you wrote."' },
  'critic-refine': { label: 'Critic → refine', blurb: '"Critique your previous output and refine it."' },
};

/** The 9 canonical server color slugs + their hex (doc 02 §Colors). */
export const SPELL_COLOR_SWATCHES: ReadonlyArray<{ slug: SpellColorSlug; hex: string; label: string }> = [
  { slug: 'amber', hex: '#f59e0b', label: 'Amber' },
  { slug: 'rose', hex: '#f43f5e', label: 'Rose' },
  { slug: 'violet', hex: '#8b5cf6', label: 'Violet' },
  { slug: 'sky', hex: '#0ea5e9', label: 'Sky' },
  { slug: 'emerald', hex: '#10b981', label: 'Emerald' },
  { slug: 'fuchsia', hex: '#d946ef', label: 'Fuchsia' },
  { slug: 'lime', hex: '#84cc16', label: 'Lime' },
  { slug: 'cyan', hex: '#06b6d4', label: 'Cyan' },
  { slug: 'indigo', hex: '#6366f1', label: 'Indigo' },
];

/** Curated emoji palette for the icon picker (free text also allowed). */
export const ICON_PALETTE: string[] = [
  '✦', '✨', '🪄', '🔮', '⚡', '🔁', '🧪', '🛡️', '🔔', '📋',
  '🧭', '🎯', '🧹', '🔍', '📣', '🚀', '⚙️', '📝', '🧠', '🌱',
];

export const SPELL_LIMITS = {
  name: 60,
  description: 1000,
  icon: 10,
  label: 60,
  matcher: 4096,
  minRules: 1,
  maxRules: 20,
} as const;

/** One rule's editable state — flattened superset of every action's fields. */
export interface EditorRule {
  key: string;               // stable React key (client-only)
  id?: string;               // server rule id (undefined for a fresh rule)
  label: string;
  enabled: boolean;
  collapsed: boolean;        // progressive disclosure (client-only)
  hookEvent: SpellHookEvent;
  matcherTools: string[];    // structured matcher — selected known tools
  useAdvancedMatcher: boolean;
  advancedMatcher: string;   // raw regex — overrides structured when on
  actionType: SpellActionType;
  // inject-prompt / feed-context
  prompt: string;
  // run-command
  command: string;
  args: string;              // whitespace-separated in the field
  cwd: string;
  feedOutput: boolean;
  runCommandAck: boolean;    // shell-command acknowledgement (gates save)
  // continue-loop
  loopType: SpellLoopType;
  maxIterations: number;
  // notify-channel (in-app only — C3)
  message: string;
}

let ruleSeq = 0;
export function newRuleKey(): string {
  ruleSeq += 1;
  return `rk_${ruleSeq.toString(36)}_${(performance.now() | 0).toString(36)}`;
}

export function blankRule(hookEvent: SpellHookEvent = 'Stop'): EditorRule {
  const actionType = ACTIONS_BY_EVENT[hookEvent][0];
  return {
    key: newRuleKey(),
    label: '',
    enabled: true,
    collapsed: false,
    hookEvent,
    matcherTools: [],
    useAdvancedMatcher: false,
    advancedMatcher: '',
    actionType,
    prompt: '',
    command: '',
    args: '',
    cwd: '',
    feedOutput: false,
    runCommandAck: false,
    loopType: 'continue-until-done',
    maxIterations: 3,
    message: '',
  };
}

/** Split a persisted matcher regex back into structured tool tokens. */
function parseToolMatcher(matcher: string): string[] {
  return matcher.split('|').map((t) => t.trim()).filter(Boolean);
}

/** Convert a persisted spell rule into editor state. */
export function ruleFromSpell(rule: SpellRule): EditorRule {
  const base = blankRule();
  base.key = newRuleKey();
  base.id = rule.id;
  base.label = rule.label ?? '';
  base.enabled = rule.enabled;
  base.collapsed = true; // existing rules start collapsed (progressive disclosure)

  const trig = rule.trigger;
  if (trig.type === 'hook') {
    base.hookEvent = trig.hookEvent;
    const matcher = (trig.matcher ?? '').trim();
    if (matcher) {
      if (isToolEvent(trig.hookEvent)) {
        base.matcherTools = parseToolMatcher(matcher);
      } else {
        base.useAdvancedMatcher = true;
        base.advancedMatcher = matcher;
      }
    }
  }

  const act = rule.action;
  base.actionType = act.type;
  switch (act.type) {
    case 'inject-prompt':
    case 'feed-context':
      base.prompt = act.prompt;
      break;
    case 'run-command':
      base.command = act.command;
      base.args = (act.args ?? []).join(' ');
      base.cwd = act.cwd ?? '';
      base.feedOutput = act.feedOutput ?? false;
      base.runCommandAck = true; // already-saved run-command is trusted
      break;
    case 'continue-loop':
      base.loopType = act.loopType ?? 'continue-until-done';
      base.maxIterations = act.maxIterations ?? 3;
      break;
    case 'notify-channel':
      base.message = act.message ?? '';
      break;
  }
  return base;
}

export function initialRules(spell: Spell | null | undefined): EditorRule[] {
  const rules = spell?.rules ?? [];
  if (rules.length === 0) return [blankRule()];
  return rules.map(ruleFromSpell);
}

/** Fresh copy of a rule for the "duplicate" action (new key, no server id). */
export function duplicateRule(r: EditorRule): EditorRule {
  return {
    ...r,
    key: newRuleKey(),
    id: undefined,
    collapsed: false,
    label: r.label.trim() ? `${r.label.trim()} (copy)` : '',
  };
}

/** Serialize the structured/advanced matcher down to a single regex string. */
export function computeMatcher(r: EditorRule): string | undefined {
  if (r.useAdvancedMatcher) return r.advancedMatcher.trim() || undefined;
  if (isToolEvent(r.hookEvent)) {
    const tools = r.matcherTools.map((t) => t.trim()).filter(Boolean);
    return tools.length ? tools.join('|') : undefined;
  }
  return undefined;
}

export function buildAction(r: EditorRule): SpellActionConfig {
  switch (r.actionType) {
    case 'inject-prompt':
      return { type: 'inject-prompt', prompt: r.prompt.trim() };
    case 'feed-context':
      return { type: 'feed-context', prompt: r.prompt.trim() };
    case 'run-command':
      return {
        type: 'run-command',
        command: r.command.trim(),
        args: r.args.trim() ? r.args.trim().split(/\s+/) : undefined,
        cwd: r.cwd.trim() || undefined,
        feedOutput: r.feedOutput,
      };
    case 'continue-loop':
      return {
        type: 'continue-loop',
        loopType: r.loopType,
        maxIterations: Math.max(1, Math.floor(r.maxIterations || 1)),
      };
    case 'notify-channel':
      return {
        type: 'notify-channel',
        message: r.message.trim() || undefined,
      };
  }
}

export function buildRulePayload(r: EditorRule): SpellRuleInput {
  return {
    id: r.id,
    label: r.label.trim() || undefined,
    enabled: r.enabled,
    trigger: { type: 'hook', hookEvent: r.hookEvent, matcher: computeMatcher(r) },
    action: buildAction(r),
  };
}

/** Build a preview SpellRule (for the live summary) without a real server id. */
export function toPreviewRule(r: EditorRule): SpellRule {
  return {
    id: r.id ?? r.key,
    label: r.label.trim() || undefined,
    enabled: r.enabled,
    trigger: { type: 'hook', hookEvent: r.hookEvent, matcher: computeMatcher(r) },
    action: buildAction(r),
  };
}

/**
 * Rudimentary catastrophic-regex guard mirroring the server's intent: reject
 * obviously unsafe nested quantifiers. The server is authoritative; this is a
 * fast-fail so the user gets inline feedback before hitting Save.
 */
function isRiskyRegex(src: string): boolean {
  // nested quantifier like (a+)+ / (a*)* / (.+)+ — classic ReDoS shape
  return /(\([^)]*[+*][^)]*\)\s*[+*])/.test(src);
}

function validRegex(src: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new RegExp(src);
    return true;
  } catch {
    return false;
  }
}

/** Per-rule validation → error string, or null when valid. */
export function ruleError(r: EditorRule): string | null {
  // capability matrix (defensive — the UI already filters the dropdown)
  if (!ACTIONS_BY_EVENT[r.hookEvent].includes(r.actionType)) {
    return `"${ACTION_META[r.actionType].label}" isn't allowed on this event.`;
  }
  const matcher = computeMatcher(r);
  if (matcher) {
    if (matcher.length > SPELL_LIMITS.matcher) return `Matcher exceeds ${SPELL_LIMITS.matcher} characters.`;
    if (!validRegex(matcher)) return 'Matcher is not a valid regular expression.';
    if (isRiskyRegex(matcher)) return 'Matcher looks catastrophic (nested quantifiers) — simplify it.';
  }
  switch (r.actionType) {
    case 'inject-prompt':
    case 'feed-context':
      if (!r.prompt.trim()) return 'Prompt text is required.';
      break;
    case 'run-command':
      if (!r.command.trim()) return 'Command is required.';
      if (!r.runCommandAck) return 'Acknowledge the shell-command warning to save.';
      break;
    case 'continue-loop':
      if (r.maxIterations < 1) return 'Max iterations must be at least 1.';
      break;
    case 'notify-channel':
      break;
  }
  return null;
}

export interface HeaderErrors {
  name?: string;
  description?: string;
  icon?: string;
  rules?: string;
}

export function headerErrors(
  name: string,
  description: string,
  icon: string,
  ruleCount: number,
): HeaderErrors {
  const e: HeaderErrors = {};
  const n = name.trim();
  if (!n) e.name = 'Name is required.';
  else if (n.length > SPELL_LIMITS.name) e.name = `Name must be ≤ ${SPELL_LIMITS.name} characters.`;
  if (description.length > SPELL_LIMITS.description) e.description = `Description must be ≤ ${SPELL_LIMITS.description} characters.`;
  if (icon.trim().length > SPELL_LIMITS.icon) e.icon = `Icon must be ≤ ${SPELL_LIMITS.icon} characters.`;
  if (ruleCount < SPELL_LIMITS.minRules) e.rules = 'Add at least one rule.';
  else if (ruleCount > SPELL_LIMITS.maxRules) e.rules = `A spell can have at most ${SPELL_LIMITS.maxRules} rules.`;
  return e;
}
