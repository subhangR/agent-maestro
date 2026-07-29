/**
 * Loop engine — continue-loop action behavior in HookDispatcherService.
 *
 * Covers:
 *   - counter increments on each Stop/SubagentStop dispatch
 *   - exitCode 2 returned while within maxIterations
 *   - exitCode 0 (no continue) when maxIterations exhausted
 *   - counter persisted to session.activeSpells.ruleIterations
 *   - continue-loop on non-Stop events downgrades to exitCode 0 (stdout only)
 *   - multiple rules: each rule's counter tracked independently
 */

import { HookDispatcherService } from '../src/application/services/HookDispatcherService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { ITeamMemberRepository } from '../src/domain/repositories/ITeamMemberRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import { ActiveSpell, Session, Spell, SpellRule } from '../src/types';
import { silentLogger } from './helpers';

class InMemoryEventBus implements IEventBus {
  public emitted: Array<{ event: string; data: any }> = [];
  async emit<T>(event: string, data: T): Promise<void> { this.emitted.push({ event, data }); }
  on(): void {} off(): void {} once(): void {} removeAllListeners(): void {}
  listenerCount(): number { return 0; }
}

class InMemorySpellRepo implements ISpellRepository {
  constructor(private spells: Map<string, Spell>) {}
  async findAll(): Promise<Spell[]> { return Array.from(this.spells.values()); }
  async findById(id: string): Promise<Spell | null> { return this.spells.get(id) ?? null; }
  async create(s: Spell): Promise<Spell> { this.spells.set(s.id, s); return s; }
  async update(id: string, d: Partial<Spell>): Promise<Spell> {
    const s = { ...this.spells.get(id)!, ...d };
    this.spells.set(id, s);
    return s;
  }
  async delete(id: string): Promise<void> { this.spells.delete(id); }
  async initialize(): Promise<void> {}
}

class InMemorySessionRepo implements Partial<ISessionRepository> {
  constructor(public session: Session) {}
  async findById(id: string): Promise<Session | null> {
    return id === this.session.id ? this.session : null;
  }
  async update(id: string, data: Partial<Session>): Promise<Session> {
    Object.assign(this.session, data);
    return this.session;
  }
  async findAll(): Promise<any> { return [this.session]; }
}

function makeSession(actives: ActiveSpell[]): Session {
  return {
    id: 'sess_test', projectId: 'proj_test', taskIds: [], name: 'test', env: {},
    status: 'active' as any, startedAt: 0, lastActivity: 0, completedAt: null,
    hostname: 'localhost', platform: 'darwin', events: [], timeline: [], docs: [],
    activeSpells: actives,
  } as any;
}

function makeActive(spellId: string, ruleIterations: Record<string, number> = {}): ActiveSpell {
  return { spellId, color: 'amber' as any, enabled: true, ruleIterations, castAt: 0, castBy: null };
}

function makeLoopRule(id: string, maxIterations: number, hookEvent: 'Stop' | 'SubagentStop' | 'PreToolUse' = 'Stop'): SpellRule {
  return {
    id,
    enabled: true,
    trigger: { type: 'hook', hookEvent },
    action: { type: 'continue-loop', maxIterations } as any,
  } as SpellRule;
}

function makeSpell(id: string, rules: SpellRule[]): Spell {
  return { id, name: id, description: '', color: 'amber' as any, rules, createdAt: 0, updatedAt: 0 };
}

function makeService(session: Session, spells: Map<string, Spell>) {
  const sessionRepo = new InMemorySessionRepo(session);
  const spellRepo = new InMemorySpellRepo(spells);
  const dispatcher = new HookDispatcherService(
    sessionRepo as unknown as ISessionRepository,
    spellRepo,
    {} as ITeamMemberRepository,
    new InMemoryEventBus(),
    silentLogger,
    { spellCmdAllowlist: [] },
  );
  return { dispatcher, sessionRepo };
}

