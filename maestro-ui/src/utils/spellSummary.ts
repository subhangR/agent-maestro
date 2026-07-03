import type {
  Spell,
  SpellRule,
  SpellTrigger,
  SpellActionConfig,
  SpellActionType,
  SpellHookEvent,
  SpellLoopType,
} from '../app/types/maestro';

/** Plain-English one-liner per hook event (editor dropdown + summaries). */
export const HOOK_EVENT_DESCRIPTIONS: Record<SpellHookEvent, string> = {
  PreToolUse: 'before a tool runs',
  PostToolUse: 'after a tool runs',
  UserPromptSubmit: 'when you submit a prompt',
  Stop: 'when the agent finishes a turn',
  SubagentStop: 'when a subagent finishes',
  Notification: 'on a notification',
  SessionStart: 'when the session starts',
  SessionEnd: 'when the session ends',
};

export const HOOK_EVENT_LABELS: Record<SpellHookEvent, string> = {
  PreToolUse: 'Pre-tool',
  PostToolUse: 'Post-tool',
  UserPromptSubmit: 'Prompt submit',
  Stop: 'Stop',
  SubagentStop: 'Subagent stop',
  Notification: 'Notification',
  SessionStart: 'Session start',
  SessionEnd: 'Session end',
};

export const ACTION_LABELS: Record<SpellActionType, string> = {
  'inject-prompt': 'Inject prompt',
  'feed-context': 'Feed context',
  'run-command': 'Run command',
  'continue-loop': 'Continue loop',
  'notify-channel': 'Notify channel',
};

export const LOOP_TYPE_LABELS: Record<SpellLoopType, string> = {
  'single-shot': 'single-shot',
  'continue-until-done': 'continue until done',
  'plan-execute': 'plan · execute',
  'critic-refine': 'critic · refine',
};

/** Tools offered in the structured matcher builder (Pre/PostToolUse). */
export const KNOWN_TOOLS: string[] = [
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'TodoWrite', 'NotebookEdit',
];

/** True for events whose matcher targets the tool name (structured builder). */
export function isToolEvent(event: SpellHookEvent): boolean {
  return event === 'PreToolUse' || event === 'PostToolUse';
}

export function triggerSummary(trigger: SpellTrigger | undefined | null): string {
  if (!trigger) return 'No trigger';
  if (trigger.type === 'schedule') return 'Schedule (coming soon)';
  const label = HOOK_EVENT_LABELS[trigger.hookEvent] ?? trigger.hookEvent;
  return trigger.matcher ? `${label} [${trigger.matcher}]` : label;
}

export function actionSummary(action: SpellActionConfig | undefined | null): string {
  if (!action) return 'No action';
  switch (action.type) {
    case 'inject-prompt':
      return 'inject a prompt';
    case 'feed-context':
      return 'feed context';
    case 'run-command':
      return `run \`${action.command || '…'}\`${action.feedOutput ? ' (feed output)' : ''}`;
    case 'continue-loop':
      return `loop ${LOOP_TYPE_LABELS[action.loopType ?? 'continue-until-done']}${
        action.maxIterations ? ` ·×${action.maxIterations}` : ''
      }`;
    case 'notify-channel':
      return `notify${action.channel ? ` ${action.channel}` : ''}`;
    default:
      return 'action';
  }
}

/** One prose line for a single rule (e.g. "Post-tool [Edit|Write] → run `npm run lint`"). */
export function describeRule(rule: SpellRule): string {
  const head = rule.label?.trim() ? `${rule.label.trim()}: ` : '';
  return `${head}${triggerSummary(rule.trigger)} → ${actionSummary(rule.action)}`;
}

/** Plain-English nudge copy per loop type (used by the verbose rule sentence). */
export const LOOP_TYPE_SENTENCE: Record<SpellLoopType, string> = {
  'single-shot': 'nudging it to keep going',
  'continue-until-done': 'until the task is complete',
  'plan-execute': 'to execute the plan it wrote',
  'critic-refine': 'to critique and refine its output',
};

/** Trigger clause as a plain-English "when…" phrase (matcher-aware). */
function triggerClause(trigger: SpellTrigger | undefined | null): string {
  if (!trigger) return 'When triggered';
  if (trigger.type === 'schedule') return 'On a schedule (coming soon)';
  const base = HOOK_EVENT_DESCRIPTIONS[trigger.hookEvent] ?? 'a hook fires';
  const matcher = trigger.matcher?.trim();
  if (!matcher) return `When ${base}`;
  return isToolEvent(trigger.hookEvent)
    ? `When ${base} matching \`${matcher}\``
    : `When ${base} (matching \`${matcher}\`)`;
}

/** Action clause as a plain-English verb phrase. */
function actionClause(action: SpellActionConfig | undefined | null): string {
  if (!action) return 'do nothing';
  switch (action.type) {
    case 'inject-prompt':
      return 'inject a prompt into the session';
    case 'feed-context':
      return 'feed the agent context';
    case 'run-command': {
      const cmd = action.command?.trim() || 'a command';
      return `run \`${cmd}\`${action.feedOutput ? ' and feed the output back' : ''}`;
    }
    case 'continue-loop': {
      const type = action.loopType ?? 'single-shot';
      const cap = action.maxIterations ?? 1;
      return `keep the agent going — ${LOOP_TYPE_SENTENCE[type]} (up to ${cap}×)`;
    }
    case 'notify-channel':
      return `send a notification${action.channel?.trim() ? ` to ${action.channel.trim()}` : ''}`;
    default:
      return 'act';
  }
}

/**
 * A full plain-English sentence for one rule — the live summary shown while
 * configuring a rule and reusable anywhere a human-readable rule line is needed.
 * e.g. "When after a tool runs matching `Edit|Write`, run `npm run lint` and
 * feed the output back."
 */
export function ruleSentence(rule: SpellRule): string {
  const head = rule.label?.trim() ? `${rule.label.trim()} — ` : '';
  return `${head}${triggerClause(rule.trigger)}, ${actionClause(rule.action)}.`;
}

/** Short spell-level summary for cards / rows. */
export function spellRuleSummary(spell: Spell | undefined | null): string {
  const rules = spell?.rules ?? [];
  if (rules.length === 0) return 'No rules';
  if (rules.length === 1) return describeRule(rules[0]);
  return `${rules.length} rules · ${describeRule(rules[0])}`;
}

/** The continue-loop rules on a spell (loops are per-rule now). */
export function loopRules(spell: Spell | undefined | null): SpellRule[] {
  return (spell?.rules ?? []).filter((r) => r.action.type === 'continue-loop');
}

/** Whether the spell has side effects worth a risky-cast confirmation. */
export function isRiskySpell(spell: Spell | undefined | null): boolean {
  return (spell?.rules ?? []).some(
    (r) => r.action.type === 'run-command' || r.action.type === 'continue-loop',
  );
}

/** Total/current loop iterations across all loop rules of an active spell. */
export function loopProgress(
  spell: Spell | undefined | null,
  ruleIterations: Record<string, number> | undefined | null,
): { current: number; max: number } {
  const iters = ruleIterations ?? {};
  let current = 0;
  let max = 0;
  for (const rule of loopRules(spell)) {
    current += iters[rule.id] ?? 0;
    if (rule.action.type === 'continue-loop') max += rule.action.maxIterations ?? 0;
  }
  return { current, max };
}
