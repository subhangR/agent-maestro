/* data.js — the shipped Spell data model as plain window globals.
   Grounded in 02-config-and-options-reference.md. No JSX here. */

/* The 9 canonical spell colors (ring identity). */
const SPELL_COLORS = {
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  violet:  '#8b5cf6',
  sky:     '#0ea5e9',
  emerald: '#10b981',
  fuchsia: '#d946ef',
  lime:    '#84cc16',
  cyan:    '#06b6d4',
  indigo:  '#6366f1',
};
const SPELL_COLOR_ORDER = ['amber','rose','violet','sky','emerald','fuchsia','lime','cyan','indigo'];

/* The 8 hook events with the plain-English copy the UI uses. */
const HOOK_EVENTS = [
  { id: 'SessionStart',     label: 'Session starts',      fires: 'A session begins.',                              good: 'Priming context, setup commands.',        matches: null },
  { id: 'UserPromptSubmit', label: 'Prompt submitted',    fires: 'You submit a prompt to the agent.',              good: 'Injecting standing instructions.',        matches: 'the prompt text' },
  { id: 'PreToolUse',       label: 'Before a tool runs',  fires: 'Just before the agent runs a tool.',             good: 'Pre-checks, warnings.',                   matches: 'tool' },
  { id: 'PostToolUse',      label: 'After a tool runs',   fires: 'Just after the agent runs a tool.',              good: 'Lint / test after Edit or Write.',        matches: 'tool' },
  { id: 'Notification',     label: 'Agent notifies',      fires: 'The agent emits a notification (e.g. needs input).', good: 'Nudges, progress pings.',            matches: 'the message text' },
  { id: 'Stop',             label: 'Agent stops',         fires: 'The agent finishes its turn / would stop.',      good: 'Loops, notify-on-done, wrap-up.',         matches: 'the raw payload' },
  { id: 'SubagentStop',     label: 'Subagent stops',      fires: 'A spawned subagent finishes.',                   good: 'Loops / notify at subagent boundaries.',  matches: 'the raw payload' },
  { id: 'SessionEnd',       label: 'Session ends',        fires: 'The session is ending (terminal).',              good: 'Cleanup commands, final notify only.',    matches: 'the raw payload' },
];

/* Actions + metadata. */
const ACTIONS = {
  'inject-prompt': { label: 'Say to agent',    icon: 'quote',    blurb: 'Push a prompt into the session as if you typed it.',      risky: false },
  'feed-context':  { label: 'Give context',    icon: 'book',     blurb: 'Supply text the agent reads as background context.',      risky: false },
  'run-command':   { label: 'Run a command',   icon: 'terminal', blurb: 'Run a shell command on your machine, async.',            risky: true  },
  'continue-loop': { label: 'Keep going',      icon: 'loop',     blurb: 'Nudge the agent to continue past where it would stop.',   risky: true  },
  'notify-channel':{ label: 'Notify a channel',icon: 'bell',     blurb: 'Ping a channel (Telegram, Slack, …) when this fires.',    risky: false },
};
const ACTION_ORDER = ['inject-prompt','feed-context','run-command','continue-loop','notify-channel'];

/* Capability matrix: which actions each event allows (02 §capability matrix). */
const CAPABILITY = {
  SessionStart:     ['inject-prompt','feed-context','run-command','notify-channel'],
  UserPromptSubmit: ['inject-prompt','feed-context','run-command','notify-channel'],
  PreToolUse:       ['inject-prompt','feed-context','run-command','notify-channel'],
  PostToolUse:      ['inject-prompt','feed-context','run-command','notify-channel'],
  Notification:     ['inject-prompt','feed-context','run-command','notify-channel'],
  Stop:             ['inject-prompt','feed-context','run-command','continue-loop','notify-channel'],
  SubagentStop:     ['inject-prompt','feed-context','run-command','continue-loop','notify-channel'],
  SessionEnd:       ['run-command','notify-channel'],
};

