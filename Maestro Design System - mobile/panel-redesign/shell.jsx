/* shell.jsx — the full app shell in context, reskinned in the new theme.
   Structure is faithful to the real app:
   [top bar] · [icon rail | Maestro panel | terminal | Spaces panel | spaces rail] */

/* ---------- left: task row (Ledger style, no color left-bar) ---------- */
function TRow({ status, title, prio, id, subs, assignee, live }) {
  const dc = { run: 'pn-dot--run', wait: 'pn-dot--wait', todo: 'pn-dot--idle', block: 'pn-dot--block' }[status] || 'pn-dot--idle';
  return (
    <div className="pn-row">
      <div className="pn-row__lead"><span className="pn-dot-wrap"><span className={'pn-dot ' + dc + (live ? ' pn-dot--live' : '')}></span></span></div>
      <div className="pn-row__body">
        <div className="pn-row__title">{title}</div>
        <div className="pn-row__sub">
          {prio && <span className={'pn-tag pn-tag--' + prio}>{prio}</span>}
          <span className="pn-meta">#{id}{subs ? ` · ${subs} subtasks` : ''}</span>
        </div>
      </div>
      <div className="pn-row__trail">
        {assignee && <AgentTile kind={assignee} />}
        <button className="pn-row__run" title="Run"><Icon name="play" /></button>
      </div>
    </div>
  );
}

/* ---------- right: session row ---------- */
function SRow({ kind, name, status, statusText, elapsed, tasks, live, active, wait }) {
  return (
    <div className={'pn-sess' + (active ? ' pn-sess--active' : '') + (wait ? ' pn-sess--wait' : '')}>
      <AgentTile kind={kind} lg />
      <div className="pn-sess__body">
        <div className="pn-sess__name">{name}</div>
        <div className="pn-sess__status">
          <span className="pn-dot-wrap"><span className={'pn-dot pn-dot--' + status + (live ? ' pn-dot--live' : '')}></span></span>
          <span className={'pn-sess__statustext' + (status === 'wait' ? ' pn-sess__statustext--wait' : status === 'run' ? ' pn-sess__statustext--run' : '')}>{statusText}</span>
          {elapsed && <span className="pn-meta">· {elapsed}</span>}
        </div>
      </div>
      <div className="pn-sess__trail">
        {tasks && <span className="pn-chip">{tasks}</span>}
        <button className="pn-ib" style={{ width: 24, height: 24 }}><Icon name="more" /></button>
      </div>
    </div>
  );
}

