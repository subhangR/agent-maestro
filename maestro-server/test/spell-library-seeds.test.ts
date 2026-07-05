import { SPELL_LIBRARY } from '../src/infrastructure/repositories/FileSystemSpellRepository';
import { createSpellSchema } from '../src/api/validation';
import { ACTIONS_BY_EVENT, SpellRule } from '../src/types';

/**
 * Seed-contract test for the curated SPELL_LIBRARY (designed in docs/spell-library.md).
 *
 * Seeds are TypeScript literals that bypass request-time Zod validation, so without
 * this test they can silently drift out of contract. Every invariant the library
 * promises is asserted here:
 *   1. each seed's { name, description, icon, color, rules } passes the real
 *      createSpellSchema (which also enforces isSafeRegex on matchers and the
 *      ACTIONS_BY_EVENT legality superRefine);
 *   2. every run-command rule ships enabled:false (safe by default);
 *   3. every matcher compiles as a RegExp (belt-and-braces over the schema check);
 *   4. every rule's action is legal for its hook event per ACTIONS_BY_EVENT;
 *   5. no notify-channel action carries a `channel` field (dropped in C3);
 *   6. spell ids and (per-spell) rule ids are unique; the refined seeds retain their
 *      historical ids so existing activations/overrides survive.
 */

const asCreatePayload = (seed: (typeof SPELL_LIBRARY)[number]) => ({
  name: seed.name,
  description: seed.description,
  icon: seed.icon,
  color: seed.color,
  rules: seed.rules,
});

const allRules = (): Array<{ seedId: string; rule: SpellRule }> =>
  SPELL_LIBRARY.flatMap(seed => seed.rules.map(rule => ({ seedId: seed.id, rule })));

describe('SPELL_LIBRARY seed contract', () => {
  it('has a non-empty library where every seed is a non-deletable default', () => {
    expect(SPELL_LIBRARY.length).toBeGreaterThan(0);
    for (const seed of SPELL_LIBRARY) {
      expect(seed.isDefault).toBe(true);
      expect(seed.rules.length).toBeGreaterThanOrEqual(1);
      expect(seed.rules.length).toBeLessThanOrEqual(20);
    }
  });

  it('every seed validates against the real createSpellSchema', () => {
    for (const seed of SPELL_LIBRARY) {
      const parsed = createSpellSchema.safeParse(asCreatePayload(seed));
      if (!parsed.success) {
        throw new Error(
          `Seed "${seed.id}" failed schema: ${JSON.stringify(parsed.error.issues)}`,
        );
      }
      expect(parsed.success).toBe(true);
    }
  });

  it('every run-command rule ships enabled:false (safe by default)', () => {
    for (const { seedId, rule } of allRules()) {
      if (rule.action.type === 'run-command') {
        expect(`${seedId}:${rule.id}:${rule.enabled}`).toBe(`${seedId}:${rule.id}:false`);
      }
    }
  });

  it('every run-command default is self-describing (echo placeholder or npx tsc --noEmit)', () => {
    for (const { rule } of allRules()) {
      if (rule.action.type === 'run-command') {
        const { command, args } = rule.action;
        const isEchoPlaceholder = command === 'echo';
        const isUniversalTsc = command === 'npx' && (args ?? []).join(' ') === 'tsc --noEmit';
        // No seed hardcodes a project-specific script (the old `npm run lint` trap).
        expect(isEchoPlaceholder || isUniversalTsc).toBe(true);
      }
    }
  });

  it('every matcher compiles as a RegExp', () => {
    for (const { seedId, rule } of allRules()) {
      if (rule.trigger.type === 'hook' && rule.trigger.matcher) {
        expect(() => new RegExp(rule.trigger.type === 'hook' ? rule.trigger.matcher! : ''))
          .not.toThrow(`bad matcher in ${seedId}:${rule.id}`);
      }
    }
  });

  it('every rule action is legal for its hook event (ACTIONS_BY_EVENT)', () => {
    for (const { seedId, rule } of allRules()) {
      expect(rule.trigger.type).toBe('hook');
      if (rule.trigger.type !== 'hook') continue;
      const legal = ACTIONS_BY_EVENT[rule.trigger.hookEvent] ?? [];
      expect(`${seedId}: ${rule.action.type} on ${rule.trigger.hookEvent}`).toBe(
        legal.includes(rule.action.type)
          ? `${seedId}: ${rule.action.type} on ${rule.trigger.hookEvent}`
          : `${seedId}: <illegal action ${rule.action.type} for ${rule.trigger.hookEvent}>`,
      );
    }
  });

  it('no notify-channel action carries a `channel` field (dropped in C3)', () => {
    for (const { seedId, rule } of allRules()) {
      if (rule.action.type === 'notify-channel') {
        expect(`${seedId}:${'channel' in rule.action}`).toBe(`${seedId}:false`);
      }
    }
  });

  it('spell ids are unique across the library', () => {
    const ids = SPELL_LIBRARY.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rule ids are unique within each seed', () => {
    for (const seed of SPELL_LIBRARY) {
      const ruleIds = seed.rules.map(r => r.id);
      expect(new Set(ruleIds).size).toBe(ruleIds.length);
    }
  });

  it('refined seeds retain their historical ids', () => {
    const ids = new Set(SPELL_LIBRARY.map(s => s.id));
    for (const stable of [
      'spell_self_critic',
      'spell_plan_first',
      'spell_progress_pulse',
      'spell_context_primer',
      'spell_notify_on_done',
      'spell_lint_on_edit',
      'spell_guardrail_combo',
    ]) {
      expect(ids.has(stable)).toBe(true);
    }
  });
});
