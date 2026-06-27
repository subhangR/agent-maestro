/* m-screens.jsx — the four primary screens + their rows.
   Reads primitives + tiles + data from window (separate babel scopes). */
const { useState } = React;

/* ---------------- SESSIONS (home) ---------------- */
function SessionsScreen({ onOpen, onSpawn }) {
  return (
    <div className="m-screen">
      <div className="m-title">
        <h1>Sessions</h1>
        <div className="m-title__sub"><span className="m-dot m-dot--run"></span> 4 running <b>·</b> 1 needs input <b>·</b> 2 idle</div>
      </div>

      <div className="m-spawn">
        <button className="m-chip" onClick={() => onSpawn('Terminal')}><span className="m-plus">＋</span> Terminal</button>
        <button className="m-chip" onClick={() => onSpawn('Claude')}><img src={M_AGENT_SRC.claude} alt="" /> Claude</button>
        <button className="m-chip" onClick={() => onSpawn('Codex')}><img src={M_AGENT_SRC.codex} alt="" /> Codex</button>
        <button className="m-chip" onClick={() => onSpawn('Gemini')}><img src={M_AGENT_SRC.gemini} alt="" /> Gemini</button>
      </div>

      <div className="m-sec"><span className="m-sec__lbl">Running <span className="m-count">· 4</span></span><span className="m-sec__line"></span></div>
      <div className="m-team">
        <div className="m-team__head">
          <span className="m-team__dot" style={{ background: TEAM.dot }}></span>
          <span className="m-team__name">{TEAM.name}</span>
          <span className="m-team__count">{TEAM.count} sessions</span>
        </div>
        <MSessionTile s={TEAM.coord} />
      </div>

      <div className="m-sec"><span className="m-sec__lbl">Idle <span className="m-count">· 2</span></span><span className="m-sec__line"></span></div>
      {SESSIONS_IDLE.map((s) => <MSessionTile key={s.id} s={s} />)}
      <div className="m-bottompad"></div>
    </div>
  );
}

