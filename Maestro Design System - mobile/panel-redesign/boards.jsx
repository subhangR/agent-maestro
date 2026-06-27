/* boards.jsx — Project board, Full (multi-project) board, and Team view.
   Relies on kit.jsx (Icon, AgentTile) + tiles.jsx (Glyph, Avatar). */

const BCOLUMNS = [
  { status: 'todo', label: 'Backlog' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'in_review', label: 'Review' },
  { status: 'completed', label: 'Done' },
];
const PRIO_DOT = { high: 'var(--pn-block)', medium: 'var(--pn-wait)', low: 'var(--pn-idle)' };

function BoardCard({ t, badge }) {
  const blocked = t.status === 'blocked';
  const done = t.status === 'completed';
  const active = t.status === 'in_progress';
  return (
    <div className={'pn-bcard' + (blocked ? ' pn-bcard--blocked' : '') + (done ? ' pn-bcard--done' : '')}>
      <div className="pn-bcard__top">
        <span className="pn-bcard__pdot" style={{ background: PRIO_DOT[t.priority] }}></span>
        <span className="pn-bcard__title">{t.title}</span>
        {active && <span className="pn-bcard__glyph pn-dot-wrap"><span className="pn-dot pn-dot--run pn-dot--live"></span></span>}
        {blocked && <span className="pn-bcard__glyph"><Glyph kind="blocked" size={14} /></span>}
        {done && <span className="pn-bcard__glyph"><Glyph kind="completed" size={14} /></span>}
      </div>
      {badge && <span className="pn-bcard__pbadge" style={{ color: badge.color, borderColor: badge.color }}>{badge.name}</span>}
      <div className="pn-bcard__meta">
        <span className="pn-tag pn-tag--{p}" style={{ color: t.priority === 'high' ? 'var(--pn-block)' : 'var(--pn-ink-3)' }}>{t.priority === 'medium' ? 'MED' : t.priority.toUpperCase()}</span>
        {t.subTotal > 0 && (
          <span className="pn-bcard__prog">{t.subDone}/{t.subTotal}<span className="pn-bcard__progbar"><i style={{ width: (t.subDone / t.subTotal * 100) + '%' }}></i></span></span>
        )}
        {t.due && <span className={'pn-bcard__due' + (t.overdue ? ' pn-bcard__due--over' : '')}>{t.overdue ? 'Overdue' : 'Due ' + t.due}</span>}
      </div>
      <div className="pn-bcard__foot">
        {t.assignee && <Avatar a={t.assignee} />}
        {t.sessions > 0 && <span className="pn-bcard__sessions"><span className={'pn-dot ' + (active ? 'pn-dot--run' : 'pn-dot--idle')}></span>{t.sessions + ' session' + (t.sessions !== 1 ? 's' : '')}</span>}
        {(t.status === 'todo' || t.status === 'blocked') && <button className="pn-bcard__run"><span className="pn-prompt">$</span> work on</button>}
      </div>
    </div>
  );
}

function Column({ col, tasks, badge, collapsed, onToggle }) {
  const list = tasks.filter((t) => t.status === col.status);
  if (collapsed) {
    return (
      <div className="pn-bcol--collapsed" onClick={onToggle} title={col.label}>
        <Glyph kind={col.status === 'todo' ? 'todo' : col.status} size={15} />
        <span className="pn-bcol__count">{list.length}</span>
        <span className="pn-bcol__label">{col.label}</span>
      </div>
    );
  }
  return (
    <div className="pn-bcol">
      <div className="pn-bcol__hd" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <Glyph kind={col.status === 'todo' ? 'todo' : col.status} size={14} />
        <span className="pn-bcol__label">{col.label}</span>
        <span className="pn-bcol__count">{list.length}</span>
      </div>
      <div className="pn-bcol__body">
        {list.length === 0 ? <div className="pn-bcol__empty">no tasks</div> : list.map((t) => <BoardCard key={t.id} t={t} badge={badge} />)}
      </div>
    </div>
  );
}

