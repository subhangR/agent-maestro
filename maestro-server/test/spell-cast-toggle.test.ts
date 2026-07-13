import { SpellService } from '../src/application/services/SpellService';
import { EnsembleService } from '../src/application/services/EnsembleService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import { NotFoundError } from '../src/domain/common/Errors';
import { ActiveSpell, Ensemble, Session, Spell } from '../src/types';

/**
 * SpellService C1 (coordinate cast → ensemble), C4 (toggle preserving
 * ruleIterations), and P1-4 (cascade cleanup of activeSpells on spell delete).
 */

class InMemoryEventBus implements IEventBus {
  public emitted: Array<{ event: string; data: any }> = [];
  async emit<T>(event: string, data: T): Promise<void> {
    this.emitted.push({ event, data });
  }
  on(): void {}
  off(): void {}
  once(): void {}
  removeAllListeners(): void {}
  listenerCount(): number { return 0; }
}

class InMemorySpellRepo implements ISpellRepository {
  constructor(private spells: Map<string, Spell>) {}
  async findAll(): Promise<Spell[]> { return Array.from(this.spells.values()); }
  async findById(id: string): Promise<Spell | null> { return this.spells.get(id) ?? null; }
  async create(spell: Spell): Promise<Spell> { this.spells.set(spell.id, spell); return spell; }
  async update(id: string, data: Partial<Spell>): Promise<Spell> {
    const updated = { ...this.spells.get(id)!, ...data };
    this.spells.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<void> { this.spells.delete(id); }
  async initialize(): Promise<void> {}
}

class InMemorySessionRepo implements Partial<ISessionRepository> {
  constructor(private sessions: Map<string, Session>) {}
  async findById(id: string): Promise<Session | null> { return this.sessions.get(id) ?? null; }
  async update(id: string, data: Partial<Session>): Promise<Session> {
    const existing = this.sessions.get(id)!;
    Object.assign(existing, data);
    return existing;
  }
  async findAll(): Promise<any> { return Array.from(this.sessions.values()); }
}

// Lightweight ensemble fake: records create/addMember; SpellService.activateSpell
// reconciles the session activeSpells itself, so the fake need not attach spells.
class FakeEnsembleService {
  public store = new Map<string, Ensemble>();
  public createCalls = 0;
  public addMemberCalls: Array<{ id: string; sessionId: string }> = [];
  private seq = 0;
  async list(): Promise<Ensemble[]> { return Array.from(this.store.values()); }
  async get(id: string): Promise<Ensemble> { return this.store.get(id)!; }
  async create(payload: any): Promise<Ensemble> {
    this.createCalls += 1;
    const id = `ens_${++this.seq}`;
    const ens: Ensemble = {
      id, name: payload.name, color: payload.color, objective: payload.objective,
      memberSessionIds: [...payload.memberSessionIds], leaderSessionId: null,
      spellId: payload.spellId, createdBy: payload.createdBy ?? null,
      createdAt: 0, updatedAt: 0, disbandedAt: null,
    };
    this.store.set(id, ens);
    return ens;
  }
  async addMember(id: string, sessionId: string): Promise<Ensemble> {
    this.addMemberCalls.push({ id, sessionId });
    const ens = this.store.get(id)!;
    if (!ens.memberSessionIds.includes(sessionId)) ens.memberSessionIds.push(sessionId);
    return ens;
  }
}

function makeSpell(id: string): Spell {
  return { id, name: id, description: `d ${id}`, color: 'amber' as any, rules: [], createdAt: 0, updatedAt: 0 };
}

function makeSession(id: string, actives: ActiveSpell[]): Session {
  return {
    id, projectId: 'proj_test', taskIds: [], name: 'test', env: {}, status: 'active' as any,
    startedAt: 0, lastActivity: 0, completedAt: null, hostname: 'localhost', platform: 'darwin',
    events: [], timeline: [], docs: [], activeSpells: actives,
  } as any;
}

function makeActive(spellId: string, overrides: Partial<ActiveSpell> = {}): ActiveSpell {
  return { spellId, color: 'amber' as any, enabled: true, ruleIterations: {}, castAt: 0, castBy: null, ...overrides };
}

function makeService(sessions: Map<string, Session>, spells: Map<string, Spell>, ensemble?: FakeEnsembleService) {
  const sessionRepo = new InMemorySessionRepo(sessions);
  const spellRepo = new InMemorySpellRepo(spells);
  const bus = new InMemoryEventBus();
  const service = new SpellService(
    null as any, null as any,
    sessionRepo as unknown as ISessionRepository,
    null as any, null as any, null as any,
    spellRepo, bus, null as any,
    ensemble as unknown as EnsembleService,
  );
  return { service, sessionRepo, bus };
}

describe('SpellService.toggleSpell (C4)', () => {
  it('flips the whole active spell enablement in place, preserving ruleIterations', async () => {
    const active = makeActive('sp1', { enabled: true, ruleIterations: { r_a: 4 } });
    const sessions = new Map([['sess_1', makeSession('sess_1', [active])]]);
    const { service, sessionRepo, bus } = makeService(sessions, new Map([['sp1', makeSpell('sp1')]]));

    const result = await service.toggleSpell('sp1', 'sess_1', false);

    expect(result.activeSpell.enabled).toBe(false);
    expect(result.activeSpell.ruleIterations).toEqual({ r_a: 4 });
    const persisted = await sessionRepo.findById('sess_1');
    expect(persisted!.activeSpells![0].enabled).toBe(false);
    expect(persisted!.activeSpells![0].ruleIterations).toEqual({ r_a: 4 });
    const evt = bus.emitted.find(e => e.event === 'spell:toggled');
    expect(evt!.data.enabled).toBe(false);
    expect(evt!.data.ruleId).toBeNull();
    expect(evt!.data.activeSpell.ruleIterations).toEqual({ r_a: 4 });
  });

  it('toggles a single rule runtime enablement when ruleId is given, preserving counters', async () => {
    const active = makeActive('sp1', { enabled: true, ruleIterations: { r_a: 2, r_b: 7 } });
    const sessions = new Map([['sess_1', makeSession('sess_1', [active])]]);
    const { service, sessionRepo, bus } = makeService(sessions, new Map([['sp1', makeSpell('sp1')]]));

    const result = await service.toggleSpell('sp1', 'sess_1', false, 'r_a');

    // Whole spell stays enabled; only the rule is runtime-disabled.
    expect(result.activeSpell.enabled).toBe(true);
    expect(result.activeSpell.ruleEnabled).toEqual({ r_a: false });
    expect(result.activeSpell.ruleIterations).toEqual({ r_a: 2, r_b: 7 });
    const persisted = await sessionRepo.findById('sess_1');
    expect(persisted!.activeSpells![0].ruleEnabled).toEqual({ r_a: false });
    const evt = bus.emitted.find(e => e.event === 'spell:toggled');
    expect(evt!.data.ruleId).toBe('r_a');
  });

  it('throws NotFoundError when the spell is not active on the session', async () => {
    const sessions = new Map([['sess_1', makeSession('sess_1', [])]]);
    const { service } = makeService(sessions, new Map([['sp1', makeSpell('sp1')]]));
    await expect(service.toggleSpell('sp1', 'sess_1', false)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('SpellService.activateSpell — coordinate cast (C1)', () => {
  it('creates an ensemble, stamps ensembleId on each target, and returns ensembleId', async () => {
    const sessions = new Map([
      ['s1', makeSession('s1', [])],
      ['s2', makeSession('s2', [])],
    ]);
    const ensemble = new FakeEnsembleService();
    const { service, sessionRepo } = makeService(sessions, new Map([['sp1', makeSpell('sp1')]]), ensemble);

    const result = await service.activateSpell('sp1', ['s1', 's2'], null, { castMode: 'coordinate', ensembleName: 'Alpha' });

    expect(ensemble.createCalls).toBe(1);
    expect(result.ensembleId).toBeTruthy();
    for (const sid of ['s1', 's2']) {
      const persisted = await sessionRepo.findById(sid);
      const entries = persisted!.activeSpells!.filter(a => a.spellId === 'sp1');
      expect(entries.length).toBe(1); // no duplicate entries
      expect(entries[0].ensembleId).toBe(result.ensembleId);
    }
  });

  it('reuses an existing ensemble by exact name + spellId instead of creating a second', async () => {
    const sessions = new Map([
      ['s1', makeSession('s1', [])],
      ['s2', makeSession('s2', [])],
    ]);
    const ensemble = new FakeEnsembleService();
    const { service } = makeService(sessions, new Map([['sp1', makeSpell('sp1')]]), ensemble);

    const first = await service.activateSpell('sp1', ['s1'], null, { castMode: 'coordinate', ensembleName: 'Alpha' });
    const second = await service.activateSpell('sp1', ['s2'], null, { castMode: 'coordinate', ensembleName: 'Alpha' });

    expect(ensemble.createCalls).toBe(1); // reused, not re-created
    expect(second.ensembleId).toBe(first.ensembleId);
    expect(ensemble.addMemberCalls).toEqual([{ id: first.ensembleId, sessionId: 's2' }]);
  });

  it('broadcast cast preserves ruleIterations on re-cast and does NOT touch the ensemble service', async () => {
    const prior = makeActive('sp1', { ruleIterations: { r_a: 3 } });
    const sessions = new Map([['s1', makeSession('s1', [prior])]]);
    const ensemble = new FakeEnsembleService();
    const spell: Spell = { ...makeSpell('sp1'), rules: [{ id: 'r_a', enabled: true, trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 5 } }] };
    const { service, sessionRepo } = makeService(sessions, new Map([['sp1', spell]]), ensemble);

    const result = await service.activateSpell('sp1', ['s1'], null, { castMode: 'broadcast' });

    expect(result.ensembleId).toBeUndefined();
    expect(ensemble.createCalls).toBe(0);
    const persisted = await sessionRepo.findById('s1');
    expect(persisted!.activeSpells![0].ruleIterations).toEqual({ r_a: 3 });
  });
});

describe('SpellService.deleteSpell — cascade cleanup (P1-4)', () => {
  it('strips the deleted spell from every session activeSpells', async () => {
    const sessions = new Map([
      ['s1', makeSession('s1', [makeActive('sp1'), makeActive('sp2')])],
      ['s2', makeSession('s2', [makeActive('sp1')])],
    ]);
    const { service, sessionRepo } = makeService(sessions, new Map([['sp1', makeSpell('sp1')], ['sp2', makeSpell('sp2')]]));

    await service.deleteSpell('sp1');

    const s1 = await sessionRepo.findById('s1');
    const s2 = await sessionRepo.findById('s2');
    expect(s1!.activeSpells!.map(a => a.spellId)).toEqual(['sp2']); // sp2 untouched
    expect(s2!.activeSpells!.length).toBe(0);
  });
});