const LOOP_TYPES = [
  { id: 'single-shot',        label: 'Keep going',       blurb: 'A plain "keep going" nudge.' },
  { id: 'continue-until-done',label: 'Until done',       blurb: '"Continue until the task is complete."' },
  { id: 'plan-execute',       label: 'Execute the plan', blurb: '"Now execute the plan you wrote."' },
  { id: 'critic-refine',      label: 'Critique & refine',blurb: '"Critique your previous output and refine it."' },
];

/* Known tools for the structured matcher (PreToolUse / PostToolUse). */
const TOOLS = ['Edit','Write','Read','Bash','Glob','Grep','WebFetch','WebSearch','Task','NotebookEdit'];

let RID = 100;
const rid = () => 'r' + (++RID);

/* ---- Seed spells (curated, read-only) + a couple of realistic custom ones. */
const SEED_SPELLS = [
  {
    id: 'seed-self-critic', isDefault: true, name: 'Self-Critic', icon: '🔍', color: 'violet',
    description: 'After the agent stops, make it critique and refine its own last output — up to three passes.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: true, label: 'Refine loop', trigger: { type: 'hook', hookEvent: 'Stop', matcher: '' },
        action: { type: 'continue-loop', loopType: 'critic-refine', maxIterations: 3 } },
    ],
  },
  {
    id: 'seed-plan-first', isDefault: true, name: 'Plan-First', icon: '🗺️', color: 'sky',
    description: 'When the agent stops after planning, nudge it to execute the plan it just wrote.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: true, label: '', trigger: { type: 'hook', hookEvent: 'Stop', matcher: '' },
        action: { type: 'continue-loop', loopType: 'plan-execute', maxIterations: 2 } },
    ],
  },
  {
    id: 'seed-progress-pulse', isDefault: true, name: 'Progress Pulse', icon: '📣', color: 'amber',
    description: 'Whenever the agent notifies (e.g. needs input), ask it to report progress first.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: true, label: '', trigger: { type: 'hook', hookEvent: 'Notification', matcher: '' },
        action: { type: 'inject-prompt', prompt: 'Before continuing, report your progress in one or two sentences.' } },
    ],
  },
  {
    id: 'seed-context-primer', isDefault: true, name: 'Context Primer', icon: '📚', color: 'indigo',
    description: 'On session start, feed the agent a primer of the task and its docs.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: true, label: '', trigger: { type: 'hook', hookEvent: 'SessionStart', matcher: '' },
        action: { type: 'feed-context', prompt: 'You are picking up an in-progress task. Read the attached task description and its linked docs before acting.' } },
    ],
  },
  {
    id: 'seed-notify-done', isDefault: true, name: 'Notify-on-Done', icon: '🔔', color: 'emerald',
    description: 'Ping a channel every time the agent finishes its turn.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: true, label: '', trigger: { type: 'hook', hookEvent: 'Stop', matcher: '' },
        action: { type: 'notify-channel', channel: 'telegram', message: '' } },
    ],
  },
  {
    id: 'seed-lint-on-edit', isDefault: true, name: 'Lint-on-Edit', icon: '🧹', color: 'lime',
    description: 'After any Edit or Write, run the linter and feed the output back to the agent.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: false, label: 'Lint', trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: { type: 'run-command', command: 'npm', args: ['run','lint'], cwd: '', feedOutput: true } },
    ],
  },
  {
    id: 'seed-guardrail', isDefault: true, name: 'Guardrail Combo', icon: '🛡️', color: 'rose',
    description: 'Lint after every edit, and ping the channel when the agent wraps up. A multi-rule example.',
    createdAt: 1717200000000, updatedAt: 1717200000000,
    rules: [
      { id: rid(), enabled: false, label: 'Lint edits', trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: { type: 'run-command', command: 'npm', args: ['run','lint'], cwd: '', feedOutput: true } },
      { id: rid(), enabled: true, label: 'Ping on done', trigger: { type: 'hook', hookEvent: 'Stop', matcher: '' },
        action: { type: 'notify-channel', channel: 'telegram', message: '' } },
    ],
  },
];

