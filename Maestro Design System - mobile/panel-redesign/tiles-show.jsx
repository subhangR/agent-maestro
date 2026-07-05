/* tiles-show.jsx — showcase: full task tree, session spawn tree, state galleries. */

const RHEA = { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6' };
const KIT = { initial: 'K', name: 'Kit', color: '#7a5cc0', bg: '#ece4f7' };
const ADA = { initial: 'A', name: 'Ada', color: '#b06a2b', bg: '#f4e7d6' };

/* ---- task tree (one root expanded to show every attribute + its subtree) ---- */
const TASK_TREE = [
  {
    id: 't1', title: 'Fix terminal reparenting crash on board close', status: 'in_progress',
    priority: 'high', assignees: [RHEA], docs: 2, subtaskCount: 3, activity: 'working',
    model: 'opus-4.8', active: true, pinned: true, dangerous: false, worktree: true,
    due: 'Jun 12', updated: '4m ago',
    sessions: [{ kind: 'working', label: 'WORKING' }, { kind: 'needsInput', label: 'NEEDS INPUT' }],
    docList: [{ name: 'terminal-rendering-analysis.md', md: true }, { name: 'registry.ts', md: false }],
    diagrams: ['reparent-flow'],
    children: [
      { id: 't1a', title: 'Audit where terminals get reparented', status: 'completed', priority: 'medium', assignees: [KIT], updated: '1h ago' },
      {
        id: 't1b', title: 'Make board reparent via registry ref', status: 'in_progress', priority: 'high',
        assignees: [RHEA], activity: 'working', subtaskCount: 2, updated: '4m ago',
        children: [
          { id: 't1b1', title: 'Thread registry ref to MultiProjectSessionsView', status: 'todo', priority: 'medium' },
          { id: 't1b2', title: 're-run fit.fit() after the move', status: 'todo', priority: 'low' },
        ],
      },
      { id: 't1c', title: 'Add regression test for connection loss', status: 'blocked', priority: 'medium', assignees: [ADA], updated: '20m ago' },
    ],
  },
  { id: 't2', title: 'Add a model-profile indirection layer', status: 'todo', priority: 'medium', assignees: [RHEA, KIT], docs: 1, subtaskCount: 2, model: 'default', updated: '2h ago' },
  { id: 't3', title: 'Verify Opus 1M spawns with 1M context window', status: 'in_review', priority: 'low', model: 'opus[1m]', updated: '5h ago' },
  { id: 't4', title: 'Migrate task ordering to server persistence', status: 'cancelled', priority: 'medium', updated: '1d ago' },
];

/* ---- session spawn tree (coordinator → workers) inside a team group ---- */
const COORD = {
  id: 's1', title: 'Rhea', agent: 'claude', avatars: [RHEA], status: 'working', live: true,
  mode: 'Coordinator', model: 'opus-4.8', childCount: 3,
  tasklines: [{ status: 'in_progress', title: 'Fix terminal reparenting crash on board close' }],
  children: [
    { id: 's1a', title: 'fluffy-starlight', agent: 'claude', status: 'working', live: true, tasklines: [{ status: 'in_progress', title: 'Make board reparent via registry ref' }] },
    { id: 's1b', title: 'vast-neumann', agent: 'claude', status: 'working', live: true, needsInput: true, tasklines: [{ status: 'todo', title: 'Add a model-profile indirection layer' }] },
    { id: 's1c', title: 'Alexa coordinator', agent: 'codex', status: 'working', live: true, worktree: 'feat/voice', docs: 1 },
  ],
};

const SESS_OTHERS = [
  {
    id: 's2', title: 'concurrent-cosmos', agent: 'gemini', status: 'idle', live: false, humanDone: false,
    mode: 'Worker', model: 'gemini-2.5-pro', strategy: 'parallel', worktree: 'exp/cosmos', docs: 2,
    elapsed: '23m', taskchips: [{ status: 'completed', title: 'Summarize WebSocket pipeline' }, { status: 'todo', title: 'Draft fix plan' }],
    docList: [{ name: 'pipeline-notes.md', md: true }, { name: 'patch.diff', md: false }],
  },
  { id: 's3', title: 'zesty-wave', agent: 'terminal', status: 'stopped', live: false, humanDone: true },
  { id: 's4', title: 'sleepy-redo', agent: 'claude', status: 'stopped', live: false, archived: true },
];

/* ---- galleries ---- */
const TASK_STATES = ['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled', 'archived'];
const SESS_STATES = [
  { k: 'spawning', live: true }, { k: 'working', live: true }, { k: 'needsInput', live: true },
  { k: 'idle', live: true }, { k: 'completed', live: false, done: true }, { k: 'failed', live: false }, { k: 'stopped', live: false },
];

function Frame({ icon, title, sub, children }) {
  return (
    <div className="pn-showcol">
      {sub && <div className="pn-showsub">{sub}</div>}
      <div className="pn-showframe">
        <div className="pn-showframe__hd"><Icon name={icon} size={15} style={{ color: 'var(--pn-ink-3)' }} /><span className="pn-eyebrow">{title}</span></div>
        {children}
      </div>
    </div>
  );
}

function Show() {
  return (
    <div className="pn-showstage">
      <div style={{ maxWidth: 820, marginBottom: 22 }}>
        <div className="pn-showcap" style={{ marginBottom: 8 }}>Maestro · tiles + trees</div>
        <div className="pn-showsub" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Task &amp; session tiles with every attribute, and the nesting that matters most —
          subtask trees and coordinator→worker spawn chains. Status reads through drawn glyphs,
          words and dots; team identity is a ring/dot, never a colored bar.
        </div>
      </div>

      <div className="pn-showrow">
        <Frame icon="listChecks" title="Task tree" sub="Parent → subtasks (2 levels). Top task expanded to show full meta.">
          {TASK_TREE.map((n) => <TaskNode key={n.id} node={n} expandedId="t1" />)}
        </Frame>

        <Frame icon="terminal" title="Session spawn tree" sub="Coordinator spawns workers, grouped as a team. One worker needs input; one session expanded.">
          <div className="pn-team">
            <div className="pn-team__head"><span className="pn-team__dot" style={{ background: '#2f8f7f' }}></span><span className="pn-team__name">Reparent strike team</span><span className="pn-team__count">4 sessions</span></div>
            <SessionNode node={COORD} expandedId="" />
          </div>
          {SESS_OTHERS.map((n) => <SessionNode key={n.id} node={n} expandedId="s2" />)}
        </Frame>

        <div className="pn-showcol">
          <Frame icon="grid" title="Task states">
            {TASK_STATES.map((st) => <TaskTile key={st} t={{ id: st, title: TASK_LABELfor(st), status: st, priority: st === 'blocked' ? 'high' : 'medium' }} />)}
          </Frame>
          <Frame icon="grid" title="Session states">
            {SESS_STATES.map((s) => <SessionTile key={s.k} s={{ id: s.k, title: SESS_LABELfor(s), agent: 'claude', status: s.k === 'needsInput' ? 'working' : s.k, needsInput: s.k === 'needsInput', live: s.live, humanDone: s.done }} />)}
          </Frame>
        </div>
      </div>
    </div>
  );
}

function TASK_LABELfor(st) {
  const m = { todo: 'Todo task', in_progress: 'Working on it now', in_review: 'Up for review', blocked: 'Blocked on dependency', completed: 'Finished and shipped', cancelled: 'Cancelled — out of scope', archived: 'Archived task' };
  return m[st];
}
function SESS_LABELfor(s) {
  const m = { spawning: 'Spawning…', working: 'Working session', needsInput: 'Needs your input', idle: 'Idle session', completed: 'Done session', failed: 'Failed session', stopped: 'Exited session' };
  return m[s.k];
}

ReactDOM.createRoot(document.getElementById('root')).render(<Show />);
