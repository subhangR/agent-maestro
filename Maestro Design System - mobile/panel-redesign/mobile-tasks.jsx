/* mobile.jsx — Maestro mobile app: shell, bottom nav, router, all screens.
   Relies on kit.jsx (Icon, AgentTile), tiles.jsx (Glyph, Avatar),
   icons-team-1/2.jsx (emblems). */
const { useState: mS } = React;

/* ---------------- shared data ---------------- */
const M_AV = {
  rhea: { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6', emblem: 'violin' },
  kit:  { initial: 'K', name: 'Kit', color: '#7a5cc0', bg: '#ece4f7', emblem: 'piano' },
  ada:  { initial: 'A', name: 'Ada', color: '#b06a2b', bg: '#f4e7d6', emblem: 'snare' },
  milo: { initial: 'M', name: 'Milo', color: '#3f6c90', bg: '#dde8f1', emblem: 'trumpet' },
};
function emblemById(id) {
  const all = [...(window.TEAM_ICONS_1 || []), ...(window.TEAM_ICONS_2 || [])];
  return all.find((e) => e.id === id);
}
function Emblem({ id, cls }) {
  const e = emblemById(id);
  if (!e) return null;
  return <span className={cls || 'mb-av-emblem'}><svg viewBox="0 0 24 24">{e.svg}</svg></span>;
}

const M_TASKS = [
  { id: '142', title: 'Fix terminal reparenting crash on board close', status: 'in_progress', priority: 'high', assignee: M_AV.rhea, subs: [
      { title: 'Audit where terminals get reparented', status: 'completed' },
      { title: 'Make board reparent via registry ref', status: 'in_progress' },
      { title: 'Add regression test for connection loss', status: 'blocked' },
    ], activity: 'working', sessionText: 'fluffy-starlight · editing SessionTerminal.tsx', docs: 2, due: 'Jun 14' },
  { id: '138', title: 'WebSocket pipeline — dedupe session updates', status: 'in_progress', priority: 'medium', assignee: M_AV.kit, activity: 'needsInput', sessionText: 'Alexa coordinator · needs your input' },
  { id: '151', title: 'Add a model-profile indirection layer', status: 'todo', priority: 'medium', assignee: M_AV.rhea, subs: [{ title: 'Define profile config schema', status: 'todo' }, { title: 'Audit current model strings', status: 'completed' }], docs: 1 },
  { id: '149', title: 'Verify Opus 1M spawns with 1M context window', status: 'in_review', priority: 'low' },
  { id: '144', title: 'Migrate task ordering to server persistence', status: 'blocked', priority: 'medium', assignee: M_AV.ada },
  { id: '156', title: 'Voice directives — Alexa coordinator handoff', status: 'todo', priority: 'low' },
];

const M_SESSIONS_LIVE = [
  { id: 's1', name: 'fluffy-starlight', agent: 'claude', status: 'run', statusText: 'Editing SessionTerminal.tsx', elapsed: '4m', live: true, dot: '#7FC08C' },
  { id: 's2', name: 'Alexa coordinator', agent: 'codex', status: 'wait', statusText: 'Needs your input', elapsed: '12m', live: true, dot: '#D9AA49', needs: true },
];
const M_SESSIONS_IDLE = [
  { id: 's3', name: 'concurrent-cosmos', agent: 'gemini', status: 'idle', statusText: 'Idle', elapsed: '1h', live: false, dot: '#A29C8E' },
  { id: 's4', name: 'zesty-wave', agent: 'terminal', status: 'idle', statusText: 'Exited · code 0', elapsed: '3h', live: false, dot: '#A29C8E' },
];

const M_LABEL = { todo: 'Todo', in_progress: 'In progress', in_review: 'In review', completed: 'Completed', cancelled: 'Cancelled', blocked: 'Blocked' };

/* =====================================================================
   STATUS BAR + HEADER
   ===================================================================== */
function StatusBar() {
  return (
    <div className="mb-status">
      <span>9:41</span>
      <span className="mb-status__r">
        <svg viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="11" width="3" height="5" rx="1"/><rect x="5.5" y="8" width="3" height="8" rx="1"/><rect x="10" y="5" width="3" height="11" rx="1" opacity="0.4"/><rect x="14.5" y="2" width="3" height="14" rx="1" opacity="0.4"/></svg>
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 4.5C6 4.5 3.4 5.6 1.5 7.4M9 4.5c3 0 5.6 1.1 7.5 2.9M9 9c1.6 0 3.1.6 4.2 1.7M9 13.5l.01-.01"/></svg>
        <svg viewBox="0 0 26 18" fill="none"><rect x="1" y="3.5" width="21" height="11" rx="3" stroke="currentColor" strokeWidth="1.3" opacity="0.5"/><rect x="2.6" y="5.1" width="16" height="7.8" rx="1.6" fill="currentColor"/><rect x="23.4" y="7" width="1.6" height="4" rx="0.8" fill="currentColor" opacity="0.5"/></svg>
      </span>
    </div>
  );
}

/* =====================================================================
   TASKS
   ===================================================================== */
function TaskCard({ t, onOpen }) {
  const done = t.status === 'completed';
  return (
    <div className={'mb-tcard' + (done ? ' mb-tcard--done' : '')} onClick={() => onOpen(t)}>
      <div className="mb-tcard__main">
        <span className="mb-tcard__stat"><Glyph kind={t.status} size={20} /></span>
        <div className="mb-tcard__body">
          <div className="mb-tcard__title">{t.title}</div>
          <div className="mb-tcard__meta">
            <span className={'mb-pill' + (t.priority === 'high' ? ' mb-pill--high' : t.priority === 'medium' ? ' mb-pill--med' : '')}>{t.priority}</span>
            <span className="mb-meta">#{t.id}</span>
            {t.subs && <span className="mb-meta"><Icon name="listChecks" size={12} />{t.subs.length}</span>}
            {t.docs && <span className="mb-meta"><Icon name="doc" size={12} />{t.docs}</span>}
            {t.assignee && <span className="mb-av" style={{ marginLeft: 'auto', color: t.assignee.color, background: t.assignee.bg }}>{t.assignee.initial}</span>}
          </div>
        </div>
      </div>
      {t.sessionText && (
        <div className="mb-tcard__sub">
          <span className="mb-tcard__subt">
            <Glyph kind={t.activity === 'needsInput' ? 'needsInput' : 'working'} size={14} />
            <span className="mb-tcard__subtext">{t.sessionText}</span>
          </span>
          <span className="mb-tcard__chev"><Icon name="chevronR" size={15} /></span>
        </div>
      )}
    </div>
  );
}

function TasksScreen({ nav }) {
  return (
    <>
      <div className="mb-head">
        <div className="mb-head__title">
          <span className="mb-head__eyebrow">Project</span>
          <span className="mb-head__proj">agent-maestro <Icon name="chevronD" size={13} /></span>
        </div>
        <span className="mb-head__sp"></span>
        <button className="mb-iconbtn" onClick={() => nav.push('board')} title="Board"><Icon name="grid" /></button>
        <button className="mb-iconbtn"><Icon name="sliders" /></button>
      </div>
      <div className="mb-search"><Icon name="search" /><input placeholder="Search tasks" /></div>
      <div className="mb-chips">
        <button className="mb-chip mb-chip--on">All <span className="n">6</span></button>
        <button className="mb-chip">In progress <span className="n">2</span></button>
        <button className="mb-chip">High</button>
        <button className="mb-chip">Mine</button>
        <button className="mb-chip">Blocked <span className="n">1</span></button>
      </div>
      <div className="mb-body">
        <div className="mb-sec"><span className="mb-sec__t">In progress <span className="n">· 2</span></span><span className="mb-sec__line"></span></div>
        {M_TASKS.filter((t) => t.status === 'in_progress').map((t) => <TaskCard key={t.id} t={t} onOpen={(t) => nav.push('taskDetail', t)} />)}
        <div className="mb-sec"><span className="mb-sec__t">Up next <span className="n">· 4</span></span><span className="mb-sec__line"></span></div>
        {M_TASKS.filter((t) => t.status !== 'in_progress').map((t) => <TaskCard key={t.id} t={t} onOpen={(t) => nav.push('taskDetail', t)} />)}
      </div>
      <button className="mb-fab" onClick={() => nav.sheet('createTask')}><Icon name="plus" /></button>
    </>
  );
}

function TaskDetail({ nav, data: t }) {
  const [status, setStatus] = mS(t.status);
  const [danger, setDanger] = mS(false);
  const [worktree, setWorktree] = mS(true);
  return (
    <div className="mb-push">
      <div className="mb-subhead">
        <button className="mb-back" onClick={nav.pop}><Icon name="chevronL" /> Tasks</button>
        <span className="mb-subhead__t">#{t.id}</span>
        <div className="mb-subhead__r"><button className="mb-iconbtn mb-iconbtn--ghost"><Icon name="more" /></button></div>
      </div>
      <div className="mb-body">
        <div className="mb-d">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <button onClick={() => setStatus((s) => s === 'completed' ? 'todo' : 'completed')} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4 }}><Glyph kind={status} size={24} /></button>
            <div className="mb-d__title" style={{ flex: 1 }}>{t.title}</div>
          </div>
          {t.id === '142' && <div className="mb-d__desc">The board reparents <code style={{ fontFamily: 'var(--pn-mono)', fontSize: 13, color: 'var(--pn-brand-2)' }}>[data-terminal-id]</code> while TeamView moves <code style={{ fontFamily: 'var(--pn-mono)', fontSize: 13, color: 'var(--pn-brand-2)' }}>term.element</code>. Route the board through the registry ref, then re-run fit.fit().</div>}

          <div>
            <div className="mb-dlabel">Run this task</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="mb-btn mb-btn--run mb-btn--block" onClick={() => nav.sheet('runConfig')}><Icon name="play" size={15} /> Run</button>
              <button className="mb-btn mb-btn--coord mb-btn--block" onClick={() => nav.sheet('coordConfig')}><Icon name="baton" size={16} /> Coordinate</button>
            </div>
          </div>

          <div className="mb-d__group">
            <div className="mb-d__row"><span className="mb-d__rowlabel">Status</span><span className="mb-d__rowval"><Glyph kind={status} size={15} /> {M_LABEL[status]} <Icon name="chevronR" /></span></div>
            <div className="mb-d__row"><span className="mb-d__rowlabel">Priority</span><span className="mb-d__rowval" style={{ color: t.priority === 'high' ? 'var(--pn-block)' : 'var(--pn-ink)' }}>{t.priority.toUpperCase()} <Icon name="chevronR" /></span></div>
            <div className="mb-d__row"><span className="mb-d__rowlabel">Assignee</span><span className="mb-d__rowval">{t.assignee ? <><span className="mb-av" style={{ width: 22, height: 22, color: t.assignee.color, background: t.assignee.bg }}>{t.assignee.initial}</span> {t.assignee.name}</> : 'Unassigned'} <Icon name="chevronR" /></span></div>
            <div className="mb-d__row"><span className="mb-d__rowlabel">Model</span><span className="mb-d__rowval" style={{ fontFamily: 'var(--pn-mono)', fontSize: 13 }}>opus-4.8 <Icon name="chevronR" /></span></div>
            {t.due && <div className="mb-d__row"><span className="mb-d__rowlabel">Due</span><span className="mb-d__rowval"><span className="mb-meta"><Icon name="clock" size={13} /> {t.due}</span></span></div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="mb-toggle"><span className="mb-toggle__ic" style={danger ? { background: 'var(--pn-block-soft)', color: 'var(--pn-block)' } : null}><Icon name="shield" /></span><div className="mb-toggle__b"><div className="mb-toggle__name">{danger ? 'YOLO mode' : 'Safe mode'}</div><div className="mb-toggle__desc">Auto-approve all tool calls</div></div><button className={'mb-switch mb-switch--danger' + (danger ? ' mb-switch--on' : '')} onClick={() => setDanger((v) => !v)}></button></div>
            <div className="mb-toggle"><span className="mb-toggle__ic" style={worktree ? { background: 'var(--pn-run-soft)', color: 'var(--pn-run)' } : null}><Icon name="gitBranch" /></span><div className="mb-toggle__b"><div className="mb-toggle__name">{worktree ? 'Git worktree' : 'In-place'}</div><div className="mb-toggle__desc">Isolate changes on a branch</div></div><button className={'mb-switch' + (worktree ? ' mb-switch--on' : '')} onClick={() => setWorktree((v) => !v)}></button></div>
          </div>

          {t.subs && (
            <div>
              <div className="mb-dlabel">Subtasks · {t.subs.length}</div>
              <div className="mb-d__group">
                {t.subs.map((s, i) => (
                  <div key={i} className="mb-d__row"><Glyph kind={s.status} size={16} /><span style={{ flex: 1, fontSize: 14, color: s.status === 'completed' ? 'var(--pn-ink-4)' : 'var(--pn-ink)', textDecoration: s.status === 'completed' ? 'line-through' : 'none' }}>{s.title}</span><Icon name="chevronR" size={15} style={{ color: 'var(--pn-ink-4)' }} /></div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-dlabel">Documents · 2</div>
            <div className="mb-d__group">
              <div className="mb-d__row"><Icon name="doc" size={16} style={{ color: 'var(--pn-ink-4)' }} /><span style={{ flex: 1, fontSize: 14 }}>terminal-rendering-analysis.md</span><Icon name="chevronR" size={15} style={{ color: 'var(--pn-ink-4)' }} /></div>
              <div className="mb-d__row"><Icon name="layers" size={16} style={{ color: 'var(--pn-ink-4)' }} /><span style={{ flex: 1, fontSize: 14 }}>reparent-flow diagram</span><Icon name="chevronR" size={15} style={{ color: 'var(--pn-ink-4)' }} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { StatusBar, TasksScreen, TaskDetail, Emblem, emblemById, M_AV, M_TASKS, M_SESSIONS_LIVE, M_SESSIONS_IDLE, M_LABEL });
