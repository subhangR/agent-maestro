/* tiles.jsx — interactive Task & Session tiles + trees.
   Expand/collapse (trees + tile meta), inline-edit dropdowns (portal popovers).
   Relies on kit.jsx (Icon, AgentTile). */
const { useState, useRef, useLayoutEffect } = React;

/* ---------------- drawn status glyph ---------------- */
function Glyph({ kind, size = 16 }) {
  const ring = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />;
  let inner = null;
  switch (kind) {
    case 'todo': case 'idle': inner = ring; break;
    case 'in_progress':
      inner = <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.28" />
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" pathLength="100" strokeDasharray="62 100" transform="rotate(-90 8 8)" /></>; break;
    case 'working': inner = <>{ring}<circle cx="8" cy="8" r="2.6" fill="currentColor" /></>; break;
    case 'in_review': inner = <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2.3" />; break;
    case 'completed': inner = <><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M5 8.2l2.1 2.1L11 6.4" fill="none" stroke="var(--pn-card)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>; break;
    case 'cancelled': inner = <>{ring}<path d="M4.5 11.5l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>; break;
    case 'blocked': case 'failed': inner = <>{ring}<path d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>; break;
    case 'archived': case 'stopped': inner = <rect x="3" y="3" width="10" height="10" rx="2.5" fill={kind === 'stopped' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />; break;
    case 'spawning': inner = <>{ring}<path d="M8 2a6 6 0 000 12z" fill="currentColor" /></>; break;
    case 'needsInput': inner = <><circle cx="8" cy="8" r="6.5" fill="currentColor" /><path d="M8 4.6v4" stroke="var(--pn-surface)" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11" r="0.95" fill="var(--pn-surface)" /></>; break;
    default: inner = ring;
  }
  return <span className={'pn-stat pn-stat--' + kind} style={{ width: size, height: size }}><svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">{inner}</svg></span>;
}

const TASK_LABEL = { todo: 'Todo', in_progress: 'In progress', in_review: 'In review', completed: 'Completed', cancelled: 'Cancelled', blocked: 'Blocked', archived: 'Archived' };
const SESS_LABEL = { spawning: 'Spawning', idle: 'Idle', working: 'Working', completed: 'Done', failed: 'Failed', stopped: 'Stopped' };
const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked', 'archived'];
const PRIORITIES = ['high', 'medium', 'low'];
const MODELS = ['default', 'opus-4.8', 'sonnet-4.5', 'opus[1m]', 'gemini-2.5-pro', 'codex-1'];
const MODES = ['Worker', 'Coordinator', 'Co-Worker', 'Co-Coordinator'];
const ALL_MEMBERS = [
  { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6' },
  { initial: 'K', name: 'Kit', color: '#7a5cc0', bg: '#ece4f7' },
  { initial: 'A', name: 'Ada', color: '#b06a2b', bg: '#f4e7d6' },
  { initial: 'M', name: 'Milo', color: '#3f6c90', bg: '#dde8f1' },
];

function Avatar({ a }) { return <span className="pn-av" style={{ color: a.color, background: a.bg || 'var(--pn-active)' }}>{a.initial}</span>; }
function Avatars({ list }) {
  if (!list || !list.length) return null;
  if (list.length === 1) return <Avatar a={list[0]} />;
  return <span className="pn-av-group">{list.slice(0, 3).map((a, i) => <span key={i} className="pn-av pn-av--stack" style={{ color: a.color, background: a.bg || 'var(--pn-active)' }}>{a.initial}</span>)}</span>;
}

/* portal popover anchored to a trigger ref */
function Menu({ anchorRef, onClose, children }) {
  const [p, setP] = useState(null);
  useLayoutEffect(() => {
    const el = anchorRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setP({ top: Math.min(r.bottom + 4, window.innerHeight - 280), left: Math.min(r.left, window.innerWidth - 196) });
  }, []);
  if (!p) return null;
  return ReactDOM.createPortal(
    <><div className="pn-pop-ov" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="pn-pop" style={{ top: p.top, left: p.left }} onClick={(e) => e.stopPropagation()}>{children}</div></>,
    document.body);
}
function Opt({ cur, onClick, children }) {
  return <button className={'pn-opt' + (cur ? ' pn-opt--cur' : '')} onClick={onClick}>{children}{cur && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}</button>;
}

/* ---------------- TASK TILE ---------------- */
function TaskTile({ t, collapsed, onToggleCollapse, defaultExpanded }) {
  const [open, setOpen] = useState(!!defaultExpanded);
  const [status, setStatus] = useState(t.status);
  const [priority, setPriority] = useState(t.priority || 'medium');
  const [assignees, setAssignees] = useState(t.assignees || []);
  const [model, setModel] = useState(t.model || 'default');
  const [danger, setDanger] = useState(!!t.dangerous);
  const [worktree, setWorktree] = useState(!!t.worktree);
  const [menu, setMenu] = useState(null);
  const sRef = useRef(), pRef = useRef(), aRef = useRef(), mRef = useRef();
  const hasKids = (t.children && t.children.length > 0) || t.subtaskCount > 0;

  const toggleAssignee = (m) => setAssignees((prev) => prev.some((x) => x.name === m.name) ? prev.filter((x) => x.name !== m.name) : [...prev, m]);

  return (
    <div className={'pn-tt' + (status === 'completed' ? ' pn-tt--completed' : '') + (t.active ? ' pn-tt--active' : '')}>
      <div className="pn-tt__main">
        <button className={'pn-tt__arrow ' + (hasKids ? (collapsed ? '' : 'pn-tt__arrow--expanded') : 'pn-tt__arrow--empty')} onClick={() => hasKids && onToggleCollapse && onToggleCollapse()} title={hasKids ? 'Toggle subtasks' : 'Add subtask'}>
          <Icon name="chevronR" />
        </button>
        {hasKids && <span className="pn-tt__arrowCount">{t.subtaskCount || (t.children ? t.children.length : 0)}</span>}
        <button className="pn-tt__status" title={TASK_LABEL[status] + ' — click to toggle complete'} onClick={() => setStatus((s) => s === 'completed' ? 'todo' : 'completed')}><Glyph kind={status} /></button>
        {t.pinned && <Icon name="pin" size={12} style={{ color: 'var(--pn-brand)', flex: '0 0 auto' }} />}
        <span className={'pn-tt__title' + (!t.title ? ' pn-tt__title--untitled' : '')} onClick={() => setOpen((v) => !v)}>{t.title || 'Untitled'}</span>
        {t.active && <span className="pn-tt__activedot" title="Current session is on this task"></span>}
        <div className="pn-tt__inline">
          {priority && <span className={'pn-tag pn-tag--' + (priority === 'high' ? 'high' : priority === 'medium' ? 'med' : 'low')}>{priority === 'medium' ? 'med' : priority}</span>}
          {assignees.length > 0 && <Avatars list={assignees} />}
          {t.docs > 0 && <span className="pn-mini"><Icon name="doc" size={12} />{t.docs}</span>}
          {t.activity && <span className={'pn-stat pn-stat--' + (t.activity === 'needsInput' ? 'needsInput' : t.activity)} title={'Session ' + t.activity}><Glyph kind={t.activity === 'needsInput' ? 'needsInput' : t.activity} size={14} /></span>}
        </div>
        <div className="pn-tt__actions">
          <button className="pn-tt__run" title="Run task"><Icon name="play" /></button>
          <button className={'pn-tt__ind' + (open ? ' pn-tt__ind--open' : '')} title="Details" onClick={() => setOpen((v) => !v)}><Icon name="chevronD" /></button>
        </div>
      </div>

      {open && (
        <div className="pn-tt__meta">
          <div className="pn-tt__metarow">
            <button ref={sRef} className={'pn-badge pn-badge--btn pn-badge--status-' + status} onClick={() => setMenu(menu === 's' ? null : 's')}><Glyph kind={status} size={12} /> {TASK_LABEL[status]} <Icon name="chevronD" size={9} className="pn-badge__caret" /></button>
            <button ref={pRef} className={'pn-badge pn-badge--btn' + (priority === 'high' ? ' pn-badge--prio-high' : '')} onClick={() => setMenu(menu === 'p' ? null : 'p')}>{priority.toUpperCase()} <Icon name="chevronD" size={9} className="pn-badge__caret" /></button>
            <button ref={aRef} className="pn-badge pn-badge--btn" onClick={() => setMenu(menu === 'a' ? null : 'a')}>{assignees.length ? <Avatars list={assignees} /> : <Icon name="users" size={12} />} {assignees.length ? (assignees.length > 1 ? assignees.length + ' members' : assignees[0].name) : 'Assign'} <Icon name="chevronD" size={9} className="pn-badge__caret" /></button>
            <button ref={mRef} className={'pn-badge pn-badge--btn pn-badge--model' + (model !== (t.model || 'default') ? ' is-override' : '')} onClick={() => setMenu(menu === 'm' ? null : 'm')}>{model} <Icon name="chevronD" size={9} className="pn-badge__caret" /></button>
          </div>
          <div className="pn-tt__metarow">
            <button className={'pn-toggle' + (danger ? ' pn-toggle--on-danger' : '')} onClick={() => setDanger((v) => !v)}><Icon name="shield" size={13} /> {danger ? 'YOLO' : 'Safe'}</button>
            <button className={'pn-toggle' + (worktree ? ' pn-toggle--on-wt' : '')} onClick={() => setWorktree((v) => !v)}><Icon name="gitBranch" size={13} /> {worktree ? 'worktree' : 'in-place'}</button>
            {t.due && <span className="pn-mini" style={{ color: t.overdue ? 'var(--pn-block)' : 'var(--pn-ink-3)' }}><Icon name="clock" size={12} /> {t.due}</span>}
            <span className="pn-tt__time">updated {t.updated || 'just now'}</span>
          </div>
          {t.sessions && <div className="pn-tt__metarow">{t.sessions.map((s, i) => <span key={i} className={'pn-actchip pn-actchip--' + s.kind}>{s.label}</span>)}</div>}
          {(t.docList || t.diagrams) && (
            <div className="pn-tt__metarow">
              {t.docList && t.docList.map((d, i) => <span key={i} className="pn-docpill"><span className="pn-docpill__ic">{d.md ? 'M↓' : '{}'}</span><span className="pn-docpill__t">{d.name}</span></span>)}
              {t.diagrams && t.diagrams.map((d, i) => <span key={i} className="pn-docpill"><span className="pn-docpill__ic">⬡</span><span className="pn-docpill__t">{d}</span></span>)}
              <span className="pn-docpill pn-docpill--add"><Icon name="plus" size={11} /> Diagram</span>
            </div>
          )}
        </div>
      )}

      {menu === 's' && <Menu anchorRef={sRef} onClose={() => setMenu(null)}>{TASK_STATUSES.map((s) => <Opt key={s} cur={s === status} onClick={() => { setStatus(s); setMenu(null); }}><Glyph kind={s} size={14} /> {TASK_LABEL[s]}</Opt>)}</Menu>}
      {menu === 'p' && <Menu anchorRef={pRef} onClose={() => setMenu(null)}>{PRIORITIES.map((p) => <Opt key={p} cur={p === priority} onClick={() => { setPriority(p); setMenu(null); }}>{p.toUpperCase()}</Opt>)}</Menu>}
      {menu === 'a' && <Menu anchorRef={aRef} onClose={() => setMenu(null)}>{ALL_MEMBERS.map((m) => <Opt key={m.name} cur={assignees.some((x) => x.name === m.name)} onClick={() => toggleAssignee(m)}><Avatar a={m} /> {m.name}</Opt>)}</Menu>}
      {menu === 'm' && <Menu anchorRef={mRef} onClose={() => setMenu(null)}>{MODELS.map((m) => <Opt key={m} cur={m === model} onClick={() => { setModel(m); setMenu(null); }}>{m}</Opt>)}</Menu>}
    </div>
  );
}

function TaskNode({ node, expandedId }) {
  const [collapsed, setCollapsed] = useState(node.collapsed ?? false);
  return (
    <div>
      <TaskTile t={node} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} defaultExpanded={node.id === expandedId} />
      {node.children && !collapsed && <div className="pn-kids">{node.children.map((c) => <TaskNode key={c.id} node={c} expandedId={expandedId} />)}</div>}
    </div>
  );
}

/* ---------------- SESSION TILE ---------------- */
function SessionTile({ s, collapsed, onToggleCollapse, defaultExpanded }) {
  const [open, setOpen] = useState(!!defaultExpanded);
  const [mode, setMode] = useState(s.mode || 'Worker');
  const [done, setDone] = useState(!!s.humanDone);
  const [menu, setMenu] = useState(false);
  const modeRef = useRef();
  const hasKids = (s.children && s.children.length > 0) || s.childCount > 0;
  const live = s.live;

  return (
    <div className={'pn-st' + (s.needsInput ? ' pn-st--needsInput' : '') + (s.selected ? ' pn-st--selected' : '') + (s.archived ? ' pn-st--archived' : '')}>
      <div className="pn-st__main">
        <button className={'pn-st__arrow ' + (hasKids ? (collapsed ? '' : 'pn-st__arrow--expanded') : 'pn-st__arrow--empty')} disabled={!hasKids} onClick={() => hasKids && onToggleCollapse && onToggleCollapse()}>
          <Icon name="chevronR" />
        </button>
        {hasKids && <span className="pn-st__arrowCount">{s.childCount || (s.children ? s.children.length : 0)}</span>}
        {s.archived
          ? <span className="pn-st__radio pn-st__radio--archived" title="Archived"><Glyph kind="archived" size={13} /></span>
          : <button className={'pn-st__radio' + (done ? ' pn-st__radio--on' : '')} title="Mark done" onClick={() => setDone((v) => !v)}>{done && <Icon name="check" size={10} sw={2.2} />}</button>}
        <span className="pn-st__title" onClick={() => setOpen((v) => !v)}>
          {s.agent && <AgentTile kind={s.agent} />}
          {s.avatars && <Avatars list={s.avatars} />}
          <span className="pn-st__titleText">{s.title}</span>
        </span>
        {done && !s.archived && <span className="pn-st__tag pn-st__tag--done">done</span>}
        {!s.archived && (live ? <span className="pn-st__live pn-dot-wrap"><span className="pn-dot pn-dot--run pn-dot--live" style={{ position: 'absolute', inset: 0 }}></span></span> : <span className="pn-st__stopped" title="No live terminal"></span>)}
        {s.docs > 0 && <span className="pn-mini"><Icon name="doc" size={12} />{s.docs}</span>}
        {s.worktree && <span className="pn-mini" title={'worktree ' + s.worktree}><Icon name="gitBranch" size={12} /></span>}
        <span className="pn-st__statusglyph" title={s.needsInput ? 'Needs input' : SESS_LABEL[s.status]}><Glyph kind={s.needsInput ? 'needsInput' : s.status} size={16} /></span>
        <div className="pn-st__actions">
          {hasKids && <button className="pn-st__btn" title="Team view"><Icon name="teamview" /></button>}
          {!live && !s.archived && <button className="pn-st__resume" title="Resume"><Icon name="refresh" /> Resume</button>}
          {!s.archived && <button className="pn-st__btn pn-st__btn--danger" title="Close"><Icon name="x" /></button>}
          {s.archived && <button className="pn-st__btn" title="Restore"><Icon name="refresh" /></button>}
          <button className="pn-st__btn" title="Copy reference"><Icon name="copy" /></button>
          <button className="pn-st__btn" title="Details" onClick={() => setOpen((v) => !v)}><Icon name="chevronD" /></button>
        </div>
      </div>

      {s.tasklines && <div className="pn-st__tasklines">{s.tasklines.map((tl, i) => <div key={i} className="pn-st__taskline"><Glyph kind={tl.status} size={13} /><span className="pn-st__tasklineLabel">{tl.title}</span></div>)}</div>}

      {open && (
        <div className="pn-st__meta">
          <div className="pn-st__metasec">
            <span className="pn-st__metalabel">Status</span>
            <div className="pn-st__metacontent">
              <span className={'pn-badge pn-badge--status-' + (s.needsInput ? 'needsInput' : s.status)}><Glyph kind={s.needsInput ? 'needsInput' : s.status} size={12} /> {s.needsInput ? 'NEEDS INPUT' : SESS_LABEL[s.status].toUpperCase()}</span>
              <button ref={modeRef} className="pn-badge pn-badge--btn" onClick={() => setMenu((v) => !v)}>{mode} <Icon name="chevronD" size={9} className="pn-badge__caret" /></button>
              {s.model && <span className="pn-badge pn-badge--model">{s.model.toUpperCase()}</span>}
              {s.strategy && <span className="pn-badge">{s.strategy}</span>}
              {s.worktree && <span className="pn-badge"><Icon name="gitBranch" size={11} /> {s.worktree}</span>}
              <span className="pn-st__time pn-tt__time" style={{ marginLeft: 'auto' }}>{s.elapsed || 'live'}</span>
            </div>
          </div>
          {s.taskchips && <div className="pn-st__metasec"><span className="pn-st__metalabel">Tasks</span><div className="pn-st__metacontent">{s.taskchips.map((tc, i) => <span key={i} className="pn-st__taskchip"><Glyph kind={tc.status} size={12} /><span className="t">{tc.title}</span></span>)}</div></div>}
          {s.docList && <div className="pn-st__metasec"><span className="pn-st__metalabel">Docs</span><div className="pn-st__metacontent">{s.docList.map((d, i) => <span key={i} className="pn-docpill"><span className="pn-docpill__ic">{d.md ? 'M↓' : '{}'}</span><span className="pn-docpill__t">{d.name}</span></span>)}</div></div>}
          <div className="pn-st__metasec"><span className="pn-st__metalabel">Actions</span><div className="pn-st__metacontent"><button className="pn-st__actbtn"><Icon name="info" size={13} /> Details</button><button className="pn-st__actbtn"><Icon name="copy" size={13} /> Copy ref</button></div></div>
        </div>
      )}

      {menu && <Menu anchorRef={modeRef} onClose={() => setMenu(false)}>{MODES.map((m) => <Opt key={m} cur={m === mode} onClick={() => { setMode(m); setMenu(false); }}>{m}</Opt>)}</Menu>}
    </div>
  );
}

function SessionNode({ node, expandedId }) {
  const [collapsed, setCollapsed] = useState(node.collapsed ?? false);
  return (
    <div>
      <SessionTile s={node} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} defaultExpanded={node.id === expandedId} />
      {node.children && !collapsed && <div className="pn-kids pn-kids--st">{node.children.map((c) => <SessionNode key={c.id} node={c} expandedId={expandedId} />)}</div>}
    </div>
  );
}

Object.assign(window, { Glyph, TaskTile, TaskNode, SessionTile, SessionNode, Avatar, Avatars });
