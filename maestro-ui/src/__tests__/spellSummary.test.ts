import { describe, it, expect } from 'vitest';
import {
  triggerSummary,
  actionSummary,
  describeRule,
  ruleSentence,
  spellRuleSummary,
  loopRules,
  isRiskySpell,
  loopProgress,
  syntheticHookPayload,
  isToolEvent,
} from '../utils/spellSummary';
import type { Spell, SpellRule } from '../app/types/maestro';

function rule(partial: Partial<SpellRule> & { action: SpellRule['action'] }): SpellRule {
  return {
    id: partial.id ?? 'rule_1',
    label: partial.label,
    enabled: partial.enabled ?? true,
    trigger: partial.trigger ?? { type: 'hook', hookEvent: 'Stop' },
    action: partial.action,
  };
}

function spell(rules: SpellRule[]): Spell {
  return {
    id: 'sp_1', name: 'Test', description: '', color: 'violet',
    rules, createdAt: 0, updatedAt: 0,
  };
}

describe('triggerSummary', () => {
  it('labels hook triggers and shows the matcher', () => {
    expect(triggerSummary({ type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' }))
      .toBe('Post-tool [Edit|Write]');
    expect(triggerSummary({ type: 'hook', hookEvent: 'Stop' })).toBe('Stop');
  });

  it('handles schedule + missing triggers', () => {
    expect(triggerSummary({ type: 'schedule' })).toMatch(/coming soon/i);
    expect(triggerSummary(null)).toBe('No trigger');
  });
});

describe('actionSummary (C3 — no channel field)', () => {
  it('describes notify-channel as in-app with no channel reference', () => {
    const s = actionSummary({ type: 'notify-channel', message: 'done!' });
    expect(s).toBe('notify (in-app)');
    expect(s).not.toMatch(/telegram|slack|relay/i);
  });

  it('describes run-command with feed flag', () => {
    expect(actionSummary({ type: 'run-command', command: 'npm', feedOutput: true }))
      .toBe('run `npm` (feed output)');
  });

  it('describes continue-loop with cap', () => {
    expect(actionSummary({ type: 'continue-loop', loopType: 'plan-execute', maxIterations: 5 }))
      .toBe('loop plan · execute ·×5');
  });
});

describe('describeRule / ruleSentence', () => {
  const r = rule({
    label: 'Lint',
    trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
    action: { type: 'run-command', command: 'npm', args: ['run', 'lint'], feedOutput: true },
  });

  it('composes label + trigger + action', () => {
    expect(describeRule(r)).toBe('Lint: Post-tool [Edit|Write] → run `npm` (feed output)');
  });

  it('renders a full sentence with matcher', () => {
    expect(ruleSentence(r)).toBe(
      'Lint — When after a tool runs matching `Edit|Write`, run `npm` and feed the output back.',
    );
  });

  it('speaks notify-channel as an in-app notification', () => {
    const n = rule({ action: { type: 'notify-channel' } });
    expect(ruleSentence(n)).toBe('When the agent finishes a turn, show an in-app notification.');
  });
});

describe('spellRuleSummary', () => {
  it('handles zero, one and many rules', () => {
    expect(spellRuleSummary(spell([]))).toBe('No rules');
    const one = spell([rule({ action: { type: 'inject-prompt', prompt: 'go' } })]);
    expect(spellRuleSummary(one)).toBe('Stop → inject a prompt');
    const many = spell([
      rule({ action: { type: 'inject-prompt', prompt: 'go' } }),
      rule({ id: 'rule_2', action: { type: 'notify-channel' } }),
    ]);
    expect(spellRuleSummary(many)).toBe('2 rules · Stop → inject a prompt');
  });
});

describe('risk + loops', () => {
  it('flags run-command and continue-loop as risky, others not', () => {
    expect(isRiskySpell(spell([rule({ action: { type: 'run-command', command: 'x' } })]))).toBe(true);
    expect(isRiskySpell(spell([rule({ action: { type: 'continue-loop' } })]))).toBe(true);
    expect(isRiskySpell(spell([rule({ action: { type: 'notify-channel' } })]))).toBe(false);
  });

  it('sums loop progress across loop rules only', () => {
    const s = spell([
      rule({ id: 'a', action: { type: 'continue-loop', maxIterations: 3 } }),
      rule({ id: 'b', action: { type: 'continue-loop', maxIterations: 2 } }),
      rule({ id: 'c', action: { type: 'inject-prompt', prompt: 'x' } }),
    ]);
    expect(loopRules(s).map((r) => r.id)).toEqual(['a', 'b']);
    expect(loopProgress(s, { a: 2, b: 1, c: 9 })).toEqual({ current: 3, max: 5 });
  });
});

describe('syntheticHookPayload (C2 test-fire)', () => {
  it('uses the first matcher tool for tool events', () => {
    expect(syntheticHookPayload({ type: 'hook', hookEvent: 'PreToolUse', matcher: 'Edit|Write' }))
      .toEqual({ tool_name: 'Edit', tool_input: {} });
    expect(syntheticHookPayload({ type: 'hook', hookEvent: 'PostToolUse' }))
      .toEqual({ tool_name: 'Bash', tool_input: {} });
  });

  it('embeds the matcher in prompt/message text events', () => {
    expect(syntheticHookPayload({ type: 'hook', hookEvent: 'UserPromptSubmit', matcher: 'deploy' }))
      .toEqual({ prompt: 'Test fire: deploy' });
    expect(syntheticHookPayload({ type: 'hook', hookEvent: 'Notification' }))
      .toEqual({ message: 'Test fire: synthetic notification' });
  });

  it('returns an empty payload for raw-payload events without a matcher', () => {
    expect(syntheticHookPayload({ type: 'hook', hookEvent: 'Stop' })).toEqual({});
    expect(syntheticHookPayload({ type: 'schedule' })).toEqual({});
    expect(syntheticHookPayload(null)).toEqual({});
  });
});

describe('isToolEvent', () => {
  it('is true only for Pre/PostToolUse', () => {
    expect(isToolEvent('PreToolUse')).toBe(true);
    expect(isToolEvent('PostToolUse')).toBe(true);
    expect(isToolEvent('Stop')).toBe(false);
    expect(isToolEvent('SessionEnd')).toBe(false);
  });
});