function ProjectBoard({ tasks }) {
  const [collapsed, setCollapsed] = React.useState({});
  return (
    <div className="pn-screen">
      <div className="pn-bd-hd">
        <span className="pn-bd-hd__title">agent-maestro</span>
        <span className="pn-bd-hd__sub">8 tasks · 3 active</span>
        <span className="pn-bd-hd__sp"></span>
        <button className="pn-btn pn-btn--ghost"><Icon name="sliders" size={14} /> Filter</button>
        <button className="pn-btn"><Icon name="plus" size={14} /> New task</button>
      </div>
      <div className="pn-bcols">
        {BCOLUMNS.map((col) => <Column key={col.status} col={col} tasks={tasks} collapsed={!!collapsed[col.status]} onToggle={() => setCollapsed((c) => ({ ...c, [col.status]: !c[col.status] }))} />)}
      </div>
    </div>
  );
}

function ProjectRow({ proj, tasks }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="pn-mpr">
      <div className="pn-mpr__hd" onClick={() => setOpen((v) => !v)}>
        <span className="pn-mpr__dot" style={{ background: proj.color }}></span>
        <span className="pn-mpr__name">{proj.name}</span>
        <span className="pn-mpr__count">{tasks.length} tasks</span>
        <span className="pn-mpr__chev"><Icon name={open ? 'chevronD' : 'chevronR'} size={14} /></span>
      </div>
      {open && <div className="pn-bcols">{BCOLUMNS.map((col) => <Column key={col.status} col={col} tasks={tasks} badge={proj} />)}</div>}
    </div>
  );
}

function FullBoard({ projects }) {
  return (
    <div className="pn-screen" style={{ paddingBottom: 4 }}>
      <div className="pn-bd-hd">
        <span className="pn-bd-hd__title">All projects</span>
        <span className="pn-bd-hd__sub">{projects.length} projects</span>
        <span className="pn-bd-hd__sp"></span>
        <button className="pn-btn pn-btn--ghost"><Icon name="sliders" size={14} /> Group by status</button>
      </div>
      <div style={{ paddingTop: 14 }}>
        {projects.map((p) => <ProjectRow key={p.id} proj={p} tasks={p.tasks} />)}
      </div>
    </div>
  );
}

