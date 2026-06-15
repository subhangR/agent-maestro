import { HookDispatcherService } from '../src/application/services/HookDispatcherService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import { ActiveSpell, Session, Spell } from '../src/types';
import { silentLogger } from './helpers';

/**
 * Composition contract for HookDispatcherService.composeResult:
 *   - gate-wins: any spell with block:true forces exitCode 2, stdout cleared,
 *     reason composed from blockers
 *   - continue-loop on Stop: exitCode 2 with concatenated stdout + reason,
 *     iteration is bumped + persisted up to maxIterations
 *   - continue-loop on non-Stop events (defense in depth): downgraded to
 *     exitCode 0 to avoid blocking UserPromptSubmit / PreToolUse
 *   - failMode=open: spell action error → spell skipped, others continue
 *   - failMode=closed: spell action error → synthetic block (gate semantics)
 *   - inject-prompt: emits session:prompt_send and does NOT return stdout
 *     (prevents double-delivery on stdout-surfacing hooks like UserPromptSubmit)
 *   - feed-context: stdout from multiple spells is concatenated in order
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

function makeSession(actives: ActiveSpell[]): Session {
  return {
    id: 'sess_test',
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

function makeActive(spellId: string, overrides: Partial<ActiveSpell> = {}): ActiveSpell {
  return {
    spellId,
    color: 'amber' as any,
    enabled: true,
    iteration: 0,
    castAt: 0,
    castBy: null,
    ...overrides,
  };
}

function makeSpell(id: string, overrides: Partial<Spell> = {}): Spell {
  return {
    id,
    name: id,
    description: `desc for ${id}`,
    color: 'amber' as any,
    action: 'feed-context' as any,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
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
  constructor(public session: Session) {}
  async findById(id: string): Promise<Session | null> {
    return id === this.session.id ? this.session : null;
  }
  async update(id: string, data: Partial<Session>): Promise<Session> {
    Object.assign(this.session, data);
    return this.session;
  }
  // unused stubs
  async create(): Promise<any> { return null; }
  async findByProjectId(): Promise<any> { return []; }
  async findAll(): Promise<any> { return []; }
  async delete(): Promise<void> {}
  async findByTaskId(): Promise<any> { return []; }
  async findWithFilter(): Promise<any> { return []; }
  async flush(): Promise<void> {}
  shutdown(): void {}
}

describe('HookDispatcherService.composeResult contract', () => {
  it('gate wins: a blocking outcome produces exitCode 2 with composed reasons and cleared stdout', async () => {
    const session = makeSession([
      makeActive('s_gate', { hookEvent: 'PreToolUse' }),
      makeActive('s_inject', { hookEvent: 'PreToolUse' }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_gate', makeSpell('s_gate', {
        action: 'gate' as any,
        trigger: { hookEvent: 'PreToolUse' as any, enabled: true },
      })],
      ['s_inject', makeSpell('s_inject', {
        action: 'feed-context' as any,
        description: 'should-not-leak',
        trigger: { hookEvent: 'PreToolUse' as any, enabled: true },
      })],
    ]);
    const sessionRepo = new InMemorySessionRepo(session);
    const dispatcher = new HookDispatcherService(
      sessionRepo as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      new InMemoryEventBus(),
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'PreToolUse' as any,
      payload: { tool_name: 'Bash' },
    } as any);

    expect(result.exitCode).toBe(2);
    expect(result.blocked).toBe(true);
    expect(result.continued).toBe(false);
    // stdout is cleared on block — feed-context output must not leak through
    expect(result.stdout).toBe('');
    // Gate reason is the spell description (composeResult joins blocker reasons).
    expect(result.reason).toContain('desc for s_gate');
  });

  it('continue-loop on Stop produces exitCode 2 and persists iteration up to maxIterations', async () => {
    const session = makeSession([
      makeActive('s_loop', { hookEvent: 'Stop', iteration: 0 }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_loop', makeSpell('s_loop', {
        action: 'continue-loop' as any,
        loopType: 'critic-refine' as any,
        maxIterations: 3,
        trigger: { hookEvent: 'Stop' as any, enabled: true },
      })],
    ]);
    const sessionRepo = new InMemorySessionRepo(session);
    const dispatcher = new HookDispatcherService(
      sessionRepo as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      new InMemoryEventBus(),
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'Stop' as any,
      payload: {},
    } as any);

    expect(result.exitCode).toBe(2);
    expect(result.blocked).toBe(false);
    expect(result.continued).toBe(true);
    expect(result.reason).toContain('Loop "s_loop" iteration 1/3');
    // stdout carries the continuation hint
    expect(result.stdout).toContain('iteration 1/3');
    // iteration was bumped + persisted on the session
    const updated = await sessionRepo.findById(session.id);
    expect(updated!.activeSpells![0].iteration).toBe(1);
  });

  it('continue-loop on non-Stop event downgrades to exitCode 0 (does NOT block)', async () => {
    // Defense in depth: even if a misconfigured continue-loop spell fires on
    // UserPromptSubmit, exit 2 there means BLOCK the prompt. Composition must
    // downgrade so the user's first prompt isn't silently erased.
    const session = makeSession([
      makeActive('s_loop', { hookEvent: 'UserPromptSubmit', iteration: 0 }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_loop', makeSpell('s_loop', {
        action: 'continue-loop' as any,
        loopType: 'plan-execute' as any,
        maxIterations: 2,
        trigger: { hookEvent: 'UserPromptSubmit' as any, enabled: true },
      })],
    ]);
    const dispatcher = new HookDispatcherService(
      new InMemorySessionRepo(session) as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      new InMemoryEventBus(),
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'UserPromptSubmit' as any,
      payload: {},
    } as any);

    expect(result.exitCode).toBe(0);
    expect(result.blocked).toBe(false);
    expect(result.continued).toBe(false);
    // Reason surfaces via stdout (hint to next turn) instead of blocking
    expect(result.stdout).toContain('iteration 1/2');
  });

  it('feed-context: stdout from multiple matching spells is concatenated in order', async () => {
    const session = makeSession([
      makeActive('s_a', { hookEvent: 'SessionStart' }),
      makeActive('s_b', { hookEvent: 'SessionStart' }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_a', makeSpell('s_a', {
        action: 'feed-context' as any,
        description: 'context-A',
        trigger: { hookEvent: 'SessionStart' as any, enabled: true },
      })],
      ['s_b', makeSpell('s_b', {
        action: 'feed-context' as any,
        description: 'context-B',
        trigger: { hookEvent: 'SessionStart' as any, enabled: true },
      })],
    ]);
    const dispatcher = new HookDispatcherService(
      new InMemorySessionRepo(session) as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      new InMemoryEventBus(),
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'SessionStart' as any,
      payload: {},
    } as any);

    expect(result.exitCode).toBe(0);
    expect(result.blocked).toBe(false);
    expect(result.stdout).toBe('context-A\n\ncontext-B');
  });

  it('inject-prompt emits session:prompt_send and does NOT return stdout (prevents double-delivery)', async () => {
    const session = makeSession([
      makeActive('s_inject', { hookEvent: 'UserPromptSubmit' }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_inject', makeSpell('s_inject', {
        action: 'inject-prompt' as any,
        description: 'inject-text',
        trigger: { hookEvent: 'UserPromptSubmit' as any, enabled: true },
      })],
    ]);
    const eventBus = new InMemoryEventBus();
    const dispatcher = new HookDispatcherService(
      new InMemorySessionRepo(session) as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      eventBus,
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'UserPromptSubmit' as any,
      payload: {},
    } as any);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(eventBus.emitted.some(e => e.event === 'session:prompt_send' && e.data.content === 'inject-text')).toBe(true);
  });

  it('failMode "open" skips a throwing spell and continues with the rest', async () => {
    // Spell whose action throws (run-command with no `command` returns empty stdout
    // — to force an error we use notify-channel and a failing event bus on it).
    // Simpler: simulate by giving a continue-loop spell that throws via a broken
    // session repo on update — instead, use a custom subclass of the dispatcher
    // is overkill. Use notify-channel + an event bus that throws.
    const session = makeSession([
      makeActive('s_bad', { hookEvent: 'Stop' }),
      makeActive('s_good', { hookEvent: 'Stop' }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_bad', makeSpell('s_bad', {
        action: 'notify-channel' as any,
        failMode: 'open',
        trigger: { hookEvent: 'Stop' as any, enabled: true },
      })],
      ['s_good', makeSpell('s_good', {
        action: 'feed-context' as any,
        description: 'good-output',
        failMode: 'open',
        trigger: { hookEvent: 'Stop' as any, enabled: true },
      })],
    ]);
    const throwingBus: IEventBus = {
      async emit() { throw new Error('boom'); },
      on() {}, off() {}, once() {}, removeAllListeners() {},
    };
    const dispatcher = new HookDispatcherService(
      new InMemorySessionRepo(session) as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      throwingBus,
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'Stop' as any,
      payload: {},
    } as any);

    // Bad spell errored but failMode:open → result still composes good's stdout
    expect(result.blocked).toBe(false);
    expect(result.stdout).toBe('good-output');
    const badOutcome = result.spells.find(s => s.spellId === 's_bad');
    expect(badOutcome?.error).toBe('boom');
    expect(badOutcome?.block).not.toBe(true);
  });

  it('failMode "closed" produces a synthetic block when the spell throws', async () => {
    const session = makeSession([
      makeActive('s_closed', { hookEvent: 'Stop' }),
    ]);
    const spells = new Map<string, Spell>([
      ['s_closed', makeSpell('s_closed', {
        action: 'notify-channel' as any,
        failMode: 'closed',
        trigger: { hookEvent: 'Stop' as any, enabled: true },
      })],
    ]);
    const throwingBus: IEventBus = {
      async emit() { throw new Error('downstream-failure'); },
      on() {}, off() {}, once() {}, removeAllListeners() {},
    };
    const dispatcher = new HookDispatcherService(
      new InMemorySessionRepo(session) as unknown as ISessionRepository,
      new InMemorySpellRepo(spells),
      throwingBus,
      silentLogger,
    );

    const result = await dispatcher.dispatch({
      sessionId: session.id,
      event: 'Stop' as any,
      payload: {},
    } as any);

    expect(result.blocked).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.reason).toContain('fail-closed');
    expect(result.reason).toContain('downstream-failure');
  });
});