describe('Loop engine — continue-loop action', () => {
  it('returns exitCode 2 and continues on Stop within maxIterations', async () => {
    const rule = makeLoopRule('r1', 3, 'Stop');
    const spell = makeSpell('sp1', [rule]);
    const session = makeSession([makeActive('sp1', { r1: 0 })]);
    const { dispatcher } = makeService(session, new Map([['sp1', spell]]));

    const result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });

    expect(result.exitCode).toBe(2);
    expect(result.continued).toBe(true);
    expect(result.reason).toContain('1/3');
  });

  it('persists incremented counter to session.activeSpells.ruleIterations', async () => {
    const rule = makeLoopRule('r1', 5, 'Stop');
    const spell = makeSpell('sp1', [rule]);
    const session = makeSession([makeActive('sp1', { r1: 2 })]);
    const { dispatcher, sessionRepo } = makeService(session, new Map([['sp1', spell]]));

    await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });

    const updated = await sessionRepo.findById('sess_test');
    const iterations = updated!.activeSpells![0].ruleIterations;
    expect(iterations['r1']).toBe(3); // was 2, now 3
  });

  it('stops continuing (exitCode 0) once maxIterations is reached', async () => {
    const rule = makeLoopRule('r1', 2, 'Stop');
    const spell = makeSpell('sp1', [rule]);
    // Already at max (ruleIterations = 2, next would be 3 > cap 2)
    const session = makeSession([makeActive('sp1', { r1: 2 })]);
    const { dispatcher } = makeService(session, new Map([['sp1', spell]]));

    const result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });

    expect(result.exitCode).toBe(0);
    expect(result.continued).toBe(false);
    // When exhausted, the reason surfaces in the spell outcome, not on the top-level result
    const exhaustedOutcome = result.spells.find(o => o.ruleId === 'r1');
    expect(exhaustedOutcome?.reason).toContain('max iterations');
  });

  it('counter counts correctly across multiple consecutive dispatches', async () => {
    const rule = makeLoopRule('r1', 3, 'Stop');
    const spell = makeSpell('sp1', [rule]);
    const session = makeSession([makeActive('sp1', {})]);
    const { dispatcher, sessionRepo } = makeService(session, new Map([['sp1', spell]]));

    // Dispatch 1
    let result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });
    expect(result.exitCode).toBe(2);

    // Dispatch 2
    result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });
    expect(result.exitCode).toBe(2);

    // Dispatch 3
    result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });
    expect(result.exitCode).toBe(2);

    // Dispatch 4 — exhausted
    result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });
    expect(result.exitCode).toBe(0);
    expect(result.continued).toBe(false);

    const updated = await sessionRepo.findById('sess_test');
    expect(updated!.activeSpells![0].ruleIterations['r1']).toBe(3);
  });

  it('downgrade: continue-loop on non-Stop event returns exitCode 0 (stdout hint only)', async () => {
    const rule = makeLoopRule('r1', 5, 'PreToolUse');
    const spell = makeSpell('sp1', [rule]);
    const session = makeSession([makeActive('sp1', { r1: 0 })]);
    const { dispatcher } = makeService(session, new Map([['sp1', spell]]));

    const result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'PreToolUse' });

    // continue-loop fires (incrementing counter) but exitCode must be 0 on non-Stop
    expect(result.exitCode).toBe(0);
    expect(result.continued).toBe(false);
    // Stdout hint is still present so the agent sees the iteration message
    expect(result.stdout).toContain('1/5');
  });

  it('SubagentStop also triggers loop continuation (same as Stop)', async () => {
    const rule = makeLoopRule('r1', 2, 'SubagentStop');
    const spell = makeSpell('sp1', [rule]);
    const session = makeSession([makeActive('sp1', { r1: 0 })]);
    const { dispatcher } = makeService(session, new Map([['sp1', spell]]));

    const result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'SubagentStop' });

    expect(result.exitCode).toBe(2);
    expect(result.continued).toBe(true);
  });

  it('tracks each rule\'s counter independently when multiple rules exist', async () => {
    const ruleA = makeLoopRule('rA', 2, 'Stop');
    const ruleB = makeLoopRule('rB', 4, 'Stop');
    const spell = makeSpell('sp1', [ruleA, ruleB]);
    const session = makeSession([makeActive('sp1', { rA: 0, rB: 0 })]);
    const { dispatcher, sessionRepo } = makeService(session, new Map([['sp1', spell]]));

    await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });

    const updated = await sessionRepo.findById('sess_test');
    const iters = updated!.activeSpells![0].ruleIterations;
    expect(iters['rA']).toBe(1);
    expect(iters['rB']).toBe(1);
  });

  it('empty activeSpells returns early with no-op result', async () => {
    const session = makeSession([]);
    const { dispatcher } = makeService(session, new Map());

    const result = await dispatcher.dispatch({ sessionId: 'sess_test', event: 'Stop' });

    expect(result.exitCode).toBe(0);
    expect(result.spells).toHaveLength(0);
  });
});