const CUSTOM_SPELLS = [
  {
    id: 'custom-ci-guard', isDefault: false, name: 'CI Guard', icon: '⚙️', color: 'cyan',
    description: 'Keep the build honest: lint on every edit, run tests on stop, and ping me if the agent gets stuck.',
    createdAt: 1748000000000, updatedAt: 1751500000000,
    rules: [
      { id: rid(), enabled: true, label: 'Lint edits', trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: 'Edit|Write' },
        action: { type: 'run-command', command: 'npm', args: ['run','lint'], cwd: '', feedOutput: true } },
      { id: rid(), enabled: true, label: 'Test on stop', trigger: { type: 'hook', hookEvent: 'Stop', matcher: '' },
        action: { type: 'run-command', command: 'npm', args: ['test'], cwd: '', feedOutput: true } },
      { id: rid(), enabled: true, label: 'Nudge on need-input', trigger: { type: 'hook', hookEvent: 'Notification', matcher: '' },
        action: { type: 'notify-channel', channel: 'telegram', message: 'CI Guard: agent needs input' } },
    ],
  },
  {
    id: 'custom-ship-it', isDefault: false, name: 'Ship It', icon: '🚀', color: 'fuchsia',
    description: 'Autonomous finisher — keep going until done, run tests, and announce when it lands.',
    createdAt: 1749000000000, updatedAt: 1751000000000,
    rules: [
      { id: rid(), enabled: true, label: 'Drive to done', trigger: { type: 'hook', hookEvent: 'Stop', matcher: '' },
        action: { type: 'continue-loop', loopType: 'continue-until-done', maxIterations: 8 } },
      { id: rid(), enabled: false, label: 'Announce', trigger: { type: 'hook', hookEvent: 'SessionEnd', matcher: '' },
        action: { type: 'notify-channel', channel: 'slack', message: '' } },
    ],
  },
];

/* ---- Sessions (targets for casting) — mirror the shell's roster. */
const SESSIONS = [
  { id: 'sess-fluffy', name: 'fluffy-starlight', agent: 'claude',   status: 'run',  statusText: 'Reparenting the terminal node', task: 'Fix terminal reparenting crash', live: true,  ensemble: null },
  { id: 'sess-vast',   name: 'vast-neumann',     agent: 'claude',   status: 'wait', statusText: 'Needs input on model profile', task: 'Model-profile indirection layer', live: true,  ensemble: null },
  { id: 'sess-alexa',  name: 'Alexa coordinator',agent: 'codex',    status: 'run',  statusText: 'Coordinating 3 workers',      task: null, live: true,  ensemble: null },
  { id: 'sess-cosmos', name: 'concurrent-cosmos',agent: 'gemini',   status: 'idle', statusText: 'Idle',                        task: null, live: false, ensemble: null },
  { id: 'sess-zesty',  name: 'zesty-wave',       agent: 'terminal', status: 'idle', statusText: 'Stopped',                     task: null, live: false, ensemble: null },
];

/* ---- Active spells per session (runtime state). castAt ordering: oldest first. */
const ACTIVE = [
  { id: 'act-1', sessionId: 'sess-fluffy', spellId: 'custom-ci-guard', color: 'cyan', enabled: true,
    ruleIterations: {}, castAt: 1751600000000, ensembleId: null },
  { id: 'act-2', sessionId: 'sess-fluffy', spellId: 'seed-self-critic', color: 'violet', enabled: true,
    ruleIterations: {}, castAt: 1751600200000, ensembleId: null },
  { id: 'act-3', sessionId: 'sess-vast', spellId: 'custom-ship-it', color: 'fuchsia', enabled: true,
    ruleIterations: {}, castAt: 1751600300000, ensembleId: null },
  { id: 'act-4', sessionId: 'sess-alexa', spellId: 'seed-context-primer', color: 'indigo', enabled: true,
    ruleIterations: {}, castAt: 1751600100000, ensembleId: 'ens-reparent' },
];

