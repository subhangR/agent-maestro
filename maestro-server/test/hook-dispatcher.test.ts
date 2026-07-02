import { HookDispatcherService } from '../src/application/services/HookDispatcherService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import {
  ActiveSpell,
  Session,
  Spell,
  SpellRule,
  SpellHookEvent,
  SpellActionConfig,
} from '../src/types';
import { SPELL_LIBRARY } from '../src/infrastructure/repositories/FileSystemSpellRepository';
import { createSpellSchema } from '../src/api/validation';
import { silentLogger } from './helpers';

/**
 * v2 dispatcher contract (§11.3):
 *   - iterate activeSpell → spell.rules; a rule fires when it is enabled, a hook
 *     trigger for the event, and its matcher matches (regex, 4096-char cap)
 *   - feed-context returns stdout; inject-prompt emits session:prompt_send + no stdout
 *   - continue-loop only continues (exit 2) on Stop/SubagentStop, per-rule iteration
 *     tracked in ActiveSpell.ruleIterations up to maxIterations
 *   - run-command is ASYNC fire-and-forget: exit 0 immediately, stdout fed back
 *     later via session:prompt_send when feedOutput is set
 *   - notify-channel emits notify:progress with an optional channel routing hint
 *   - NO block path (gate dropped): composeResult never emits exit 2 for a block
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
    ruleIterations: {},
    castAt: 0,
    castBy: null,
    ...overrides,
  };
}

function makeRule(overrides: Partial<SpellRule> & { action: SpellActionConfig }): SpellRule {
  return {
    id: 'rule_1',
    enabled: true,
    trigger: { type: 'hook', hookEvent: 'Stop' },
    ...overrides,
  } as SpellRule;
}

function makeSpell(id: string, rules: SpellRule[], overrides: Partial<Spell> = {}): Spell {
  return {
    id,
    name: id,
    description: `desc for ${id}`,
    color: 'amber' as any,
    rules,
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
  async create(): Promise<any> { return null; }
  async findByProjectId(): Promise<any> { return []; }
  async findAll(): Promise<any> { return [this.session]; }
  async delete(): Promise<void> {}
  async findByTaskId(): Promise<any> { return []; }
  async findWithFilter(): Promise<any> { return []; }
  async flush(): Promise<void> {}
  shutdown(): void {}
}

function makeDispatcher(session: Session, spells: Map<string, Spell>, eventBus?: IEventBus) {
  const sessionRepo = new InMemorySessionRepo(session);
  const bus = eventBus ?? new InMemoryEventBus();
  const dispatcher = new HookDispatcherService(
    sessionRepo as unknown as ISessionRepository,
    new InMemorySpellRepo(spells),
    bus,
    silentLogger,
  );
  return { dispatcher, sessionRepo, bus };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise(r => setTimeout(r, 10));
  }
}

// --- Table-driven matching: event × action × matcher(match/no-match) ---

describe('HookDispatcherService — rule matching (event × action × matcher)', () => {
  type Case = {
    name: string;
    event: SpellHookEvent;
    rule: SpellRule;
    payload: Record<string, any>;
    expectFires: boolean;
    expectStdout?: string;
  };

  const cases: Case[] = [
    {
      name: 'feed-context on SessionStart fires (no matcher)',
      event: 'SessionStart',
      rule: makeRule({ trigger: { type: 'hook', hookEvent: 'SessionStart' }, action: { type: 'feed-context', prompt: 'primer' } }),
      payload: {},
      expectFires: true,
      expectStdout: 'primer',
    },
    {
      name: 'feed-context on PostToolUse with matching matcher (Edit|Write) fires',
      event: 'PostToolUse',
      rule: makeRule({ trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' }, action: { type: 'feed-context', prompt: 'linted' } }),
      payload: { tool_name: 'Edit' },
      expectFires: true,
      expectStdout: 'linted',
    },
    {
      name: 'feed-context on PostToolUse with NON-matching matcher does not fire',
      event: 'PostToolUse',
      rule: makeRule({ trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' }, action: { type: 'feed-context', prompt: 'linted' } }),
      payload: { tool_name: 'Bash' },
      expectFires: false,
    },
    {
      name: 'rule for a different event does not fire',
      event: 'Stop',
      rule: makeRule({ trigger: { type: 'hook', hookEvent: 'SessionStart' }, action: { type: 'feed-context', prompt: 'x' } }),
      payload: {},
      expectFires: false,
    },
    {
      name: 'disabled rule does not fire',
      event: 'SessionStart',
      rule: makeRule({ enabled: false, trigger: { type: 'hook', hookEvent: 'SessionStart' }, action: { type: 'feed-context', prompt: 'x' } }),
      payload: {},
      expectFires: false,
    },
    {
      name: 'schedule-trigger rule never fires (v1)',
      event: 'Stop',
      rule: makeRule({ trigger: { type: 'schedule', intervalMs: 1000 } as any, action: { type: 'feed-context', prompt: 'x' } }),
      payload: {},
      expectFires: false,
    },
    {
      name: 'matcher on non-tool event (Notification message) fires when it matches',
      event: 'Notification',
      rule: makeRule({ trigger: { type: 'hook', hookEvent: 'Notification', matcher: 'needs input' }, action: { type: 'feed-context', prompt: 'noted' } }),
      payload: { message: 'the agent needs input now' },
      expectFires: true,
      expectStdout: 'noted',
    },
  ];

  it.each(cases)('$name', async (c) => {
    const session = makeSession([makeActive('s1')]);
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [c.rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: c.event, payload: c.payload } as any);

    if (c.expectFires) {
      expect(result.spells.length).toBe(1);
      if (c.expectStdout !== undefined) expect(result.stdout).toBe(c.expectStdout);
    } else {
      expect(result.spells.length).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.exitCode).toBe(0);
    }
  });
});

// --- inject-prompt vs feed-context ---

describe('HookDispatcherService — inject-prompt / feed-context', () => {
  it('inject-prompt emits session:prompt_send and returns NO stdout (no double-delivery)', async () => {
    const session = makeSession([makeActive('s1')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'UserPromptSubmit' }, action: { type: 'inject-prompt', prompt: 'inject-text' } });
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'UserPromptSubmit', payload: {} } as any);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect((bus as InMemoryEventBus).emitted.some(e => e.event === 'session:prompt_send' && e.data.content === 'inject-text')).toBe(true);
  });

  it('feed-context stdout from multiple matching rules/spells concatenates in order', async () => {
    const session = makeSession([makeActive('s_a'), makeActive('s_b')]);
    const spells = new Map<string, Spell>([
      ['s_a', makeSpell('s_a', [makeRule({ trigger: { type: 'hook', hookEvent: 'SessionStart' }, action: { type: 'feed-context', prompt: 'context-A' } })])],
      ['s_b', makeSpell('s_b', [makeRule({ trigger: { type: 'hook', hookEvent: 'SessionStart' }, action: { type: 'feed-context', prompt: 'context-B' } })])],
    ]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'SessionStart', payload: {} } as any);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('context-A\n\ncontext-B');
  });
});

// --- continue-loop: iteration cap + Stop/SubagentStop semantics ---

describe('HookDispatcherService — continue-loop', () => {
  it('continue-loop on Stop produces exit 2, persists per-rule iteration', async () => {
    const active = makeActive('s_loop', { ruleIterations: {} });
    const session = makeSession([active]);
    const rule = makeRule({ id: 'r_loop', label: 'critic', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', loopType: 'critic-refine', maxIterations: 3 } });
    const spells = new Map<string, Spell>([['s_loop', makeSpell('s_loop', [rule])]]);
    const { dispatcher, sessionRepo } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);

    expect(result.exitCode).toBe(2);
    expect(result.continued).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.reason).toContain('iteration 1/3');
    expect(result.stdout).toContain('iteration 1/3');
    const updated = await sessionRepo.findById(session.id);
    expect(updated!.activeSpells![0].ruleIterations['r_loop']).toBe(1);
  });

  it('continue-loop at the cap stops looping (continue:false, exit 0)', async () => {
    const active = makeActive('s_loop', { ruleIterations: { r_loop: 2 } });
    const session = makeSession([active]);
    const rule = makeRule({ id: 'r_loop', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', loopType: 'plan-execute', maxIterations: 2 } });
    const spells = new Map<string, Spell>([['s_loop', makeSpell('s_loop', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);

    expect(result.exitCode).toBe(0);
    expect(result.continued).toBe(false);
    expect(result.spells[0].continue).toBe(false);
    expect(result.spells[0].reason).toContain('reached max iterations');
  });

  it('continue-loop on SubagentStop also continues (exit 2)', async () => {
    const session = makeSession([makeActive('s_loop')]);
    const rule = makeRule({ id: 'r_loop', trigger: { type: 'hook', hookEvent: 'SubagentStop' }, action: { type: 'continue-loop', maxIterations: 1 } });
    const spells = new Map<string, Spell>([['s_loop', makeSpell('s_loop', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'SubagentStop', payload: {} } as any);
    expect(result.exitCode).toBe(2);
    expect(result.continued).toBe(true);
  });

  it('continue-loop on a non-Stop event is downgraded to exit 0 (never blocks)', async () => {
    const session = makeSession([makeActive('s_loop')]);
    const rule = makeRule({ id: 'r_loop', trigger: { type: 'hook', hookEvent: 'UserPromptSubmit' }, action: { type: 'continue-loop', maxIterations: 2 } });
    const spells = new Map<string, Spell>([['s_loop', makeSpell('s_loop', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'UserPromptSubmit', payload: {} } as any);
    expect(result.exitCode).toBe(0);
    expect(result.blocked).toBe(false);
    expect(result.continued).toBe(false);
    expect(result.stdout).toContain('iteration 1/2');
  });
});

// --- run-command: async fire-and-forget + feedback ---

describe('HookDispatcherService — run-command (async)', () => {
  it('returns exit 0 immediately with no synchronous stdout', async () => {
    const session = makeSession([makeActive('s_cmd')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit' }, action: { type: 'run-command', command: process.execPath, args: ['-e', 'process.stdout.write("X")'], feedOutput: false } });
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'PostToolUse', payload: { tool_name: 'Edit' } } as any);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.spells[0].action).toBe('run-command');
  });

  it('feedOutput delivers command stdout asynchronously via session:prompt_send', async () => {
    const session = makeSession([makeActive('s_cmd')]);
    const marker = 'SPELLFEEDBACK_MARKER_42';
    const rule = makeRule({
      id: 'r_cmd',
      label: 'echo',
      trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit' },
      action: { type: 'run-command', command: process.execPath, args: ['-e', `process.stdout.write(${JSON.stringify(marker)})`], feedOutput: true },
    });
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [rule])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'PostToolUse', payload: { tool_name: 'Edit' } } as any);
    // Synchronous result carries nothing — the command runs after the hook returns.
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');

    // The feedback arrives asynchronously once the child finishes.
    const emittedBus = bus as InMemoryEventBus;
    await waitFor(() => emittedBus.emitted.some(e => e.event === 'session:prompt_send' && String(e.data.content).includes(marker)));
    const feedback = emittedBus.emitted.find(e => e.event === 'session:prompt_send' && String(e.data.content).includes(marker));
    expect(feedback!.data.content).toContain('echo');
  });
});

// --- notify-channel ---

describe('HookDispatcherService — notify-channel', () => {
  it('emits notify:progress with the channel routing hint threaded through', async () => {
    const session = makeSession([makeActive('s_notify')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'notify-channel', channel: 'telegram', message: 'done!' } });
    const spells = new Map<string, Spell>([['s_notify', makeSpell('s_notify', [rule])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.exitCode).toBe(0);
    const notify = (bus as InMemoryEventBus).emitted.find(e => e.event === 'notify:progress');
    expect(notify).toBeTruthy();
    expect(notify!.data.message).toBe('done!');
    expect(notify!.data.channel).toBe('telegram');
  });
});

// --- observability + no-block guarantee ---

describe('HookDispatcherService — observability & composition', () => {
  it('emits spell:rule_fired per fired rule (PI-6)', async () => {
    const session = makeSession([makeActive('s1')]);
    const rule = makeRule({ id: 'r_fc', trigger: { type: 'hook', hookEvent: 'SessionStart' }, action: { type: 'feed-context', prompt: 'x' } });
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    await dispatcher.dispatch({ sessionId: session.id, event: 'SessionStart', payload: {} } as any);
    const fired = (bus as InMemoryEventBus).emitted.find(e => e.event === 'spell:rule_fired');
    expect(fired).toBeTruthy();
    expect(fired!.data.ruleId).toBe('r_fc');
    expect(fired!.data.outcome).toBe('ok');
  });

  it('no active spells → empty result, exit 0', async () => {
    const session = makeSession([]);
    const { dispatcher } = makeDispatcher(session, new Map());
    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.exitCode).toBe(0);
    expect(result.blocked).toBe(false);
    expect(result.spells.length).toBe(0);
  });

  it('a disabled active spell contributes nothing', async () => {
    const session = makeSession([makeActive('s1', { enabled: false })]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'feed-context', prompt: 'x' } });
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);
    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells.length).toBe(0);
  });
});

// --- Seed-contract: every SPELL_LIBRARY seed passes the real Zod schema (PI-7b) ---

describe('SPELL_LIBRARY seed contract', () => {
  it('every seed validates against createSpellSchema', () => {
    for (const seed of SPELL_LIBRARY) {
      const payload = {
        name: seed.name,
        description: seed.description,
        icon: seed.icon,
        color: seed.color,
        rules: seed.rules,
      };
      const parsed = createSpellSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Seed "${seed.id}" failed schema: ${JSON.stringify(parsed.error.issues)}`);
      }
      expect(parsed.success).toBe(true);
    }
  });

  it('every run-command seed rule ships disabled by default', () => {
    for (const seed of SPELL_LIBRARY) {
      for (const rule of seed.rules) {
        if (rule.action.type === 'run-command') {
          expect(rule.enabled).toBe(false);
        }
      }
    }
  });
});
