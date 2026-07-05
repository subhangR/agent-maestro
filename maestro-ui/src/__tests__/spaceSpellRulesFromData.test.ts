import { describe, expect, it, vi } from 'vitest';
import { spaceSpellRulesFromData } from '../firebase/SpaceSpellsClient';

// Keep the Firestore SDK entirely out of this suite: SpaceSpellsClient builds
// its resource client at module load, so stub the factory with inert fns.
vi.mock('../firebase/spaceResourceClient', () => ({
  createSpaceResourceClient: () => ({
    subscribe: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    recordFanOut: vi.fn(),
  }),
}));

const hookTrigger = (hookEvent = 'Stop', extra: Record<string, unknown> = {}) => ({
  type: 'hook',
  hookEvent,
  ...extra,
});

const rule = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  trigger: hookTrigger(),
  action: { type: 'inject-prompt', prompt: 'do it' },
  ...overrides,
});

describe('spaceSpellRulesFromData', () => {
  it('round-trips a valid hook-triggered rule with label and matcher', () => {
    const out = spaceSpellRulesFromData([
      rule({
        label: 'Guard writes',
        trigger: hookTrigger('PreToolUse', { matcher: 'Write|Edit' }),
      }),
    ]);
    expect(out).toEqual([
      {
        label: 'Guard writes',
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'PreToolUse', matcher: 'Write|Edit' },
        action: { type: 'inject-prompt', prompt: 'do it' },
      },
    ]);
  });

  it('drops schedule triggers (server rejects them at install — Phase 2)', () => {
    const out = spaceSpellRulesFromData([
      rule({ trigger: { type: 'schedule', cron: '0 * * * *', intervalMs: 60000 } }),
    ]);
    expect(out).toBeUndefined();
  });

  it('drops rules whose action is not allowed for the hook event (server matrix)', () => {
    // SessionEnd only allows run-command / notify-channel.
    const out = spaceSpellRulesFromData([
      rule({
        trigger: { type: 'hook', hookEvent: 'SessionEnd' },
        action: { type: 'inject-prompt', prompt: 'nope' },
      }),
      rule({
        trigger: { type: 'hook', hookEvent: 'SessionEnd' },
        action: { type: 'run-command', command: 'echo ok' },
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out?.[0].action.type).toBe('run-command');
  });

  it('round-trips all five action types', () => {
    const out = spaceSpellRulesFromData([
      rule({ action: { type: 'inject-prompt', prompt: 'p1' } }),
      rule({ action: { type: 'feed-context', prompt: 'p2' } }),
      rule({
        action: {
          type: 'run-command',
          command: 'bun test',
          args: ['--watch', 42, '--silent'],
          cwd: '/tmp',
          feedOutput: true,
        },
      }),
      rule({ action: { type: 'continue-loop', loopType: 'critic-refine', maxIterations: 5 } }),
      rule({ action: { type: 'notify-channel', channel: 'ops', message: 'done' } }),
    ]);
    expect(out).toHaveLength(5);
    expect(out?.map((r) => r.action)).toEqual([
      { type: 'inject-prompt', prompt: 'p1' },
      { type: 'feed-context', prompt: 'p2' },
      // Non-string args are filtered out, not rejected.
      { type: 'run-command', command: 'bun test', args: ['--watch', '--silent'], cwd: '/tmp', feedOutput: true },
      { type: 'continue-loop', loopType: 'critic-refine', maxIterations: 5 },
      // Legacy `channel` field is dropped — notify-channel is in-app only now.
      { type: 'notify-channel', message: 'done' },
    ]);
  });

  it('drops rules with an invalid or missing hookEvent', () => {
    const out = spaceSpellRulesFromData([
      rule({ trigger: hookTrigger('NotARealEvent') }),
      rule({ trigger: { type: 'hook' } }),
      rule({ trigger: hookTrigger('SessionEnd'), action: { type: 'notify-channel' } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out?.[0].trigger).toEqual({ type: 'hook', hookEvent: 'SessionEnd' });
  });

  it('drops prompt actions with a missing or empty prompt', () => {
    expect(
      spaceSpellRulesFromData([
        rule({ action: { type: 'inject-prompt' } }),
        rule({ action: { type: 'inject-prompt', prompt: '' } }),
        rule({ action: { type: 'feed-context', prompt: 42 } }),
      ]),
    ).toBeUndefined();
  });

  it('drops run-command actions with a missing or empty command', () => {
    expect(
      spaceSpellRulesFromData([
        rule({ action: { type: 'run-command' } }),
        rule({ action: { type: 'run-command', command: '' } }),
      ]),
    ).toBeUndefined();
  });

  it('drops rules with unknown action or trigger types, and non-object entries', () => {
    expect(
      spaceSpellRulesFromData([
        rule({ action: { type: 'gate', prompt: 'legacy' } }),
        rule({ trigger: { type: 'webhook' } }),
        null,
        'garbage',
        7,
      ]),
    ).toBeUndefined();
  });

  it('returns undefined for non-array input', () => {
    expect(spaceSpellRulesFromData(undefined)).toBeUndefined();
    expect(spaceSpellRulesFromData(null)).toBeUndefined();
    expect(spaceSpellRulesFromData('rules')).toBeUndefined();
    expect(spaceSpellRulesFromData({ 0: rule() })).toBeUndefined();
  });

  it('returns undefined for an empty array (no valid rules)', () => {
    expect(spaceSpellRulesFromData([])).toBeUndefined();
  });

  it('handles optional fields: absent label/matcher/args/cwd/feedOutput are omitted', () => {
    const out = spaceSpellRulesFromData([
      rule({
        label: '',
        trigger: hookTrigger('Stop', { matcher: '' }),
        action: { type: 'run-command', command: 'ls', args: 'not-an-array' },
      }),
    ]);
    expect(out).toEqual([
      {
        enabled: true,
        trigger: { type: 'hook', hookEvent: 'Stop' },
        action: { type: 'run-command', command: 'ls' },
      },
    ]);
    const only = out?.[0] as unknown as Record<string, unknown>;
    expect('label' in only).toBe(false);
    expect('matcher' in (only.trigger as object)).toBe(false);
    expect('args' in (only.action as object)).toBe(false);
  });

  it('coerces a non-boolean enabled flag to false', () => {
    const out = spaceSpellRulesFromData([rule({ enabled: 'yes' }), rule({ enabled: undefined })]);
    expect(out?.map((r) => r.enabled)).toEqual([false, false]);
  });
});
