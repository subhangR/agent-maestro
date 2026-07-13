/* m-data.jsx — content for the mobile app. Adapted from the desktop shell tree.
   Voice: plain, developer-to-developer; agent progress written as the agent speaks.
   Enriched with the detail fields the desktop tiles carry (model, mode, worktree,
   strategy, elapsed, linked tasks, docs) + nested subtask / spawn-chain trees. */

const MEMBERS = {
  rhea: { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6', role: 'Coordinator', model: 'opus-4.8' },
  kit:  { initial: 'K', name: 'Kit',  color: '#7a5cc0', bg: '#ece4f7', role: 'Worker', model: 'sonnet-4.5' },
  ada:  { initial: 'A', name: 'Ada',  color: '#b06a2b', bg: '#f4e7d6', role: 'Worker', model: 'sonnet-4.5' },
  milo: { initial: 'M', name: 'Milo', color: '#3f6c90', bg: '#dde8f1', role: 'Worker', model: 'haiku-4' },
};

const MEMBER_LIST = [
  { ...MEMBERS.rhea, status: 'working', say: 'Coordinating the reparent strike team', sessions: 1, tasks: 2,
    mode: 'Coordinator', tool: 'claude', scope: 'project', perms: 'acceptEdits', instrument: 'violin',
    identity: 'You lead the terminal-reparenting fix. You read the rendering pipeline carefully, prefer the registry ref over DOM moves, and always re-run fit.fit() after a reparent. Hand off tests to @Ada.',
    skills: ['debugging', 'code-review'], caps: { spawn: true, edit: true, rTask: true, rSession: true } },
  { ...MEMBERS.kit,  status: 'working', say: 'Threading the registry ref through the view', sessions: 1, tasks: 3,
    mode: 'Worker', tool: 'claude', scope: 'project', perms: 'acceptEdits', instrument: 'guitar',
    identity: 'You thread state through React views without breaking ownership. Small, surgical diffs.',
    skills: ['write-tests'], caps: { spawn: false, edit: true, rTask: true, rSession: false } },
  { ...MEMBERS.ada,  status: 'idle', say: 'Blocked on connection-loss regression test', sessions: 0, tasks: 1,
    mode: 'Worker', tool: 'codex', scope: 'project', perms: 'interactive', instrument: 'piano',
    identity: 'You write the regression tests others skip. You reproduce the bug first, then fix.',
    skills: ['write-tests', 'debugging'], caps: { spawn: false, edit: true, rTask: true, rSession: false } },
  { ...MEMBERS.milo, status: 'idle', say: 'No active session', sessions: 0, tasks: 0,
    mode: 'Worker', tool: 'gemini', scope: 'global', perms: 'readOnly', instrument: 'trumpet',
    identity: 'You review for performance regressions and flag anything that touches the hot path.',
    skills: [], caps: { spawn: false, edit: false, rTask: false, rSession: false } },
];

/* ---------- tasks ---------- (subs may themselves carry subs → multi-level tree) */
const TASKS_IN_PROGRESS = [
  {
    id: 'a3f9', title: 'Fix terminal reparenting crash on board close',
    status: 'in_progress', priority: 'high', assignees: [MEMBERS.rhea], docs: 2, active: true, pinned: true,
    activity: 'working', model: 'opus-4.8', due: 'Jun 12', updated: '2m ago', worktree: true, danger: false,
    sessions: [{ kind: 'working', label: 'fluffy-starlight' }, { kind: 'needsInput', label: 'vast-neumann' }],
    docList: [{ id: 'd-tra', name: 'terminal-rendering-analysis.md', md: true }, { id: 'd-reparent', name: 'reparent-plan.md', md: true }],
    diagrams: [{ id: 'g-reparent', name: 'reparent-flow' }],
    subs: [
      { id: 'b7c2', title: 'Audit where terminals get reparented', status: 'completed', priority: 'medium' },
      { id: 'c1d8', title: 'Make board reparent via registry ref', status: 'in_progress', priority: 'high', assignees: [MEMBERS.kit], activity: 'working',
        subs: [
          { id: 'c1d8a', title: 'Add registry.get(session.id) lookup', status: 'completed' },
          { id: 'c1d8b', title: 'Swap DOM move for ref reparent', status: 'in_progress' },
        ] },
      { id: 'd4e1', title: 'Thread registry ref to MultiProjectSessionsView', status: 'todo', priority: 'medium' },
      { id: 'e5f7', title: 're-run fit.fit() after the move', status: 'todo', priority: 'low' },
      { id: 'f8a2', title: 'Add regression test for connection loss', status: 'blocked', priority: 'high', assignees: [MEMBERS.ada] },
    ],
  },
  {
    id: 'g2b5', title: 'WebSocket pipeline — dedupe session updates',
    status: 'in_progress', priority: 'medium', assignees: [MEMBERS.kit], activity: 'needsInput',
    model: 'sonnet-4.5', updated: '14m ago', worktree: false,
    docList: [{ id: 'd-socket', name: 'socket-dedupe.md', md: true }],
    diagrams: [{ id: 'g-socket', name: 'socket-dedupe' }],
  },
];
const TASKS_UP_NEXT = [
  { id: 'h6c9', title: 'Add a model-profile indirection layer', status: 'todo', priority: 'medium', assignees: [MEMBERS.rhea, MEMBERS.kit], docs: 2,
    model: 'default', updated: '1h ago',
    docList: [{ id: 'd-model', name: 'model-profile.md', md: true }],
    diagrams: [{ id: 'g-model', name: 'model-profile' }],
    subs: [
      { id: 'i1d3', title: 'Define the profile schema', status: 'todo' },
      { id: 'j7e4', title: 'Wire spawn to resolve profile → model', status: 'todo' },
    ] },
  { id: 'k3f8', title: 'Verify Opus 1M spawns with 1M context window', status: 'in_review', priority: 'low', model: 'opus[1m]', updated: '3h ago' },
  { id: 'l9a1', title: 'Migrate task ordering to server persistence', status: 'blocked', priority: 'medium', assignees: [MEMBERS.ada], updated: 'yesterday' },
];
const TASKS_DONE = [
  { id: 'm2b7', title: 'Stream agent progress over the socket', status: 'completed', priority: 'high', assignees: [MEMBERS.rhea], updated: 'Jun 9' },
  { id: 'n4c2', title: 'Persist sessions as JSON on disk', status: 'completed', priority: 'medium', assignees: [MEMBERS.kit], updated: 'Jun 8' },
  { id: 'o8d5', title: 'Add the command palette', status: 'completed', priority: 'low', updated: 'Jun 6' },
];

/* ---------- sessions ---------- (children = spawn-chain; arbitrarily deep) */
const TEAM = {
  name: 'Reparent strike team', dot: '#2f8f7f', count: 4,
  coord: {
    id: 's-rhea', kind: 'claude', name: 'Rhea · coordinator', status: 'run', statusText: 'Coordinating', live: true,
    say: 'Delegated 2 subtasks to the workers, watching the test run',
    mode: 'Coordinator', model: 'opus-4.8', strategy: 'parallel', elapsed: '12m', humanDone: false,
    tasklines: [{ status: 'in_progress', title: 'Fix terminal reparenting crash' }],
    taskchips: [{ status: 'in_progress', title: 'Reparent crash' }, { status: 'blocked', title: 'Connection-loss test' }],
    docList: [{ id: 'd-strike', name: 'strike-plan.md', md: true }],
    children: [
      { id: 's-fluffy', kind: 'claude', name: 'fluffy-starlight', status: 'run', statusText: 'Running', live: true, active: true,
        say: 'Reparenting the terminal node, then re-running the fit', ctx: 24,
        mode: 'Worker', model: 'opus-4.8', worktree: 'fix/terminal-reparent', elapsed: '4m 12s', docs: 2,
        tasklines: [{ status: 'in_progress', title: 'Make board reparent via registry ref' }],
        taskchips: [{ status: 'in_progress', title: 'Registry ref reparent' }],
        docList: [{ id: 'd-reparent', name: 'reparent-plan.md', md: true }], diagrams: [{ id: 'g-reparent', name: 'reparent-flow' }] },
      { id: 's-vast', kind: 'claude', name: 'vast-neumann', status: 'wait', statusText: 'Needs input', live: true, wait: true, needsInput: true,
        say: 'Which model profile should the fallback layer default to?',
        mode: 'Worker', model: 'sonnet-4.5', worktree: 'feat/model-profile', elapsed: '7m',
        tasklines: [{ status: 'blocked', title: 'Model-profile indirection layer' }] },
      { id: 's-alexa', kind: 'codex', name: 'Alexa coordinator', status: 'run', statusText: 'Running', live: true,
        say: 'Spawned 2 workers on the voice pipeline',
        mode: 'Coordinator', model: 'codex-1', strategy: 'sequential', elapsed: '21m',
        children: [
          { id: 's-quiet', kind: 'codex', name: 'quiet-meadow', status: 'run', statusText: 'Running', live: true,
            say: 'Wiring the wake-word endpoint', mode: 'Worker', model: 'codex-1', elapsed: '6m' },
          { id: 's-brave', kind: 'codex', name: 'brave-summit', status: 'idle', statusText: 'Idle · waiting on lock', live: false,
            say: 'Holding for the shared audio-buffer lock', mode: 'Worker', model: 'codex-1', elapsed: '2m' },
        ] },
    ],
  },
};
const SESSIONS_IDLE = [
  { id: 's-cosmos', kind: 'gemini', name: 'concurrent-cosmos', status: 'idle', statusText: 'Idle · exited clean', live: false,
    mode: 'Worker', model: 'gemini-2.5-pro', elapsed: '—' },
  { id: 's-zesty', kind: 'terminal', name: 'zesty-wave', status: 'stopped', statusText: 'Stopped · marked done', live: false, exited: true, humanDone: true,
    mode: 'Worker', model: 'zsh', elapsed: '—' },
];

/* dropdown option sets (translated from the desktop tiles) */
const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked', 'archived'];
const TASK_STATUS_LABEL = { todo: 'Todo', in_progress: 'In progress', in_review: 'In review', completed: 'Completed', cancelled: 'Cancelled', blocked: 'Blocked', archived: 'Archived' };
const SESS_STATUS_LABEL = { spawning: 'Spawning', idle: 'Idle', working: 'Working', run: 'Running', wait: 'Needs input', completed: 'Done', failed: 'Failed', stopped: 'Stopped' };
const PRIORITIES = ['high', 'medium', 'low'];
const MODELS = ['default', 'opus-4.8', 'sonnet-4.5', 'opus[1m]', 'gemini-2.5-pro', 'codex-1'];
const MODES = ['Worker', 'Coordinator', 'Co-Worker', 'Co-Coordinator'];
const ALL_MEMBERS = [MEMBERS.rhea, MEMBERS.kit, MEMBERS.ada, MEMBERS.milo];

/* ---------- active session terminal transcript (fluffy-starlight) ---------- */
const ACTIVE = {
  name: 'fluffy-starlight', model: 'claude · opus-4.8', branch: 'fix/terminal-reparent',
  ctxTokens: '48.2k', ctxMax: '200k', ctxPct: 24, cache: 92, out: '12.4k', turns: 8, tools: 23, duration: '4m 12s',
};

/* ==========================================================================
   DOCS & DIAGRAMS — the real model from agent-maestro.
   A doc is either kind:'markdown' (rendered in the DocViewer) or kind:'diagram'
   (an Excalidraw scene opened full-screen on the board). Both carry:
   id · title · filePath · kind · addedAt · addedBy · sessionName? · taskId?.
   Diagram scenes use a compact node/edge/note format rendered with rough.js.
   ========================================================================== */
const NOW = Date.now();
const ago = (m) => NOW - m * 60000;

/* ---- diagram scenes (excalidraw-style) ---- */
const SCENE_REPARENT = {
  w: 700, h: 752,
  nodes: [
    { id: 'A', x: 268, y: 24, w: 164, h: 60, label: 'Board closes', shape: 'rect' },
    { id: 'B', x: 252, y: 120, w: 196, h: 118, label: 'who owns the\nterminal node?', shape: 'diamond' },
    { id: 'C', x: 36, y: 300, w: 210, h: 82, label: 'Board moves\n[data-terminal-id]', shape: 'rect', fill: 'blue' },
    { id: 'D', x: 454, y: 300, w: 210, h: 82, label: 'TeamView moves\nterm.element', shape: 'rect', fill: 'blue' },
    { id: 'E', x: 246, y: 452, w: 208, h: 82, label: 'reparent via\nregistry ref', shape: 'rect', fill: 'green' },
    { id: 'F', x: 255, y: 580, w: 190, h: 70, label: 'ref.reparent(node)', shape: 'rect', fill: 'green' },
    { id: 'G', x: 258, y: 668, w: 184, h: 62, label: 're-run fit.fit()', shape: 'rect', fill: 'yellow' },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C', label: 'on close' },
    { from: 'B', to: 'D', label: 'on close' },
    { from: 'C', to: 'E', label: 'replace', dashed: true },
    { from: 'D', to: 'E', label: 'replace', dashed: true },
    { from: 'E', to: 'F' },
    { from: 'F', to: 'G' },
  ],
  notes: [
    { x: 296, y: 398, text: '✗ they disagree\n→ blank terminal', color: 'red' },
    { x: 470, y: 686, text: '✓ survives', color: 'green' },
  ],
};
const SCENE_MODEL = {
  w: 640, h: 520,
  nodes: [
    { id: 'A', x: 240, y: 24, w: 160, h: 58, label: 'task spawn', shape: 'rect' },
    { id: 'B', x: 224, y: 118, w: 192, h: 74, label: 'profile\n(frontend-dev)', shape: 'rect', fill: 'blue' },
    { id: 'C', x: 235, y: 228, w: 170, h: 112, label: 'profile names\na model?', shape: 'diamond' },
    { id: 'D', x: 66, y: 404, w: 168, h: 72, label: 'use model\nopus-4.8', shape: 'rect', fill: 'green' },
    { id: 'E', x: 404, y: 404, w: 178, h: 72, label: 'default\nsonnet-4.5', shape: 'rect', fill: 'yellow' },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C' },
    { from: 'C', to: 'D', label: 'yes' },
    { from: 'C', to: 'E', label: 'no', dashed: true },
  ],
  notes: [{ x: 426, y: 348, text: '? which default —\nopen question', color: 'red' }],
};
const SCENE_SOCKET = {
  w: 640, h: 560,
  nodes: [
    { id: 'A', x: 232, y: 24, w: 176, h: 70, label: 'session.update\ninbound', shape: 'rect' },
    { id: 'B', x: 235, y: 128, w: 170, h: 110, label: 'id seen\nbefore?', shape: 'diamond' },
    { id: 'C', x: 54, y: 300, w: 152, h: 64, label: 'drop\nduplicate', shape: 'rect', fill: 'red' },
    { id: 'D', x: 412, y: 300, w: 176, h: 66, label: 'apply update', shape: 'rect', fill: 'green' },
    { id: 'E', x: 222, y: 430, w: 196, h: 78, label: 'dedupe cache\nLRU · last 200', shape: 'rect', fill: 'blue' },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C', label: 'yes' },
    { from: 'B', to: 'D', label: 'no' },
    { from: 'D', to: 'E', label: 'record id' },
    { from: 'E', to: 'B', dashed: true, label: 'lookup' },
  ],
  notes: [{ x: 432, y: 58, text: '↺ replays on\nreconnect', color: 'amber' }],
};

/* ---- markdown bodies ---- */
const MD_TRA = `# Terminal reparenting — analysis

When the board closes, the live terminal goes blank. Two code paths move the
same DOM node and disagree on **who owns it**.

## What's happening

- The **board** reparents \`[data-terminal-id]\` — the React-owned container.
- **TeamView** moves \`term.element\` — the xterm node itself.

Both fire on close. The second move lands on a node the first already detached,
so xterm loses its canvas and \`fit()\` runs against a zero-size box.

> Repro: open two sessions, tile them on the board, close the board. The focused
> terminal renders one blank frame, then throws on the next \`fit()\`.

The flow, drawn out:

\`\`\`excalidraw
g-reparent
\`\`\`

## Root cause

\`registry.current.get(session.id)\` already holds the canonical node. The board
should reparent **through the registry ref**, not by querying the DOM for
\`[data-terminal-id]\`.

## Fix in one line

Reparent via the ref, then re-run \`fit.fit()\` once after the move — see
\`reparent-plan.md\`.`;

const MD_REPARENT = `# Reparent plan

Surgical change. Touch only the reparent path.

## Steps

1. In \`MultiProjectSessionsView\`, look up the node with
   \`registry.current.get(session.id)?.term.element\`.
2. Reparent **that** node instead of the \`[data-terminal-id]\` container.
3. Drop the DOM query in the board's close handler.
4. Re-run \`fit.fit()\` once, after the move settles.

## Out of scope

- Don't touch TeamView's own reparent — it's correct.
- No changes to the registry shape.

## Validation

- [x] Two sessions, tile, close board — terminal survives.
- [x] Resize after reparent — no zero-size fit.
- [ ] Connection-loss regression test (owned by @Ada).`;

const MD_SOCKET = `# Socket dedupe

The session stream replays updates on reconnect, so the same \`session.update\`
lands two or three times. The UI flickers and counters double-count.

## Approach

Keep a small **LRU cache** of the last 200 update ids. On each inbound message,
check the cache before applying.

- Seen it? Drop it.
- New? Apply, then record the id.

The cache is keyed by \`update.id\`, not by session — ids are globally unique.`;

const MD_STRIKE = `# Strike plan — reparent

Coordinating three workers on the terminal-reparent fix.

## Assignments

- **Kit** — thread the registry ref through \`MultiProjectSessionsView\`.
- **Ada** — write the connection-loss regression test.
- **Rhea** — review the diff, keep it surgical.

## Strategy

Parallel. Kit and Ada work isolated worktrees; merge behind the test.`;

const MD_MODEL = `# Model-profile indirection

Spawn currently hard-codes a model per task. We want a **profile** layer in
between, so a persona resolves to a model at spawn time.

## Open question

Two profiles can resolve to the same model. **Which model is the default** when
a profile doesn't name one? \`sonnet-4.5\` is the safe pick — cheap, fast, good
enough for most workers.`;

const DOCS = [
  { id: 'd-tra', kind: 'markdown', title: 'Terminal rendering analysis', filePath: 'docs/terminal-rendering-analysis.md', addedAt: ago(2), addedBy: 'Rhea', sessionName: 'fluffy-starlight', taskId: 'a3f9', content: MD_TRA },
  { id: 'd-reparent', kind: 'markdown', title: 'Reparent plan', filePath: 'docs/reparent-plan.md', addedAt: ago(6), addedBy: 'Kit', sessionName: 'fluffy-starlight', taskId: 'a3f9', content: MD_REPARENT },
  { id: 'd-socket', kind: 'markdown', title: 'Socket dedupe', filePath: 'docs/socket-dedupe.md', addedAt: ago(48), addedBy: 'Kit', taskId: 'g2b5', content: MD_SOCKET },
  { id: 'd-strike', kind: 'markdown', title: 'Strike plan', filePath: 'docs/strike-plan.md', addedAt: ago(74), addedBy: 'Rhea', sessionName: 'Rhea · coordinator', content: MD_STRIKE },
  { id: 'd-model', kind: 'markdown', title: 'Model-profile indirection', filePath: 'docs/model-profile.md', addedAt: ago(190), addedBy: 'Rhea', taskId: 'h6c9', content: MD_MODEL },
  { id: 'g-reparent', kind: 'diagram', title: 'Reparent flow', filePath: 'diagrams/reparent-flow.excalidraw', addedAt: ago(4), addedBy: 'Rhea', sessionName: 'fluffy-starlight', taskId: 'a3f9', scene: SCENE_REPARENT },
  { id: 'g-socket', kind: 'diagram', title: 'Socket dedupe flow', filePath: 'diagrams/socket-dedupe.excalidraw', addedAt: ago(52), addedBy: 'Kit', taskId: 'g2b5', scene: SCENE_SOCKET },
  { id: 'g-model', kind: 'diagram', title: 'Model-profile resolution', filePath: 'diagrams/model-profile.excalidraw', addedAt: ago(196), addedBy: 'Rhea', taskId: 'h6c9', scene: SCENE_MODEL },
];
const DOCS_BY_ID = {};
DOCS.forEach((d) => { DOCS_BY_ID[d.id] = d; });

/* resolve a doc from a pill ref ({id} | {name} | id-string) */
function resolveDoc(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return DOCS_BY_ID[ref] || DOCS.find((d) => d.title === ref) || null;
  if (ref.id && DOCS_BY_ID[ref.id]) return DOCS_BY_ID[ref.id];
  if (ref.kind === 'diagram' || ref.kind === 'markdown') return ref;
  if (ref.name) {
    const base = ref.name.replace(/\.(md|markdown|excalidraw)$/, '');
    return DOCS.find((d) => d.filePath.includes(base) || d.title === ref.name) || null;
  }
  return null;
}
function isDiagramDoc(d) {
  return !!d && (d.kind === 'diagram' || /\.excalidraw$/.test(d.filePath || '') || !!d.scene);
}

Object.assign(window, {
  MEMBERS, MEMBER_LIST,
  TASKS_IN_PROGRESS, TASKS_UP_NEXT, TASKS_DONE,
  TEAM, SESSIONS_IDLE, ACTIVE,
  TASK_STATUSES, TASK_STATUS_LABEL, SESS_STATUS_LABEL, PRIORITIES, MODELS, MODES, ALL_MEMBERS,
  DOCS, DOCS_BY_ID, resolveDoc, isDiagramDoc,
});