/* ---------- shell tree data ---------- */
const RHEA_S = { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6' };
const KIT_S = { initial: 'K', name: 'Kit', color: '#7a5cc0', bg: '#ece4f7' };
const ADA_S = { initial: 'A', name: 'Ada', color: '#b06a2b', bg: '#f4e7d6' };

const SHELL_TASK_TREE = [
  {
    id: 'st1', title: 'Fix terminal reparenting crash on board close', status: 'in_progress',
    priority: 'high', assignees: [RHEA_S], docs: 2, subtaskCount: 3, activity: 'working', active: true, pinned: true,
    children: [
      { id: 'st1a', title: 'Audit where terminals get reparented', status: 'completed', priority: 'medium', assignees: [KIT_S] },
      {
        id: 'st1b', title: 'Make board reparent via registry ref', status: 'in_progress', priority: 'high', assignees: [RHEA_S], subtaskCount: 2,
        children: [
          { id: 'st1b1', title: 'Thread registry ref to MultiProjectSessionsView', status: 'todo', priority: 'medium' },
          { id: 'st1b2', title: 're-run fit.fit() after the move', status: 'todo', priority: 'low' },
        ],
      },
      { id: 'st1c', title: 'Add regression test for connection loss', status: 'blocked', priority: 'medium', assignees: [ADA_S] },
    ],
  },
  { id: 'st2', title: 'WebSocket pipeline — dedupe session updates', status: 'in_progress', priority: 'medium', assignees: [KIT_S], activity: 'needsInput' },
];
const SHELL_TASK_NEXT = [
  { id: 'st3', title: 'Add a model-profile indirection layer', status: 'todo', priority: 'medium', assignees: [RHEA_S, KIT_S], docs: 1, subtaskCount: 2 },
  { id: 'st4', title: 'Verify Opus 1M spawns with 1M context window', status: 'in_review', priority: 'low' },
  { id: 'st5', title: 'Migrate task ordering to server persistence', status: 'blocked', priority: 'medium', assignees: [ADA_S] },
];

const SHELL_COORD = {
  id: 'ss1', title: 'Rhea · coordinator', agent: 'claude', status: 'working', live: true, childCount: 3,
  tasklines: [{ status: 'in_progress', title: 'Fix terminal reparenting crash' }],
  children: [
    { id: 'ss1a', title: 'fluffy-starlight', agent: 'claude', status: 'working', live: true, tasklines: [{ status: 'in_progress', title: 'Make board reparent via registry ref' }] },
    { id: 'ss1b', title: 'vast-neumann', agent: 'claude', status: 'working', live: true, needsInput: true, tasklines: [{ status: 'todo', title: 'Model-profile indirection layer' }] },
    { id: 'ss1c', title: 'Alexa coordinator', agent: 'codex', status: 'working', live: true },
  ],
};
const SHELL_SESS_IDLE = [
  { id: 'ss2', title: 'concurrent-cosmos', agent: 'gemini', status: 'idle', live: false },
  { id: 'ss3', title: 'zesty-wave', agent: 'terminal', status: 'stopped', live: false, humanDone: true },
];

/* ---------- icon rail (far left) ---------- */
const RAIL = [
  ['tasks', 'listChecks', 'Tasks', 6],
  ['members', 'users', 'Members', 4],
  ['teams', 'team', 'Teams', null],
  ['skills', 'sparkles', 'Skills', null],
  ['lists', 'inbox', 'Lists', 2],
  ['graphs', 'graph', 'Graphs', null],
  ['files', 'folder', 'Files', null],
];
function IconRail() {
  return (
    <div className="pn-rail">
      <span className="pn-rail-mark"><Mark size={24} /></span>
      {RAIL.map(([id, icon, label, badge]) => (
        <button key={id} className={'pn-rail-btn' + (id === 'tasks' ? ' pn-rail-btn--active' : '')} title={label}>
          <Icon name={icon} sw={1.55} />
          {badge ? <span className="pn-rail-badge">{badge}</span> : null}
        </button>
      ))}
      <span className="pn-rail-spacer"></span>
      <button className="pn-rail-btn" title="Whiteboard"><Icon name="pen" sw={1.55} /></button>
      <button className="pn-rail-btn" title="Settings"><Icon name="settings" sw={1.55} /></button>
    </div>
  );
}

/* ---------- Maestro panel (left content) ---------- */
function MaestroPanel() {
  return (
    <div className="pn-mp">
      <div className="pn-head">
        <span className="pn-proj">agent-maestro <Icon name="chevronD" size={13} /></span>
        <span className="pn-head-spacer"></span>
        <button className="pn-ib" title="Standup"><Icon name="more" /></button>
      </div>

      <div className="pn-subbar">
        <button className="pn-btn pn-btn--primary" style={{ height: 30 }}><Icon name="plus" size={14} /> New task</button>
        <span className="pn-head-spacer"></span>
        <button className="pn-subtab pn-subtab--active" title="Current"><Icon name="listChecks" /> 6</button>
        <button className="pn-subtab" title="Pinned"><Icon name="pin" /> 1</button>
        <button className="pn-subtab" title="Completed"><Icon name="check" /> 8</button>
        <button className="pn-subtab" title="Archived"><Icon name="archive" /></button>
      </div>

      <div className="pn-search">
        <Icon name="search" />
        <input placeholder="Search tasks" />
        <span className="pn-kbd">⌘K</span>
      </div>
      <div className="pn-filters">
        <button className="pn-filter pn-filter--active">All</button>
        <button className="pn-filter">High</button>
        <button className="pn-filter">Mine</button>
        <button className="pn-filter" style={{ marginLeft: 'auto' }}><Icon name="sliders" size={13} /> Sort</button>
      </div>

      <div className="pn-scroll">
        <div className="pn-sec-head"><span className="pn-eyebrow">In progress <span className="pn-count">· 2</span></span><span className="pn-line"></span></div>
        {SHELL_TASK_TREE.map((n) => <TaskNode key={n.id} node={n} expandedId="" />)}
        <div className="pn-sec-head"><span className="pn-eyebrow">Up next <span className="pn-count">· 3</span></span><span className="pn-line"></span></div>
        {SHELL_TASK_NEXT.map((n) => <TaskNode key={n.id} node={n} expandedId="" />)}
      </div>
      <div className="pn-fade"></div>
    </div>
  );
}

/* ---------- terminal (center, stays dark) ---------- */
function Terminal() {
  return (
    <div className="pn-term">
      <div className="pn-term-bar">
        <span className="pn-tdot"></span>
        <b>fluffy-starlight</b>
        <span className="pn-tslash">·</span>
        <span>claude · opus-4.8</span>
        <span style={{ marginLeft: 'auto', color: '#6a6457' }}>fix/terminal-reparent</span>
      </div>
      <div className="pn-term-body">
        <div><span className="l-prompt">›</span> Analyzing terminal reparenting in <span className="l-file">AppWorkspace.tsx</span></div>
        <div className="l-dim">&nbsp;&nbsp;Read SessionTerminal.tsx · MultiProjectSessionsView.tsx</div>
        <div style={{ marginTop: 10 }}><span className="l-acc">●</span> The board moves <span className="l-file">[data-terminal-id]</span> — the React-owned</div>
        <div className="l-dim">&nbsp;&nbsp;container — while TeamView moves <span className="l-file">term.element</span>. They disagree.</div>
        <div style={{ marginTop: 10 }}><span className="l-acc">●</span> Editing <span className="l-file">MultiProjectSessionsView.tsx</span></div>
        <div className="l-ok">&nbsp;&nbsp;+ reparent registry.current.get(session.id)?.term.element</div>
        <div className="l-ok">&nbsp;&nbsp;+ re-run fit.fit() after the move</div>
        <div style={{ marginTop: 10 }}><span className="l-ok">✓</span> <span className="l-dim">Integration tests — 14 of 18 passing</span></div>
        <div style={{ marginTop: 10 }}><span className="l-prompt">›</span> Reparenting the terminal node, then I'll re-run the fit<span className="pn-tcursor"></span></div>
      </div>
      <TerminalStrip />
    </div>
  );
}

/* ---------- Spaces panel (right content) ---------- */
function SpacesPanel() {
  return (
    <div className="pn-sp">
      <div className="pn-tabs" style={{ paddingTop: 0 }}>
        <button className="pn-tab pn-tab--active" style={{ paddingTop: 14 }}>Sessions <span className="pn-tab-n">4</span></button>
        <button className="pn-tab" style={{ paddingTop: 14 }}>Resources</button>
        <span className="pn-head-spacer" style={{ flex: 1 }}></span>
        <button className="pn-ib" title="New space" style={{ alignSelf: 'center' }}><Icon name="plus" /></button>
        <button className="pn-ib" title="Collapse" style={{ alignSelf: 'center' }}><Icon name="chevronR" /></button>
      </div>

      <div className="pn-quick">
        <button className="pn-qchip"><span className="pn-plus">＋</span> Terminal</button>
        <button className="pn-qchip"><img src="../assets/claude-code-icon.png" alt="" /> Claude</button>
        <button className="pn-qchip"><img src="../assets/openai-codex-icon.png" alt="" /> Codex</button>
        <button className="pn-qchip"><img src="../assets/gemini-logo.png" alt="" /> Gemini</button>
      </div>

      <div className="pn-scroll">
        <div className="pn-sec-head"><span className="pn-eyebrow">Running <span className="pn-count">· 4</span></span><span className="pn-line"></span></div>
        <div className="pn-team">
          <div className="pn-team__head"><span className="pn-team__dot" style={{ background: '#2f8f7f' }}></span><span className="pn-team__name">Reparent strike team</span><span className="pn-team__count">4 sessions</span></div>
          <SessionNode node={SHELL_COORD} expandedId="" />
        </div>
        <div className="pn-sec-head"><span className="pn-eyebrow">Idle <span className="pn-count">· 2</span></span><span className="pn-line"></span></div>
        {SHELL_SESS_IDLE.map((n) => <SessionNode key={n.id} node={n} expandedId="" />)}
      </div>
      <div className="pn-fade"></div>
    </div>
  );
}

/* ---------- spaces rail (far right) ---------- */
function SpacesRail() {
  return (
    <div className="pn-srail">
      <button className="pn-srail-s" title="New space" style={{ background: 'var(--pn-ink)', borderColor: 'var(--pn-ink)', color: 'var(--pn-paper)' }}><Icon name="plus" /></button>
      <button className="pn-srail-s" title="Expand"><Icon name="grid" /></button>
      <div className="pn-rail-div"></div>
      <div className="pn-srail-s pn-srail-s--active" title="fluffy-starlight"><img src="../assets/claude-code-icon.png" alt="" /><span className="pn-srail-pulse"></span></div>
      <div className="pn-srail-s" title="Alexa coordinator"><img src="../assets/openai-codex-icon.png" alt="" /><span className="pn-srail-pulse"></span></div>
      <div className="pn-srail-s" title="vast-neumann"><img src="../assets/claude-code-icon.png" alt="" /><span className="pn-srail-wait"></span></div>
      <div className="pn-srail-s" title="concurrent-cosmos"><img src="../assets/gemini-logo.png" alt="" /></div>
      <div className="pn-srail-s pn-agent--term pn-srail-s--exited" title="zesty-wave">&gt;_</div>
    </div>
  );
}

/* ---------- top bar ---------- */
function TopBar() {
  const [dark, setDark] = React.useState(false);
  const toggle = () => setDark((d) => { const nd = !d; document.documentElement.dataset.theme = nd ? 'dark' : ''; return nd; });
  return (
    <div className="pn-top">
      <div className="pn-lights"><i></i><i></i><i></i></div>
      <div className="pn-ptabs">
        <span className="pn-ptab pn-ptab--active"><span className="pn-dot pn-dot--run"></span> agent-maestro</span>
        <span className="pn-ptab">voice-alexa</span>
        <button className="pn-ib" style={{ width: 26, height: 26 }}><Icon name="plus" size={14} /></button>
      </div>
      <div className="pn-top-r">
        <button className="pn-ib" title={dark ? 'Light mode' : 'Dark mode'} onClick={toggle}><Icon name={dark ? 'sun' : 'moon'} /></button>
        <button className="pn-ib" title="Search"><Icon name="search" /></button>
        <button className="pn-ib" title="Command"><span className="pn-kbd">⌘K</span></button>
      </div>
    </div>
  );
}

function Shell() {
  return (
    <div className="pn-shell">
      <TopBar />
      <div className="pn-shell-body">
        <IconRail />
        <MaestroPanel />
        <Terminal />
        <SpacesPanel />
        <SpacesRail />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Shell />);
