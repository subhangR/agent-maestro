import { describe, it, expect, beforeEach } from 'vitest';
import { useActiveSpellsStore } from '../stores/useActiveSpellsStore';

const initial = useActiveSpellsStore.getState();

function seed(sessionId = 's1', spellId = 'sp1', extra: Partial<Parameters<typeof initial.activate>[0]> = {}) {
  useActiveSpellsStore.getState().activate({
    sessionIds: [sessionId],
    spellId,
    spellName: 'Spell One',
    color: 'violet',
    castAt: 1000,
    enabled: true,
    ruleIterations: { r1: 2, r2: 1 },
    ...extra,
  });
}

beforeEach(() => {
  useActiveSpellsStore.setState(initial, true);
});

describe('activate / deactivate', () => {
  it('adds a spell to every target session, sorted by castAt', () => {
    seed('s1', 'old');
    useActiveSpellsStore.getState().activate({
      sessionIds: ['s1', 's2'], spellId: 'new', spellName: 'New', color: 'amber',
      castAt: 500, enabled: true,
    });
    const s1 = useActiveSpellsStore.getState().byMaestroSessionId['s1'];
    expect(s1.map((a) => a.spellId)).toEqual(['new', 'old']); // oldest castAt first
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s2']).toHaveLength(1);
  });

  it('re-activation replaces the existing entry instead of duplicating', () => {
    seed(); seed();
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1']).toHaveLength(1);
  });

  it('deactivate removes the spell and drops empty sessions', () => {
    seed();
    useActiveSpellsStore.getState().deactivate({ sessionIds: ['s1'], spellId: 'sp1' });
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1']).toBeUndefined();
  });
});

describe('applyToggle (C4)', () => {
  it('flips enabled in place and preserves ruleIterations', () => {
    seed();
    useActiveSpellsStore.getState().applyToggle({ maestroSessionId: 's1', spellId: 'sp1', enabled: false });
    const row = useActiveSpellsStore.getState().byMaestroSessionId['s1'][0];
    expect(row.enabled).toBe(false);
    expect(row.ruleIterations).toEqual({ r1: 2, r2: 1 }); // untouched
  });

  it('reconciles ruleIterations when the authoritative payload includes them', () => {
    seed();
    useActiveSpellsStore.getState().applyToggle({
      maestroSessionId: 's1', spellId: 'sp1', enabled: true, ruleIterations: { r1: 7 },
    });
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].ruleIterations).toEqual({ r1: 7 });
  });

  it('is a no-op for unknown sessions and untargeted spells', () => {
    seed();
    useActiveSpellsStore.getState().applyToggle({ maestroSessionId: 'nope', spellId: 'sp1', enabled: false });
    useActiveSpellsStore.getState().applyToggle({ maestroSessionId: 's1', spellId: 'other', enabled: false });
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].enabled).toBe(true);
  });
});

describe('loop reset reconciliation', () => {
  it('resetRuleIterations zeroes one rule when ruleId given, else all', () => {
    seed();
    useActiveSpellsStore.getState().resetRuleIterations({ maestroSessionId: 's1', spellId: 'sp1', ruleId: 'r1' });
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].ruleIterations).toEqual({ r1: 0, r2: 1 });
    useActiveSpellsStore.getState().resetRuleIterations({ maestroSessionId: 's1', spellId: 'sp1' });
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].ruleIterations).toEqual({ r1: 0, r2: 0 });
  });

  it('applyLoopReset replaces ruleIterations wholesale from the server payload', () => {
    seed();
    useActiveSpellsStore.getState().applyLoopReset({
      maestroSessionId: 's1', spellId: 'sp1', ruleIterations: { r9: 4 },
    });
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].ruleIterations).toEqual({ r9: 4 });
  });
});

describe('recordRuleFired (S8 activity feed)', () => {
  it('prepends entries newest-first with normalized outcome', () => {
    useActiveSpellsStore.getState().recordRuleFired({
      maestroSessionId: 's1', spellId: 'sp1', ruleId: 'r1',
      event: 'PostToolUse', action: 'run-command', outcome: 'ok', timestamp: 111,
    });
    useActiveSpellsStore.getState().recordRuleFired({
      maestroSessionId: 's1', spellId: 'sp1', ruleId: 'r2',
      event: 'Stop', action: 'continue-loop', outcome: 'error', timestamp: 222,
    });
    const feed = useActiveSpellsStore.getState().activityByMaestroSessionId['s1'];
    expect(feed.map((e) => e.ruleId)).toEqual(['r2', 'r1']);
    expect(feed[0].outcome).toBe('error');
  });

  it('caps the feed at 60 entries per session', () => {
    for (let i = 0; i < 70; i++) {
      useActiveSpellsStore.getState().recordRuleFired({
        maestroSessionId: 's1', spellId: 'sp1', ruleId: `r${i}`,
        event: 'Stop', action: 'inject-prompt', outcome: 'ok', timestamp: i,
      });
    }
    expect(useActiveSpellsStore.getState().activityByMaestroSessionId['s1']).toHaveLength(60);
  });
});

describe('clearSession', () => {
  it('drops both active spells and activity for the session', () => {
    seed();
    useActiveSpellsStore.getState().recordRuleFired({
      maestroSessionId: 's1', spellId: 'sp1', ruleId: 'r1',
      event: 'Stop', action: 'inject-prompt', outcome: 'ok',
    });
    useActiveSpellsStore.getState().clearSession('s1');
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1']).toBeUndefined();
    expect(useActiveSpellsStore.getState().activityByMaestroSessionId['s1']).toBeUndefined();
  });
});
