/* m-tiles.jsx — mobile Task & Session tiles, translated from the desktop kit.
   Carries the full desktop depth: multi-level trees (expand/collapse), a tap-to-
   open detail panel, inline editors (status / priority / assignee / model / mode)
   that open as bottom-sheet pickers via window.MUI, selection + done state, and
   linked-task / doc chips. Exports MTaskNode + MSessionNode to window. */
const { useState: useStateT } = React;

const M_TASK_LABEL = window.TASK_STATUS_LABEL;
const M_SESS_LABEL = window.SESS_STATUS_LABEL;

/* ---- inline editable badge → opens an app-level picker sheet ---- */
function MBadge({ kind, label, glyph, avatars, model, caret = true, onTap, tone }) {
  return (
    <button className={'m-badge' + (tone ? ' m-badge--' + tone : '') + (model ? ' m-badge--model' : '')} onClick={(e) => { e.stopPropagation(); onTap && onTap(); }}>
      {glyph && <Glyph kind={glyph} size={13} />}
      {avatars && avatars.length > 0 && <Avatars list={avatars} />}
      <span className="m-badge__t">{label}</span>
      {caret && <Icon name="chevronD" size={11} className="m-badge__caret" />}
    </button>
  );
}

/* picker option builders */
const statusOpts = () => window.TASK_STATUSES.map((s) => ({ value: s, label: M_TASK_LABEL[s], glyph: s }));
const prioOpts = () => window.PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }));
const modelOpts = () => window.MODELS.map((m) => ({ value: m, label: m }));
const modeOpts = () => window.MODES.map((m) => ({ value: m, label: m }));
const memberOpts = () => window.ALL_MEMBERS.map((m) => ({ value: m.name, label: m.name, avatar: m }));

