import { HookDispatcherService } from '../src/application/services/HookDispatcherService';
import { ISessionRepository } from '../src/domain/repositories/ISessionRepository';
import { ISpellRepository } from '../src/domain/repositories/ISpellRepository';
import { ITeamMemberRepository } from '../src/domain/repositories/ITeamMemberRepository';
import { IEventBus } from '../src/domain/events/IEventBus';
import {
  ActiveSpell,
  Session,
  Spell,
  SpellRule,
  SpellHookEvent,
  SpellActionConfig,
  SpellActionType,
  TeamMember,
  ACTIONS_BY_EVENT,
} from '../src/types';
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

function makeSession(actives: ActiveSpell[], overrides: Partial<Session> = {}): Session {
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
    ...overrides,
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

class InMemoryTeamMemberRepo implements Partial<ITeamMemberRepository> {
  constructor(private members: Map<string, TeamMember> = new Map()) {}
  async findById(_projectId: string, id: string): Promise<TeamMember | null> {
    return this.members.get(id) ?? null;
  }
}

function makeMember(id: string, commandPermissions?: TeamMember['commandPermissions']): TeamMember {
  return {
    id,
    projectId: 'proj_test',
    name: 'Worker',
    role: 'exec',
    avatar: '🔧',
    isDefault: false,
    status: 'active',
    commandPermissions,
    createdAt: '',
    updatedAt: '',
  } as TeamMember;
}

interface DispatcherOpts {
  eventBus?: IEventBus;
  members?: Map<string, TeamMember>;
  spellCmdAllowlist?: string[];
}

function makeDispatcher(session: Session, spells: Map<string, Spell>, opts: DispatcherOpts = {}) {
  const sessionRepo = new InMemorySessionRepo(session);
  const bus = opts.eventBus ?? new InMemoryEventBus();
  const teamMemberRepo = new InMemoryTeamMemberRepo(opts.members ?? new Map());
  const dispatcher = new HookDispatcherService(
    sessionRepo as unknown as ISessionRepository,
    new InMemorySpellRepo(spells),
    teamMemberRepo as unknown as ITeamMemberRepository,
    bus,
    silentLogger,
    { spellCmdAllowlist: opts.spellCmdAllowlist ?? [] },
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

describe('HookDispatcherService — notify-channel (C3: in-app, honest)', () => {
  it('emits notify:progress with the in-app payload shape {sessionId, spellId, ruleId, message, level}', async () => {
    const session = makeSession([makeActive('s_notify')]);
    const rule = makeRule({ id: 'r_notify', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'notify-channel', message: 'done!', level: 'success' } });
    const spells = new Map<string, Spell>([['s_notify', makeSpell('s_notify', [rule])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.exitCode).toBe(0);
    const notify = (bus as InMemoryEventBus).emitted.find(e => e.event === 'notify:progress');
    expect(notify).toBeTruthy();
    expect(notify!.data.sessionId).toBe(session.id);
    expect(notify!.data.spellId).toBe('s_notify');
    expect(notify!.data.ruleId).toBe('r_notify');
    expect(notify!.data.message).toBe('done!');
    expect(notify!.data.level).toBe('success');
    // C3: the dropped `channel` field must never appear on the payload.
    expect('channel' in notify!.data).toBe(false);
  });

  it('defaults level to "info" when unspecified', async () => {
    const session = makeSession([makeActive('s_notify')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'notify-channel', message: 'hi' } });
    const spells = new Map<string, Spell>([['s_notify', makeSpell('s_notify', [rule])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    const notify = (bus as InMemoryEventBus).emitted.find(e => e.event === 'notify:progress');
    expect(notify!.data.level).toBe('info');
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

// --- All 8 hook events dispatch server-side (hookRoutes → dispatcher) ---

describe('HookDispatcherService — all 8 hook events dispatch', () => {
  const ALL_EVENTS: SpellHookEvent[] = [
    'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop',
    'SubagentStop', 'Notification', 'SessionStart', 'SessionEnd',
  ];

  it.each(ALL_EVENTS)('dispatches %s without error (no active spells → exit 0)', async (event) => {
    const session = makeSession([]);
    const { dispatcher } = makeDispatcher(session, new Map());
    const result = await dispatcher.dispatch({ sessionId: session.id, event, payload: {} } as any);
    expect(result.exitCode).toBe(0);
    expect(result.blocked).toBe(false);
  });

  it('a feed-context rule fires for each of the 8 events when triggered on that event', async () => {
    for (const event of ALL_EVENTS) {
      const session = makeSession([makeActive('s1')]);
      const rule = makeRule({ trigger: { type: 'hook', hookEvent: event }, action: { type: 'feed-context', prompt: `ctx-${event}` } });
      const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
      const { dispatcher } = makeDispatcher(session, spells);
      const result = await dispatcher.dispatch({ sessionId: session.id, event, payload: {} } as any);
      expect(result.spells.length).toBe(1);
      expect(result.stdout).toBe(`ctx-${event}`);
    }
  });
});

// NOTE: the SPELL_LIBRARY seed-contract suite moved to test/spell-library-seeds.test.ts
// (owned by the spells/docs stream), which extends it further.

// --- Matcher target cap (4096) — ReDoS hardening (P2-2) ---

describe('HookDispatcherService — matcher target cap (4096 chars)', () => {
  it('does NOT match when the needle sits beyond the 4096-char cap', async () => {
    const session = makeSession([makeActive('s1')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'Notification', matcher: 'NEEDLE' }, action: { type: 'feed-context', prompt: 'x' } });
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    // Needle placed AFTER 4096 chars of padding — sliced off before the regex runs.
    const message = 'A'.repeat(4100) + 'NEEDLE';
    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Notification', payload: { message } } as any);
    expect(result.spells.length).toBe(0);
  });

  it('DOES match when the needle sits within the first 4096 chars', async () => {
    const session = makeSession([makeActive('s1')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'Notification', matcher: 'NEEDLE' }, action: { type: 'feed-context', prompt: 'x' } });
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const message = 'NEEDLE' + 'A'.repeat(4100);
    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Notification', payload: { message } } as any);
    expect(result.spells.length).toBe(1);
  });
});

// --- Per-event ACTIONS_BY_EVENT legality at dispatch time (P2-2) ---

describe('HookDispatcherService — every legal (event, action) combo dispatches', () => {
  const combos: Array<{ event: SpellHookEvent; action: SpellActionType }> = [];
  for (const [event, actions] of Object.entries(ACTIONS_BY_EVENT)) {
    for (const action of actions) combos.push({ event: event as SpellHookEvent, action });
  }

  function actionConfig(action: SpellActionType): SpellActionConfig {
    switch (action) {
      case 'inject-prompt': return { type: 'inject-prompt', prompt: 'p' };
      case 'feed-context': return { type: 'feed-context', prompt: 'ctx' };
      case 'run-command': return { type: 'run-command', command: process.execPath, args: ['-e', ''] };
      case 'continue-loop': return { type: 'continue-loop', maxIterations: 2 };
      case 'notify-channel': return { type: 'notify-channel', message: 'm' };
    }
  }

  it.each(combos)('$event × $action fires a rule outcome', async ({ event, action }) => {
    const session = makeSession([makeActive('s1')]);
    const rule = makeRule({ id: `r_${event}_${action}`, trigger: { type: 'hook', hookEvent: event }, action: actionConfig(action) });
    const spells = new Map<string, Spell>([['s1', makeSpell('s1', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event, payload: {} } as any);
    expect(result.spells.length).toBe(1);
    expect(result.spells[0].action).toBe(action);
    // No legal combo should ever surface an error outcome.
    expect(result.spells[0].error).toBeUndefined();
  });
});

// --- Missing run-command binary — graceful degradation (P2-2) ---

describe('HookDispatcherService — missing run-command binary', () => {
  it('spawn of a nonexistent binary degrades gracefully (exit 0, no throw, async ENOENT swallowed)', async () => {
    const session = makeSession([makeActive('s_cmd')]);
    const rule = makeRule({ trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'run-command', command: 'maestro_no_such_binary_zzz', args: [] } });
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [rule])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.exitCode).toBe(0);
    expect(result.spells[0].action).toBe('run-command');
    // The gate passed and the spawn was attempted (status ok); ENOENT arrives
    // asynchronously in the exec callback and is logged, never thrown.
    expect(result.spells[0].status).toBe('ok');
    await new Promise(r => setTimeout(r, 50)); // let the async ENOENT callback run
  });
});

// --- Colliding multi-rule iteration counters (P2-2) ---

describe('HookDispatcherService — colliding rule-id iteration counters', () => {
  it('same rule id across two different spells tracks counters independently', async () => {
    const session = makeSession([makeActive('s_a'), makeActive('s_b')]);
    const spells = new Map<string, Spell>([
      ['s_a', makeSpell('s_a', [makeRule({ id: 'r_loop', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 3 } })])],
      ['s_b', makeSpell('s_b', [makeRule({ id: 'r_loop', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 3 } })])],
    ]);
    const { dispatcher, sessionRepo } = makeDispatcher(session, spells);

    await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    const updated = await sessionRepo.findById(session.id);
    const a = updated!.activeSpells!.find(x => x.spellId === 's_a')!;
    const b = updated!.activeSpells!.find(x => x.spellId === 's_b')!;
    expect(a.ruleIterations['r_loop']).toBe(1);
    expect(b.ruleIterations['r_loop']).toBe(1);
  });

  it('two rules with distinct ids in one spell track counters independently', async () => {
    const session = makeSession([makeActive('s_multi')]);
    const spell = makeSpell('s_multi', [
      makeRule({ id: 'r1', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 5 } }),
      makeRule({ id: 'r2', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 5 } }),
    ]);
    const spells = new Map<string, Spell>([['s_multi', spell]]);
    const { dispatcher, sessionRepo } = makeDispatcher(session, spells);

    await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    const updated = await sessionRepo.findById(session.id);
    const active = updated!.activeSpells![0];
    expect(active.ruleIterations['r1']).toBe(1);
    expect(active.ruleIterations['r2']).toBe(1);
  });
});

// --- C5: run-command permission gating (block outcomes) ---

describe('HookDispatcherService — run-command permission gating (C5)', () => {
  const runCmdRule = (command: string) =>
    makeRule({ id: 'r_cmd', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'run-command', command, args: ['-e', ''] } });

  it('blocks when the session is in readOnly permission mode', async () => {
    const session = makeSession([makeActive('s_cmd')], { teamMemberSnapshot: { name: 'w', avatar: '🔧', role: 'r', permissionMode: 'readOnly' } as any });
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [runCmdRule(process.execPath)])]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells[0].status).toBe('blocked');
    expect(result.spells[0].reason).toMatch(/readOnly/i);
    const fired = (bus as InMemoryEventBus).emitted.find(e => e.event === 'spell:rule_fired');
    expect(fired!.data.outcome).toBe('blocked');
    expect(fired!.data.reason).toBeTruthy();
  });

  it("blocks when the member's commandPermissions.commands['spell-run-command'] is false", async () => {
    const members = new Map<string, TeamMember>([['tm1', makeMember('tm1', { commands: { 'spell-run-command': false } })]]);
    const session = makeSession([makeActive('s_cmd')], { teamMemberId: 'tm1' } as any);
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [runCmdRule(process.execPath)])]]);
    const { dispatcher } = makeDispatcher(session, spells, { members });

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells[0].status).toBe('blocked');
    expect(result.spells[0].reason).toMatch(/spell-run-command/);
  });

  it("blocks when the member's commandPermissions.groups['spell'] is false", async () => {
    const members = new Map<string, TeamMember>([['tm1', makeMember('tm1', { groups: { spell: false } })]]);
    const session = makeSession([makeActive('s_cmd')], { teamMemberId: 'tm1' } as any);
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [runCmdRule(process.execPath)])]]);
    const { dispatcher } = makeDispatcher(session, spells, { members });

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells[0].status).toBe('blocked');
    expect(result.spells[0].reason).toMatch(/group/);
  });

  it('blocks a shell binary via the always-on denylist (argv[0] = bash)', async () => {
    const session = makeSession([makeActive('s_cmd')]);
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [runCmdRule('/bin/bash')])]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells[0].status).toBe('blocked');
    expect(result.spells[0].reason).toMatch(/denylist/);
  });

  it('with an allowlist set, blocks a binary that is not on it', async () => {
    const session = makeSession([makeActive('s_cmd')]);
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [runCmdRule('echo')])]]);
    const { dispatcher } = makeDispatcher(session, spells, { spellCmdAllowlist: ['node'] });

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells[0].status).toBe('blocked');
    expect(result.spells[0].reason).toMatch(/allowlist|ALLOWLIST/);
  });

  it('with an allowlist set, permits a listed binary (node)', async () => {
    const session = makeSession([makeActive('s_cmd')]);
    const spells = new Map<string, Spell>([['s_cmd', makeSpell('s_cmd', [runCmdRule(process.execPath)])]]);
    const { dispatcher } = makeDispatcher(session, spells, { spellCmdAllowlist: ['node'] });

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    expect(result.spells[0].status).toBe('ok');
    await new Promise(r => setTimeout(r, 30));
  });
});