/* Recently used spell ids (persisted locally in the real app). */
const RECENT = ['custom-ci-guard','seed-self-critic','seed-lint-on-edit','seed-notify-done'];

/* ---- Mechanism B — entities & verbs for the one-shot "Send…" surface. */
const ENTITY_TYPES = [
  { id: 'task',        icon: 'listChecks', label: 'Tasks',        verbs: ['Refer','Execute','Get details'] },
  { id: 'doc',         icon: 'doc',        label: 'Docs',         verbs: ['Review','Send'] },
  { id: 'skill',       icon: 'sparkles',   label: 'Skills',       verbs: ['Apply','Send'] },
  { id: 'team-member', icon: 'users',      label: 'Team members', verbs: ['Adopt persona','Send'] },
  { id: 'session',     icon: 'terminal',   label: 'Sessions',     verbs: ['Refer','Send'] },
  { id: 'custom-prompt',icon: 'quote',     label: 'Custom prompts',verbs: ['Send'] },
];
const ENTITIES = {
  task: [
    { id: 't1', title: 'Fix terminal reparenting crash on board close', meta: '#st1 · high' },
    { id: 't2', title: 'WebSocket pipeline — dedupe session updates', meta: '#st2 · medium' },
    { id: 't3', title: 'Add a model-profile indirection layer', meta: '#st3 · medium' },
  ],
  doc: [
    { id: 'd1', title: 'Architecture — session lifecycle', meta: 'doc · 4 min read' },
    { id: 'd2', title: 'Hook events reference', meta: 'doc · 2 min read' },
  ],
  skill: [
    { id: 'sk1', title: 'read-pdf', meta: 'skill' },
    { id: 'sk2', title: 'write-tests', meta: 'skill' },
  ],
  'team-member': [
    { id: 'tm1', title: 'Rhea — coordinator', meta: 'opus-4.8 · coordinator' },
    { id: 'tm2', title: 'Kit — worker', meta: 'sonnet · worker' },
  ],
  session: SESSIONS.map(s => ({ id: s.id, title: s.name, meta: s.agent })),
  'custom-prompt': [
    { id: 'cp1', title: 'Break down into subtasks', meta: 'custom prompt' },
    { id: 'cp2', title: 'Bug triage', meta: 'custom prompt' },
  ],
};

/* ---- Live activity feed (S8) — rule-fired events. */
const ACTIVITY = [
  { id: 'ev1', sessionId: 'sess-fluffy', spellId: 'custom-ci-guard', ruleLabel: 'Lint edits', event: 'PostToolUse', action: 'run-command', outcome: 'ok',    detail: 'npm run lint · 0 problems', at: '14:22:07' },
  { id: 'ev2', sessionId: 'sess-fluffy', spellId: 'seed-self-critic', ruleLabel: 'Refine loop', event: 'Stop', action: 'continue-loop', outcome: 'ok',    detail: 'iteration 1 of 3', at: '14:21:40' },
  { id: 'ev3', sessionId: 'sess-fluffy', spellId: 'custom-ci-guard', ruleLabel: 'Test on stop', event: 'Stop', action: 'run-command', outcome: 'error', detail: 'npm test · 2 failing — auth.spec.ts', at: '14:20:12' },
  { id: 'ev4', sessionId: 'sess-vast', spellId: 'custom-ship-it', ruleLabel: 'Drive to done', event: 'Stop', action: 'continue-loop', outcome: 'ok', detail: 'iteration 3 of 8', at: '14:18:55' },
];

Object.assign(window, {
  SPELL_COLORS, SPELL_COLOR_ORDER, HOOK_EVENTS, ACTIONS, ACTION_ORDER, CAPABILITY,
  LOOP_TYPES, TOOLS, SEED_SPELLS, CUSTOM_SPELLS, SESSIONS, ACTIVE, RECENT,
  ENTITY_TYPES, ENTITIES, ACTIVITY, rid,
});