/* =========================== TASK TILE =========================== */
function MTaskTile({ t, depth = 0 }) {
  const [status, setStatus] = useStateT(t.status);
  const [priority, setPriority] = useStateT(t.priority || 'medium');
  const [assignees, setAssignees] = useStateT(t.assignees || []);
  const [model, setModel] = useStateT(t.model || 'default');
  const [danger, setDanger] = useStateT(!!t.danger);
  const [worktree, setWorktree] = useStateT(!!t.worktree);
  const [collapsed, setCollapsed] = useStateT(depth > 0);
  const [open, setOpen] = useStateT(false);

  const hasKids = t.subs && t.subs.length > 0;
  const done = status === 'completed';
  const prioCls = priority === 'high' ? 'high' : priority === 'medium' ? 'med' : 'low';
  const runCfg = () => ({ title: t.title, model, danger, worktree, assignees, tool: t.tool });

  const toggleAssignee = (name) => setAssignees((prev) => {
    const m = window.ALL_MEMBERS.find((x) => x.name === name);
    return prev.some((x) => x.name === name) ? prev.filter((x) => x.name !== name) : [...prev, m];
  });

  return (
    <div className={'m-tt' + (t.active ? ' m-tt--active' : '') + (done ? ' m-tt--done' : '')}>
      <div className="m-tt__main">
        <button className={'m-tt__arrow' + (hasKids ? '' : ' m-tt__arrow--empty') + (hasKids && !collapsed ? ' m-tt__arrow--open' : '')}
          onClick={() => hasKids && setCollapsed((c) => !c)} aria-label="Toggle subtasks">
          <Icon name="chevronR" />
        </button>
        {hasKids && <span className="m-tt__count">{t.subs.length}</span>}
        <button className="m-tt__glyph" onClick={() => setStatus((s) => s === 'completed' ? 'todo' : 'completed')} aria-label="Toggle complete">
          <Glyph kind={done ? 'completed' : status} size={18} />
        </button>
        <button className="m-tt__titlebtn" onClick={() => setOpen((v) => !v)}>
          <span className="m-tt__title">{t.pinned && <Icon name="pin" size={12} className="m-pin" />}{t.title}</span>
          <span className="m-tt__sub">
            <span className="m-tag-wrap"><span className={'m-tag m-tag--' + prioCls}>{priority === 'medium' ? 'med' : priority}</span></span>
            <span className="m-tt__id">#{t.id}{hasKids ? ` · ${t.subs.length}` : ''}</span>
            {assignees.length > 0 && <Avatars list={assignees} />}
            {t.docs > 0 && <span className="m-mini"><Icon name="doc" size={12} />{t.docs}</span>}
          </span>
        </button>
        <span className="m-tt__trail">
          {t.activity && <Glyph kind={t.activity} size={15} />}
          <button className="m-tt__run" onClick={(e) => { e.stopPropagation(); MUI.openRun(runCfg()); }} aria-label="Run task"><Icon name="play" size={13} /></button>
          <span className={'m-tt__exp' + (open ? ' m-tt__exp--open' : '')}><Icon name="chevronD" size={15} /></span>
        </span>
      </div>

      {open && (
        <div className="m-tt__meta">
          <div className="m-metarow">
            <MBadge glyph={status} label={M_TASK_LABEL[status]} tone={'status-' + status}
              onTap={() => MUI.openPicker({ title: 'Status', current: status, options: statusOpts(), onSelect: setStatus })} />
            <MBadge label={priority.toUpperCase()} tone={priority === 'high' ? 'prio-high' : null}
              onTap={() => MUI.openPicker({ title: 'Priority', current: priority, options: prioOpts(), onSelect: setPriority })} />
            <MBadge avatars={assignees} label={assignees.length ? (assignees.length > 1 ? assignees.length + ' members' : assignees[0].name) : 'Assign'}
              onTap={() => MUI.openPicker({ title: 'Assignees', current: assignees.map((a) => a.name), multi: true, options: memberOpts(), onToggle: toggleAssignee })} />
            <MBadge model label={model} tone={model !== (t.model || 'default') ? 'override' : null}
              onTap={() => MUI.openPicker({ title: 'Model', current: model, options: modelOpts(), onSelect: setModel })} />
          </div>
          <div className="m-metarow">
            <button className={'m-toggle' + (danger ? ' m-toggle--danger' : '')} onClick={() => setDanger((v) => !v)}><Icon name="shield" size={13} /> {danger ? 'YOLO' : 'Safe'}</button>
            <button className={'m-toggle' + (worktree ? ' m-toggle--wt' : '')} onClick={() => setWorktree((v) => !v)}><Icon name="gitBranch" size={13} /> {worktree ? 'worktree' : 'in-place'}</button>
            {t.due && <span className="m-mini"><Icon name="calendar" size={12} /> {t.due}</span>}
            <span className="m-metatime">updated {t.updated || 'just now'}</span>
          </div>
          {t.sessions && <div className="m-metarow">{t.sessions.map((s, i) => <span key={i} className={'m-actchip m-actchip--' + s.kind}><Glyph kind={s.kind === 'needsInput' ? 'needsInput' : s.kind} size={11} /> {s.label}</span>)}</div>}
          {(t.docList || t.diagrams) && (
            <div className="m-metarow">
              {t.docList && t.docList.map((d, i) => <button key={'d' + i} className="m-docpill" onClick={() => MUI.openDoc(d)}><span className="m-docpill__ic">{d.md ? 'M↓' : '{}'}</span><span className="m-docpill__t">{d.name}</span></button>)}
              {t.diagrams && t.diagrams.map((d, i) => <button key={'g' + i} className="m-docpill m-docpill--dg" onClick={() => MUI.openDoc(d)}><span className="m-docpill__ic">⬡</span><span className="m-docpill__t">{d.name}</span></button>)}
              <button className="m-docpill m-docpill--add" onClick={() => MUI.notify('Attach doc')}><Icon name="plus" size={11} /> Doc</button>
            </div>
          )}
          <div className="m-metarow">
            <button className="m-metabtn m-metabtn--run" onClick={() => MUI.openRun(runCfg())}><Icon name="play" size={13} /> Run task</button>
            <button className="m-metabtn" onClick={() => MUI.notify('Add subtask')}><Icon name="plus" size={13} /> Subtask</button>
          </div>
        </div>
      )}

      {hasKids && !collapsed && (
        <div className="m-kids">
          {t.subs.map((s) => <MTaskTile key={s.id} t={s} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

/* =========================== SESSION TILE =========================== */
function MSessionTile({ s, depth = 0 }) {
  const [mode, setMode] = useStateT(s.mode || 'Worker');
  const [done, setDone] = useStateT(!!s.humanDone);
  const [collapsed, setCollapsed] = useStateT(false);
  const [open, setOpen] = useStateT(false);

  const hasKids = s.children && s.children.length > 0;
  const live = s.live;
  const statusKind = s.needsInput ? 'needsInput' : s.status === 'run' ? 'working' : s.status;

  return (
    <div className={'m-st' + (s.active ? ' m-st--selected' : '') + (s.needsInput ? ' m-st--wait' : '') + (s.exited ? ' m-st--exited' : '')}>
      <div className="m-st__main">
        <button className={'m-st__arrow' + (hasKids ? '' : ' m-st__arrow--empty') + (hasKids && !collapsed ? ' m-st__arrow--open' : '')}
          onClick={() => hasKids && setCollapsed((c) => !c)} aria-label="Toggle spawned sessions">
          <Icon name="chevronR" />
        </button>
        {hasKids && <span className="m-st__count">{s.children.length}</span>}
        {s.exited
          ? <span className="m-st__radio m-st__radio--archived"><Glyph kind="archived" size={13} /></span>
          : <button className={'m-st__radio' + (done ? ' m-st__radio--on' : '')} onClick={() => setDone((v) => !v)} aria-label="Mark done">{done && <Icon name="check" size={10} sw={2.2} />}</button>}
        <button className="m-st__titlebtn" onClick={() => MUI.openTerminal(s)}>
          <AgentTile kind={s.kind} />
          <span className="m-st__titlecol">
            <span className="m-st__name">{s.name}{done && !s.exited && <span className="m-st__donetag">done</span>}</span>
            <span className="m-st__statusline">
              {live ? <span className="m-dot-wrap"><span className={'m-dot m-dot--' + s.status + ' m-dot--live'}></span></span> : <span className={'m-dot m-dot--' + s.status}></span>}
              <span className={'m-st__statustext' + (s.status === 'run' ? ' m-st__statustext--run' : s.status === 'wait' ? ' m-st__statustext--wait' : '')}>{s.statusText}</span>
            </span>
          </span>
        </button>
        <span className="m-st__trail">
          {s.docs > 0 && <span className="m-mini"><Icon name="doc" size={12} />{s.docs}</span>}
          <span className="m-st__statusglyph"><Glyph kind={statusKind} size={16} /></span>
          <button className={'m-st__exp' + (open ? ' m-st__exp--open' : '')} onClick={() => setOpen((v) => !v)} aria-label="Details"><Icon name="chevronD" size={15} /></button>
        </span>
      </div>

      {s.tasklines && <div className="m-st__tasklines">{s.tasklines.map((tl, i) => <div key={i} className="m-st__taskline"><Glyph kind={tl.status} size={13} /><span className="m-st__tasklineLabel">{tl.title}</span></div>)}</div>}

      {open && (
        <div className="m-st__meta">
          <div className="m-metasec">
            <span className="m-metalabel">Status</span>
            <div className="m-metacontent">
              <span className={'m-badge m-badge--status-' + statusKind}><Glyph kind={statusKind} size={12} /> {(M_SESS_LABEL[s.status] || s.status).toUpperCase()}</span>
              <MBadge label={mode} onTap={() => MUI.openPicker({ title: 'Mode', current: mode, options: modeOpts(), onSelect: setMode })} />
              {s.model && <span className="m-badge m-badge--model">{s.model.toUpperCase()}</span>}
              {s.strategy && <span className="m-badge">{s.strategy}</span>}
              {s.worktree && <span className="m-badge"><Icon name="gitBranch" size={11} /> {s.worktree}</span>}
              <span className="m-metatime">{s.elapsed || 'live'}</span>
            </div>
          </div>
          {s.taskchips && <div className="m-metasec"><span className="m-metalabel">Tasks</span><div className="m-metacontent">{s.taskchips.map((tc, i) => <span key={i} className="m-taskchip"><Glyph kind={tc.status} size={12} /><span className="t">{tc.title}</span></span>)}</div></div>}
          {s.docList && <div className="m-metasec"><span className="m-metalabel">Docs</span><div className="m-metacontent">{s.docList.map((d, i) => <button key={i} className="m-docpill" onClick={() => MUI.openDoc(d)}><span className="m-docpill__ic">{d.md ? 'M↓' : '{}'}</span><span className="m-docpill__t">{d.name}</span></button>)}</div></div>}
          {s.diagrams && <div className="m-metasec"><span className="m-metalabel">Diagrams</span><div className="m-metacontent">{s.diagrams.map((d, i) => <button key={i} className="m-docpill m-docpill--dg" onClick={() => MUI.openDoc(d)}><span className="m-docpill__ic">⬡</span><span className="m-docpill__t">{d.name}</span></button>)}</div></div>}
          <div className="m-metasec"><span className="m-metalabel">Actions</span><div className="m-metacontent">
            <button className="m-metabtn" onClick={() => MUI.openTerminal(s)}><Icon name="terminal" size={13} /> Open</button>
            {!live && !s.exited && <button className="m-metabtn" onClick={() => MUI.notify('Resume ' + s.name)}><Icon name="refresh" size={13} /> Resume</button>}
            <button className="m-metabtn" onClick={() => MUI.notify('Copied @' + s.name)}><Icon name="copy" size={13} /> Copy ref</button>
            {!s.exited && <button className="m-metabtn m-metabtn--danger" onClick={() => MUI.notify('Close ' + s.name)}><Icon name="x" size={13} /> Close</button>}
          </div></div>
        </div>
      )}

      {hasKids && !collapsed && (
        <div className="m-kids m-kids--st">
          {s.children.map((c) => <MSessionTile key={c.id} s={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { MTaskTile, MSessionTile, MBadge });