// --- C5: run-command concurrency caps (skip outcomes) ---

describe('HookDispatcherService — run-command concurrency cap (C5)', () => {
  it('skips run-commands past the per-session in-flight cap (3) with outcome "skipped"', async () => {
    // Four run-command rules on one session, each briefly sleeping so none reaps
    // before the whole dispatch loop has evaluated all four.
    const sleeper = (id: string): SpellRule =>
      makeRule({ id, trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'run-command', command: process.execPath, args: ['-e', 'setTimeout(()=>{},150)'] } });
    const session = makeSession([makeActive('s_cmd')]);
    const spell = makeSpell('s_cmd', [sleeper('r1'), sleeper('r2'), sleeper('r3'), sleeper('r4')]);
    const spells = new Map<string, Spell>([['s_cmd', spell]]);
    const { dispatcher, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {} } as any);
    const oks = result.spells.filter(s => s.status === 'ok');
    const skipped = result.spells.filter(s => s.status === 'skipped');
    expect(oks.length).toBe(3);
    expect(skipped.length).toBe(1);
    expect(skipped[0].reason).toMatch(/concurrency cap/);
    const firedSkipped = (bus as InMemoryEventBus).emitted.filter(e => e.event === 'spell:rule_fired' && e.data.outcome === 'skipped');
    expect(firedSkipped.length).toBe(1);
    await new Promise(r => setTimeout(r, 200)); // let sleepers exit + reap
  });
});