/* ---------------- TASKS ---------------- */
function TasksScreen({ onNewTask }) {
  const [tab, setTab] = useState('current');
  const [filter, setFilter] = useState('All');
  const sections = tab === 'done'
    ? [['Completed', TASKS_DONE.length, TASKS_DONE]]
    : tab === 'pinned'
      ? [['Pinned', 1, TASKS_IN_PROGRESS.filter((t) => t.pinned)]]
      : [['In progress', TASKS_IN_PROGRESS.length, TASKS_IN_PROGRESS], ['Up next', TASKS_UP_NEXT.length, TASKS_UP_NEXT]];
  return (
    <div className="m-screen">
      <div className="m-title">
        <h1>Tasks</h1>
        <div className="m-title__sub">agent-maestro <b>·</b> 6 open <b>·</b> 8 done</div>
      </div>

      <div className="m-actionbar">
        <button className="m-btn m-btn--primary" onClick={onNewTask}><Icon name="plus" size={16} /> New task</button>
        <button className="m-btn" aria-label="Sort"><Icon name="sliders" size={17} /></button>
      </div>

      <div className="m-subtabs">
        <button className={'m-subtab' + (tab === 'current' ? ' m-subtab--active' : '')} onClick={() => setTab('current')}><Icon name="listChecks" /> 6</button>
        <button className={'m-subtab' + (tab === 'pinned' ? ' m-subtab--active' : '')} onClick={() => setTab('pinned')}><Icon name="pin" /> 1</button>
        <button className={'m-subtab' + (tab === 'done' ? ' m-subtab--active' : '')} onClick={() => setTab('done')}><Icon name="check" /> 8</button>
        <button className="m-subtab" aria-label="Archived"><Icon name="archive" /></button>
      </div>

      <div className="m-filters">
        {['All', 'High', 'Mine'].map((f) => (
          <button key={f} className={'m-filter' + (filter === f ? ' m-filter--active' : '')} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {sections.map(([label, count, list]) => (
        <React.Fragment key={label}>
          <div className="m-sec"><span className="m-sec__lbl">{label} <span className="m-count">· {count}</span></span><span className="m-sec__line"></span></div>
          {list.map((t) => <MTaskTile key={t.id} t={t} />)}
        </React.Fragment>
      ))}
      <div className="m-bottompad"></div>
    </div>
  );
}

/* ---------------- MEMBERS ---------------- */
function MembersScreen({ notify, onNewMember, onEditMember }) {
  return (
    <div className="m-screen">
      <div className="m-title">
        <h1>Members</h1>
        <div className="m-title__sub">4 members <b>·</b> 2 active</div>
      </div>
      <div className="m-actionbar">
        <button className="m-btn m-btn--primary" onClick={onNewMember}><Icon name="plus" size={16} /> New member</button>
        <button className="m-btn" aria-label="New team" onClick={() => notify('New team')}><Icon name="team" size={17} /></button>
      </div>
      {MEMBER_LIST.map((m) => (
        <button key={m.name} className="m-mcard" onClick={() => onEditMember && onEditMember(m)}>
          <span className="m-mav" style={{ color: m.color, background: m.bg }}>{m.initial}</span>
          <div className="m-mcard__body">
            <div className="m-mcard__top">
              <span className="m-mcard__name">{m.name}</span>
              <span className={'m-mcard__role' + (m.role === 'Coordinator' ? ' m-mcard__role--coord' : '')}>{m.role}</span>
            </div>
            <div className="m-mcard__meta">
              <span className="m-dot-wrap"><span className={'m-dot m-dot--' + (m.status === 'working' ? 'run' : 'idle') + (m.status === 'working' ? ' m-dot--live' : '')}></span></span>
              <span className="m-mcard__model">{m.model}</span>
              <span className="m-mcard__model">· {m.sessions} live · {m.tasks} tasks</span>
            </div>
            <div className="m-mcard__say">{m.say}</div>
          </div>
          <span className="m-mcard__chev"><Icon name="chevronR" /></span>
        </button>
      ))}
      <div className="m-bottompad"></div>
    </div>
  );
}

/* ---------------- MORE ---------------- */
function MoreScreen({ dark, onToggleDark, notify }) {
  const mdCount = window.DOCS.filter((d) => !window.isDiagramDoc(d)).length;
  const dgCount = window.DOCS.filter((d) => window.isDiagramDoc(d)).length;
  const Row = ({ icon, label, n, onClick }) => (
    <button className="m-lrow" onClick={onClick || (() => notify(label))}>
      <span className="m-lrow__ic"><Icon name={icon} /></span>
      <span className="m-lrow__lbl">{label}</span>
      {n != null && <span className="m-lrow__n">{n}</span>}
      <span className="m-lrow__chev"><Icon name="chevronR" /></span>
    </button>
  );
  return (
    <div className="m-screen">
      <div className="m-title"><h1>More</h1></div>

      <div className="m-sec"><span className="m-sec__lbl">Workspace</span><span className="m-sec__line"></span></div>
      <div className="m-group">
        <Row icon="team" label="Teams" n="3" />
        <Row icon="sparkles" label="Skills & spells" n="12" />
        <Row icon="doc" label="Docs" n={mdCount} onClick={() => MUI.openDocs('markdown')} />
        <Row icon="pen" label="Diagrams" n={dgCount} onClick={() => MUI.openDocs('diagram')} />
        <Row icon="inbox" label="Lists" n="2" />
        <Row icon="folder" label="Files" />
      </div>

      <div className="m-sec"><span className="m-sec__lbl">Session</span><span className="m-sec__line"></span></div>
      <div className="m-group">
        <Row icon="layers" label="Resources" />
        <Row icon="graph" label="Whiteboard" onClick={() => MUI.openDocs('diagram')} />
        <Row icon="film" label="Recordings" n="5" />
      </div>

      <div className="m-sec"><span className="m-sec__lbl">App</span><span className="m-sec__line"></span></div>
      <div className="m-group">
        <button className="m-lrow" onClick={onToggleDark}>
          <span className="m-lrow__ic"><Icon name={dark ? 'sun' : 'moon'} /></span>
          <span className="m-lrow__lbl">Dark mode</span>
          <span className={'m-switch' + (dark ? ' m-switch--on' : '')}><span className="m-switch__knob"></span></span>
        </button>
        <Row icon="bell" label="Notifications" />
        <Row icon="settings" label="Settings" />
        <Row icon="info" label="About Maestro" />
      </div>
      <div className="m-bottompad"></div>
    </div>
  );
}

Object.assign(window, { SessionsScreen, TasksScreen, MembersScreen, MoreScreen });
