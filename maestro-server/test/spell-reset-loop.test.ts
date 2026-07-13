import { SpellService } from '../src/application/services/SpellService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import { NotFoundError } from '../src/domain/common/Errors';
import { ActiveSpell, Session, Spell } from '../src/types';

/**
 * D8/FR-6.6 — SpellService.resetLoop:
 *   - ruleId given → zero that single rule's counter, leave others intact
 *   - ruleId omitted → reset ALL counters (ruleIterations = {})
 *   - spell not active on the session → NotFoundError
 *   - session missing → NotFoundError
 * Also asserts the authoritative `spell:loop_reset` payload is emitted.
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
  listenerCount(): number {
    return 0;
  }
}

class InMemorySpellRepo implements ISpellRepository {
  constructor(private spells: Map<string, Spell>) {}
  async findAll(): Promise<Spell[]> {
    return Array.from(this.spells.values());
  }
  async findById(id: string): Promise<Spell | null> {
    return this.spells.get(id) ?? null;
  }
  async create(spell: Spell): Promise<Spell> {
    this.spells.set(spell.id, spell);
    return spell;
  }
  async update(id: string, data: Partial<Spell>): Promise<Spell> {
    const existing = this.spells.get(id)!;
    const updated = { ...existing, ...data };
    this.spells.set(id, updated);
    return updated;
  }
  async delete(id: string): Promise<void> {
    this.spells.delete(id);
  }
  async initialize(): Promise<void> {}
}

class InMemorySessionRepo implements Partial<ISessionRepository> {
  constructor(private sessions: Map<string, Session>) {}
  async findById(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }
  async update(id: string, data: Partial<Session>): Promise<Session> {
    const existing = this.sessions.get(id)!;
    Object.assign(existing, data);
    return existing;
  }
  async findAll(): Promise<any> {
    return Array.from(this.sessions.values());
  }
}

function makeSpell(id: string): Spell {
  return {
    id,
    name: id,
    description: `desc for ${id}`,
    color: 'amber' as any,
    rules: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeSession(id: string, actives: ActiveSpell[]): Session {
  return {
    id,
    projectId: 'proj_test',
    taskIds: [],
    name: 'test',
    env: {},
    status: 'active' as any,
    startedAt: 0,
    lastActivity: 0,
    completedAt: null,
    hostname: 'localhost',
    platform: 'darwin',
    events: [],
    timeline: [],
    docs: [],
    activeSpells: actives,
  } as any;
}

function makeActive(spellId: string, ruleIterations: Record<string, number>): ActiveSpell {
  return {
    spellId,
    color: 'amber' as any,
    enabled: true,
    ruleIterations,
    castAt: 0,
    castBy: null,
  };
}

function makeService(sessions: Map<string, Session>, spells: Map<string, Spell>) {
  const sessionRepo = new InMemorySessionRepo(sessions);
  const spellRepo = new InMemorySpellRepo(spells);
  const bus = new InMemoryEventBus();
  const service = new SpellService(
    null as any, // projectRepo
    null as any, // taskRepo
    sessionRepo as unknown as ISessionRepository,
    null as any, // teamMemberRepo
    null as any, // skillLoader
    null as any, // customPromptRepo
    spellRepo,
    bus,
    null as any, // idGenerator
  );
  return { service, sessionRepo, bus };
}

describe('SpellService.resetLoop', () => {
  it('resets ALL rule counters when ruleId is omitted', async () => {
    const active = makeActive('sp1', { r_a: 3, r_b: 5 });
    const sessions = new Map([['sess_1', makeSession('sess_1', [active])]]);
    const spells = new Map([['sp1', makeSpell('sp1')]]);
    const { service, sessionRepo, bus } = makeService(sessions, spells);

    const result = await service.resetLoop('sp1', 'sess_1');

    expect(result.spell.id).toBe('sp1');
    expect(result.sessionId).toBe('sess_1');
    expect(result.activeSpell.ruleIterations).toEqual({});

    // Persisted
    const persisted = await sessionRepo.findById('sess_1');
    expect(persisted!.activeSpells![0].ruleIterations).toEqual({});

    // Emitted authoritative payload
    const evt = bus.emitted.find(e => e.event === 'spell:loop_reset');
    expect(evt).toBeTruthy();
    expect(evt!.data.spellId).toBe('sp1');
    expect(evt!.data.sessionId).toBe('sess_1');
    expect(evt!.data.ruleId).toBeNull();
    expect(evt!.data.activeSpell.ruleIterations).toEqual({});
    expect(typeof evt!.data.timestamp).toBe('number');
  });

  it('resets only the named rule counter when ruleId is given, leaving others intact', async () => {
    const active = makeActive('sp1', { r_a: 3, r_b: 5 });
    const sessions = new Map([['sess_1', makeSession('sess_1', [active])]]);
    const spells = new Map([['sp1', makeSpell('sp1')]]);
    const { service, sessionRepo, bus } = makeService(sessions, spells);

    const result = await service.resetLoop('sp1', 'sess_1', 'r_a');

    expect(result.activeSpell.ruleIterations).toEqual({ r_a: 0, r_b: 5 });

    const persisted = await sessionRepo.findById('sess_1');
    expect(persisted!.activeSpells![0].ruleIterations).toEqual({ r_a: 0, r_b: 5 });

    const evt = bus.emitted.find(e => e.event === 'spell:loop_reset');
    expect(evt!.data.ruleId).toBe('r_a');
    expect(evt!.data.activeSpell.ruleIterations).toEqual({ r_a: 0, r_b: 5 });
  });

  it('leaves OTHER active spells on the session untouched', async () => {
    const target = makeActive('sp1', { r_a: 3 });
    const other = makeActive('sp2', { r_x: 7 });
    const sessions = new Map([['sess_1', makeSession('sess_1', [target, other])]]);
    const spells = new Map([['sp1', makeSpell('sp1')], ['sp2', makeSpell('sp2')]]);
    const { service, sessionRepo } = makeService(sessions, spells);

    await service.resetLoop('sp1', 'sess_1');

    const persisted = await sessionRepo.findById('sess_1');
    const sp2 = persisted!.activeSpells!.find(a => a.spellId === 'sp2');
    expect(sp2!.ruleIterations).toEqual({ r_x: 7 });
  });

  it('throws NotFoundError when the spell is not active on that session', async () => {
    const sessions = new Map([['sess_1', makeSession('sess_1', [])]]);
    const spells = new Map([['sp1', makeSpell('sp1')]]);
    const { service, bus } = makeService(sessions, spells);

    await expect(service.resetLoop('sp1', 'sess_1')).rejects.toBeInstanceOf(NotFoundError);
    expect(bus.emitted.some(e => e.event === 'spell:loop_reset')).toBe(false);
  });

  it('throws NotFoundError when the session does not exist', async () => {
    const sessions = new Map<string, Session>();
    const spells = new Map([['sp1', makeSpell('sp1')]]);
    const { service } = makeService(sessions, spells);

    await expect(service.resetLoop('sp1', 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the spell does not exist', async () => {
    const sessions = new Map([['sess_1', makeSession('sess_1', [])]]);
    const spells = new Map<string, Spell>();
    const { service } = makeService(sessions, spells);

    await expect(service.resetLoop('nope', 'sess_1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