// --- C2: dry-run — full match report, zero side effects ---

describe('HookDispatcherService — dry-run (C2)', () => {
  it('runs matching + composition but executes nothing (no events, no counters)', async () => {
    const active = makeActive('s_dry', { ruleIterations: { r_loop: 0 } });
    const session = makeSession([active]);
    const spell = makeSpell('s_dry', [
      makeRule({ id: 'r_fc', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'feed-context', prompt: 'ctx' } }),
      makeRule({ id: 'r_inj', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'inject-prompt', prompt: 'inj' } }),
      makeRule({ id: 'r_loop', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 3 } }),
      makeRule({ id: 'r_cmd', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'run-command', command: process.execPath, args: ['-e', ''] } }),
    ]);
    const spells = new Map<string, Spell>([['s_dry', spell]]);
    const { dispatcher, sessionRepo, bus } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {}, dryRun: true } as any);

    expect(result.dryRun).toBe(true);
    expect(result.matched?.length).toBe(4);
    // Compose still reflects would-be behavior (feed-context stdout present).
    expect(result.stdout).toContain('ctx');
    // Zero side effects: no domain events at all.
    const emitted = (bus as InMemoryEventBus).emitted;
    expect(emitted.some(e => e.event === 'session:prompt_send')).toBe(false);
    expect(emitted.some(e => e.event === 'spell:rule_fired')).toBe(false);
    expect(emitted.some(e => e.event === 'notify:progress')).toBe(false);
    // Counter NOT incremented.
    const updated = await sessionRepo.findById(session.id);
    expect(updated!.activeSpells![0].ruleIterations['r_loop']).toBe(0);
  });

  it('reports wouldExecute:false + skipReason for a gate-blocked run-command', async () => {
    const session = makeSession([makeActive('s_dry')], { teamMemberSnapshot: { name: 'w', avatar: '🔧', role: 'r', permissionMode: 'readOnly' } as any });
    const spell = makeSpell('s_dry', [
      makeRule({ id: 'r_cmd', trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'run-command', command: process.execPath, args: [] } }),
    ]);
    const spells = new Map<string, Spell>([['s_dry', spell]]);
    const { dispatcher } = makeDispatcher(session, spells);

    const result = await dispatcher.dispatch({ sessionId: session.id, event: 'Stop', payload: {}, dryRun: true } as any);
    const report = result.matched!.find(m => m.ruleId === 'r_cmd')!;
    expect(report.wouldExecute).toBe(false);
    expect(report.skipReason).toMatch(/readOnly/i);
  });
});
