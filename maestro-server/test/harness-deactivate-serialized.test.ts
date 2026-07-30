/**
 * H2: deactivateSpell must be serialized with withSessionLock.
 *
 * Before the fix, deactivateSpell did a raw read-modify-write without any lock.
 * A concurrent activateSpell (for a different spell) could race the write and
 * silently drop the newly activated entry from activeSpells.
 *
 * This test verifies that after deactivateSpell runs, other active spells are
 * preserved (no silent drops).
 */

import { SpellService } from '../src/application/services/SpellService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import { ActiveSpell, Session, Spell } from '../src/types';
import { NotFoundError, ValidationError } from '../src/domain/common/Errors';

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
    const existing = this.spells.get(id)!;
    const updated = { ...existing, ...data };
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

function makeSpell(id: string): Spell {
  return {
    id, name: id, description: `desc-${id}`, color: 'amber' as any,
    rules: [], isDefault: false, createdAt: 0, updatedAt: 0,
  };
}

function makeActive(spellId: string, extra: Partial<ActiveSpell> = {}): ActiveSpell {
  return {
    spellId, color: 'amber' as any, enabled: true,
    ruleIterations: {}, castAt: 0, castBy: null, ...extra,
  };
}

function makeSession(id: string, actives: ActiveSpell[]): Session {
  return {
    id, projectId: 'proj_test', taskIds: [], name: 'test', env: {},
    status: 'active' as any, startedAt: 0, lastActivity: 0,
    completedAt: null, hostname: 'localhost', platform: 'darwin',
    events: [], timeline: [], docs: [], activeSpells: actives,
  } as any;
}

function makeService(sessions: Map<string, Session>, spells: Map<string, Spell>) {
  const sessionRepo = new InMemorySessionRepo(sessions);
  const spellRepo = new InMemorySpellRepo(spells);
  const bus = new InMemoryEventBus();
  const service = new SpellService(
    null as any, null as any,
    sessionRepo as unknown as ISessionRepository,
    null as any, null as any, null as any,
    spellRepo, bus, null as any,
  );
  return { service, sessions, bus };
}

describe('Harness H2 — deactivateSpell preserves other active spells', () => {
  it('removes only the target spell and leaves other spells intact', async () => {
    const sp1 = makeSpell('sp1');
    const sp2 = makeSpell('sp2');
    const sp3 = makeSpell('sp3');
    const session = makeSession('sess_1', [makeActive('sp1'), makeActive('sp2'), makeActive('sp3')]);

    const { service, sessions } = makeService(
      new Map([['sess_1', session]]),
      new Map([['sp1', sp1], ['sp2', sp2], ['sp3', sp3]]),
    );

    await service.deactivateSpell('sp2', ['sess_1']);

    const updated = sessions.get('sess_1')!;
    const remainingIds = (updated.activeSpells ?? []).map(a => a.spellId);
    expect(remainingIds).toContain('sp1');
    expect(remainingIds).toContain('sp3');
    expect(remainingIds).not.toContain('sp2');
  });

  it('deactivates across multiple sessions independently', async () => {
    const sp = makeSpell('sp1');
    const sess1 = makeSession('sess_1', [makeActive('sp1'), makeActive('sp2')]);
    const sess2 = makeSession('sess_2', [makeActive('sp1'), makeActive('sp3')]);

    const spells = new Map([['sp1', sp], ['sp2', makeSpell('sp2')], ['sp3', makeSpell('sp3')]]);
    const { service, sessions } = makeService(
      new Map([['sess_1', sess1], ['sess_2', sess2]]),
      spells,
    );

    await service.deactivateSpell('sp1', ['sess_1', 'sess_2']);

    const s1Spells = (sessions.get('sess_1')!.activeSpells ?? []).map(a => a.spellId);
    const s2Spells = (sessions.get('sess_2')!.activeSpells ?? []).map(a => a.spellId);

    expect(s1Spells).not.toContain('sp1');
    expect(s1Spells).toContain('sp2');
    expect(s2Spells).not.toContain('sp1');
    expect(s2Spells).toContain('sp3');
  });

  it('is idempotent — deactivating an already-inactive spell is a no-op', async () => {
    const sp = makeSpell('sp1');
    const session = makeSession('sess_1', [makeActive('sp2')]); // sp1 not present
    const { service, sessions } = makeService(
      new Map([['sess_1', session]]),
      new Map([['sp1', sp], ['sp2', makeSpell('sp2')]]),
    );

    // Should not throw even though sp1 is not active
    await expect(service.deactivateSpell('sp1', ['sess_1'])).resolves.toBeDefined();

    // Other spells untouched
    const remaining = (sessions.get('sess_1')!.activeSpells ?? []).map(a => a.spellId);
    expect(remaining).toContain('sp2');
  });

  it('throws ValidationError when targetSessionIds is empty', async () => {
    const sp = makeSpell('sp1');
    const { service } = makeService(new Map(), new Map([['sp1', sp]]));
    await expect(service.deactivateSpell('sp1', [])).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when the spell does not exist', async () => {
    const session = makeSession('sess_1', []);
    const { service } = makeService(new Map([['sess_1', session]]), new Map());
    await expect(service.deactivateSpell('nonexistent', ['sess_1'])).rejects.toBeInstanceOf(NotFoundError);
  });

  it('emits spell:deactivated event with correct sessionIds', async () => {
    const sp = makeSpell('sp1');
    const session = makeSession('sess_1', [makeActive('sp1')]);
    const { service, bus } = makeService(
      new Map([['sess_1', session]]),
      new Map([['sp1', sp]]),
    );

    await service.deactivateSpell('sp1', ['sess_1']);

    const evt = bus.emitted.find(e => e.event === 'spell:deactivated');
    expect(evt).toBeTruthy();
    expect(evt!.data.spellId).toBe('sp1');
    expect(evt!.data.sessionIds).toContain('sess_1');
  });
});