/* ---------------- TEAM VIEW ---------------- */
function TVStats({ total, active }) {
  if (!total) return null;
  return (
    <span className="pn-tv__stats">
      <span>{total} {total === 1 ? 'worker' : 'workers'}</span>
      {active > 0 && <span className="pn-tv__statchip" style={{ color: 'var(--pn-run)' }}><span className="pn-dot pn-dot--run"></span>{active}</span>}
      {total - active > 0 && <span className="pn-tv__statchip"><span className="pn-dot pn-dot--idle"></span>{total - active}</span>}
    </span>
  );
}
function TVTerm({ lines }) {
  return <div className="pn-tv__term">{lines.map((l, i) => <div key={i} dangerouslySetInnerHTML={{ __html: l }}></div>)}</div>;
}
function WorkerCol({ w, collapsed, onToggle }) {
  if (collapsed) {
    return (
      <div className="pn-tv__col pn-tv__col--collapsed" onClick={onToggle} title={'Expand ' + w.name}>
        <div className="pn-tv__colv">
          <AgentTile kind={w.agent} />
          {w.needsInput ? <Glyph kind="needsInput" size={14} /> : <Glyph kind={w.status} size={14} />}
          <span className="pn-tv__colvname">{w.name}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={'pn-tv__col' + (w.needsInput ? ' pn-tv__col--needs' : '')}>
      <div className="pn-tv__slothd">
        <AgentTile kind={w.agent} />
        <span className="pn-tv__slotname">{w.name}</span>
        {w.needsInput ? <Glyph kind="needsInput" size={14} /> : <Glyph kind={w.status} size={14} />}
        <span className="pn-tv__slotsp"></span>
        {w.branch && <span className="pn-mini" title={'worktree ' + w.branch}><Icon name="gitBranch" size={12} /></span>}
        {!w.live && !w.drill && <button className="pn-tv__colbtn" title="Resume"><Icon name="refresh" /></button>}
        <button className="pn-tv__colbtn" title="Collapse column" onClick={onToggle}><Icon name="chevronL" /></button>
      </div>
      {w.live
        ? <TVTerm lines={w.term} />
        : <div className="pn-tv__ph"><span>No live terminal</span>{w.resumable && <button className="pn-tv__ph__resume"><Icon name="refresh" /> Resume</button>}</div>}
      {w.drill && (
        <div className="pn-tv__drillbar">
          {w.subTotal} {w.subTotal === 1 ? 'worker' : 'workers'} — drill in
          <span className="arrow"><Icon name="arrowRight" size={13} /></span>
        </div>
      )}
    </div>
  );
}

function TeamView() {
  const [coordW, setCoordW] = React.useState(440);
  const [collapsed, setCollapsed] = React.useState({});
  const [dragging, setDragging] = React.useState(false);
  const bodyRef = React.useRef(null);
  const dragRef = React.useRef(false);
  const toggle = (name) => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  React.useEffect(() => {
    const mv = (e) => {
      if (!dragRef.current || !bodyRef.current) return;
      const r = bodyRef.current.getBoundingClientRect();
      setCoordW(Math.max(300, Math.min(r.width * 0.62, e.clientX - r.left)));
    };
    const up = () => { if (!dragRef.current) return; dragRef.current = false; setDragging(false); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  const onDown = (e) => { e.preventDefault(); dragRef.current = true; setDragging(true); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; };

  const rootTerm = [
    '<span class="l-prompt">›</span> Coordinating the reparent fix across 3 workers',
    '<span class="l-dim">&nbsp;&nbsp;spawned fluffy-starlight, vast-neumann, alexa</span>',
    '<span class="l-dim">&nbsp;&nbsp;waiting on the registry-ref change before tests</span>',
    '<span class="l-prompt">›</span> Reviewing fluffy-starlight\'s diff<span class="pn-tv__tcursor"></span>',
  ];
  const workers = [
    { name: 'fluffy-starlight', agent: 'claude', status: 'working', live: true, branch: 'fix/reparent', term: ['<span class="l-prompt">›</span> Editing MultiProjectSessionsView.tsx', '<span class="l-ok">&nbsp;&nbsp;+ registry.current.get(id)?.term.element</span>', '<span class="l-dim">&nbsp;&nbsp;re-running fit.fit()…</span>'] },
    { name: 'vast-neumann', agent: 'claude', status: 'working', live: true, needsInput: true, term: ['<span class="l-prompt">›</span> Should the profile layer be per-project', '<span class="l-prompt">&nbsp;&nbsp;or global?&nbsp;<span class="pn-tv__tcursor"></span></span>'] },
    { name: 'Alexa coordinator', agent: 'codex', status: 'working', live: true, drill: true, subTotal: 2, term: ['<span class="l-prompt">›</span> Delegating to 2 sub-workers', '<span class="l-dim">&nbsp;&nbsp;voice-router · directive-parser</span>'] },
    { name: 'swift-harbor', agent: 'claude', status: 'working', live: true, term: ['<span class="l-prompt">›</span> Writing regression test', '<span class="l-ok">&nbsp;&nbsp;✓ reconnect keeps terminal mounted</span>'] },
    { name: 'concurrent-cosmos', agent: 'gemini', status: 'idle', live: false, resumable: true },
    { name: 'zesty-wave', agent: 'terminal', status: 'stopped', live: false, resumable: false },
  ];

  return (
    <div className="pn-screen pn-tv">
      <div className="pn-tv__hd">
        <span className="pn-tv__title"><AgentTile kind="claude" lg /> Rhea</span>
        <span className="pn-tv__pill pn-tv__pill--active"><span className="pn-dot pn-dot--run"></span> Active</span>
        <span className="pn-tv__count">7 members</span>
        <span className="pn-tv__hint">click child to drill · double-click to open · Esc to close</span>
        <button className="pn-tv__close"><Icon name="x" /></button>
      </div>
      <div className="pn-tv__crumbs">
        <button className="pn-tv__crumb"><Avatar a={{ initial: 'M', color: '#3f6c90', bg: '#dde8f1' }} /> maestro-lead</button>
        <span className="pn-tv__crumb-sep"><Icon name="chevronR" size={12} /></span>
        <button className="pn-tv__crumb pn-tv__crumb--current"><Avatar a={{ initial: 'R', color: '#1f6f5f', bg: '#dcebe6' }} /> Rhea</button>
      </div>
      <div className="pn-tv__body" ref={bodyRef}>
        <div className="pn-tv__coord" style={{ width: coordW }}>
          <div className="pn-tv__coordhd">
            <span className="pn-tv__coordring"><AgentTile kind="claude" lg /></span>
            <span className="pn-tv__coordname">Rhea</span>
            <span className="pn-tv__coordbadge"><Icon name="baton" /> Coordinator</span>
            <span className="pn-tv__slotsp"></span>
            <TVStats total={3} active={2} />
          </div>
          <TVTerm lines={rootTerm} />
        </div>
        <div className={'pn-tv__resize' + (dragging ? ' pn-tv__resize--active' : '')} onMouseDown={onDown}></div>
        <div className="pn-tv__workers">
          {workers.map((w) => <WorkerCol key={w.name} w={w} collapsed={!!collapsed[w.name]} onToggle={() => toggle(w.name)} />)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- data + showcase ---------------- */
const RHEA = { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6' };
const KIT = { initial: 'K', name: 'Kit', color: '#7a5cc0', bg: '#ece4f7' };
const ADA = { initial: 'A', name: 'Ada', color: '#b06a2b', bg: '#f4e7d6' };

const PROJ_TASKS = [
  { id: 'b1', title: 'Fix terminal reparenting crash on board close', priority: 'high', status: 'in_progress', subDone: 1, subTotal: 3, sessions: 2, assignee: RHEA, due: 'Jun 12' },
  { id: 'b2', title: 'WebSocket pipeline — dedupe session updates', priority: 'medium', status: 'in_progress', subTotal: 0, sessions: 1, assignee: KIT },
  { id: 'b3', title: 'Add a model-profile indirection layer', priority: 'medium', status: 'todo', subDone: 0, subTotal: 2, sessions: 0, assignee: RHEA },
  { id: 'b4', title: 'Voice directives — Alexa coordinator handoff', priority: 'low', status: 'todo', subTotal: 0, sessions: 0 },
  { id: 'b5', title: 'Migrate task ordering to server persistence', priority: 'medium', status: 'blocked', subTotal: 0, sessions: 1, assignee: ADA, due: 'Jun 5', overdue: true },
  { id: 'b6', title: 'Verify Opus 1M spawns with 1M context window', priority: 'low', status: 'in_review', subTotal: 0, sessions: 1, assignee: KIT },
  { id: 'b7', title: 'Add /loop recurring command', priority: 'low', status: 'completed', subTotal: 0, sessions: 0 },
  { id: 'b8', title: 'Dedup notification sounds per instrument', priority: 'medium', status: 'completed', subDone: 2, subTotal: 2, sessions: 0 },
];

const PROJECTS = [
  { id: 'p1', name: 'agent-maestro', color: '#1f6f5f', tasks: PROJ_TASKS.slice(0, 6) },
  { id: 'p2', name: 'voice-alexa', color: '#7a5cc0', tasks: [
    { id: 'v1', title: 'Wake-word false positives on "Alexa stop"', priority: 'high', status: 'in_progress', subTotal: 0, sessions: 1, assignee: ADA },
    { id: 'v2', title: 'Coordinator handoff protocol spec', priority: 'medium', status: 'todo', subTotal: 0, sessions: 0 },
    { id: 'v3', title: 'Latency budget for directive routing', priority: 'low', status: 'in_review', subTotal: 0, sessions: 0, assignee: KIT },
  ] },
  { id: 'p3', name: 'maestro-server', color: '#b06a2b', tasks: [
    { id: 's1', title: 'JSON store compaction on startup', priority: 'medium', status: 'completed', subTotal: 0, sessions: 0 },
    { id: 's2', title: 'WebSocket backpressure handling', priority: 'high', status: 'blocked', subTotal: 0, sessions: 0, assignee: RHEA },
  ] },
];

function Boards() {
  return (
    <div className="pn-bd-stage">
      <div><div className="pn-bd-cap">Team view — agent sessions</div><TeamView /></div>
      <div><div className="pn-bd-cap">Project board</div><ProjectBoard tasks={PROJ_TASKS} /></div>
      <div><div className="pn-bd-cap">Full board — all projects</div><FullBoard projects={PROJECTS} /></div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Boards />);

Object.assign(window, { TeamView, ProjectBoard, FullBoard, BoardCard });
