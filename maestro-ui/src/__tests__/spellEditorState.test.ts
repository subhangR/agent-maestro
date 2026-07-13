import { describe, it, expect } from 'vitest';
import {
  blankRule,
  ruleFromSpell,
  buildAction,
  buildRulePayload,
  computeMatcher,
  ruleError,
  duplicateRule,
  headerErrors,
} from '../components/spells/studio/editor/editorState';
import type { SpellRule } from '../app/types/maestro';

describe('blankRule', () => {
  it('picks the first legal action for the event', () => {
    expect(blankRule('Stop').actionType).toBe('inject-prompt');
    expect(blankRule('SessionEnd').actionType).toBe('run-command');
  });
});

describe('notify-channel round-trip (C3 — channel dropped)', () => {
  const persisted: SpellRule = {
    id: 'rule_n', enabled: true,
    trigger: { type: 'hook', hookEvent: 'Stop' },
    action: { type: 'notify-channel', message: 'All done' },
  };

  it('ruleFromSpell loads the message', () => {
    const r = ruleFromSpell(persisted);
    expect(r.actionType).toBe('notify-channel');
    expect(r.message).toBe('All done');
    expect('channel' in r).toBe(false);
  });

  it('buildAction emits message only — never a channel key', () => {
    const r = ruleFromSpell(persisted);
    expect(buildAction(r)).toEqual({ type: 'notify-channel', message: 'All done' });
    r.message = '   ';
    expect(buildAction(r)).toEqual({ type: 'notify-channel', message: undefined });
  });
});

describe('computeMatcher', () => {
  it('joins structured tools for tool events', () => {
    const r = blankRule('PostToolUse');
    r.matcherTools = ['Edit', 'Write'];
    expect(computeMatcher(r)).toBe('Edit|Write');
  });

  it('advanced matcher wins when enabled; empty → undefined', () => {
    const r = blankRule('PostToolUse');
    r.matcherTools = ['Edit'];
    r.useAdvancedMatcher = true;
    r.advancedMatcher = 'Ba.h';
    expect(computeMatcher(r)).toBe('Ba.h');
    r.advancedMatcher = '  ';
    expect(computeMatcher(r)).toBeUndefined();
  });
});

describe('ruleError', () => {
  it('rejects an action that is illegal for the event', () => {
    const r = blankRule('PreToolUse');
    r.actionType = 'continue-loop';
    expect(ruleError(r)).toMatch(/isn't allowed/);
  });

  it('requires prompt text, command, and the shell acknowledgement', () => {
    const inject = blankRule('Stop');
    inject.actionType = 'inject-prompt';
    expect(ruleError(inject)).toMatch(/Prompt text is required/);

    const cmd = blankRule('SessionEnd');
    expect(ruleError(cmd)).toMatch(/Command is required/);
    cmd.command = 'npm';
    expect(ruleError(cmd)).toMatch(/Acknowledge the shell-command warning/);
    cmd.runCommandAck = true;
    expect(ruleError(cmd)).toBeNull();
  });

  it('flags invalid and catastrophic matchers', () => {
    const r = blankRule('Stop');
    r.actionType = 'notify-channel';
    r.useAdvancedMatcher = true;
    r.advancedMatcher = '([a-z';
    expect(ruleError(r)).toMatch(/not a valid regular expression/);
    r.advancedMatcher = '(a+)+';
    expect(ruleError(r)).toMatch(/catastrophic/);
    r.advancedMatcher = 'deploy';
    expect(ruleError(r)).toBeNull();
  });
});

describe('buildRulePayload / duplicateRule', () => {
  it('serializes the hook trigger + trimmed fields', () => {
    const r = blankRule('PostToolUse');
    r.matcherTools = ['Edit'];
    r.actionType = 'feed-context';
    r.prompt = '  remember the style guide  ';
    r.label = '  Style  ';
    const p = buildRulePayload(r);
    expect(p.trigger).toEqual({ type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit' });
    expect(p.action).toEqual({ type: 'feed-context', prompt: 'remember the style guide' });
    expect(p.label).toBe('Style');
  });

  it('duplicateRule clears the server id and marks the label as a copy', () => {
    const r = blankRule('Stop');
    r.id = 'rule_1';
    r.label = 'Nudge';
    const d = duplicateRule(r);
    expect(d.id).toBeUndefined();
    expect(d.key).not.toBe(r.key);
    expect(d.label).toBe('Nudge (copy)');
  });
});

describe('headerErrors', () => {
  it('enforces name and rule-count bounds', () => {
    expect(headerErrors('', '', '', 1).name).toMatch(/required/);
    expect(headerErrors('ok', '', '', 0).rules).toMatch(/at least one/);
    expect(headerErrors('ok', '', '', 21).rules).toMatch(/at most 20/);
    expect(headerErrors('ok', '', '', 3)).toEqual({});
  });
});
