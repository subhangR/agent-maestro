/* m-overlays.jsx — now-playing strip + terminal sheet + command/project sheets. */
const { useState: useStateO } = React;

/* model label per agent kind */
function modelFor(kind) {
  return { claude: 'claude · opus-4.8', codex: 'codex-1', gemini: 'gemini-2.5-pro', terminal: 'zsh' }[kind] || 'claude';
}

/* ---------------- NOW PLAYING strip ---------------- */
function NowPlaying({ session, onOpen }) {
  if (!session) return null;
  return (
    <button className="m-np" onClick={() => onOpen(session)}>
      <span className="m-np__tile"><img src={M_AGENT_SRC[session.kind]} alt="" /></span>
      <div className="m-np__body">
        <div className="m-np__name">{session.name}</div>
        <div className="m-np__say">{session.say}<span className="m-tcursor"></span></div>
      </div>
      <span className="m-np__live"></span>
      <span className="m-np__gauge"><Gauge pct={session.ctx || 24} size={26} /></span>
      <span className="m-np__up"><Icon name="chevronUp" /></span>
    </button>
  );
}

/* ---------------- TERMINAL SHEET ---------------- */
function richTranscript() {
  return (
    <>
      <div><span className="l-prompt">›</span> Analyzing terminal reparenting in <span className="l-file">AppWorkspace.tsx</span></div>
      <div className="l-dim">&nbsp;&nbsp;Read SessionTerminal.tsx · MultiProjectSessionsView.tsx</div>
      <div className="l-block"><span className="l-acc">●</span> The board moves <span className="l-file">[data-terminal-id]</span> — the React-owned</div>
      <div className="l-dim">&nbsp;&nbsp;container — while TeamView moves <span className="l-file">term.element</span>. They disagree.</div>
      <div className="l-block"><span className="l-acc">●</span> Editing <span className="l-file">MultiProjectSessionsView.tsx</span></div>
      <div className="l-ok">&nbsp;&nbsp;+ reparent registry.current.get(session.id)?.term.element</div>
      <div className="l-ok">&nbsp;&nbsp;+ re-run fit.fit() after the move</div>
      <div className="l-block"><span className="l-ok">✓</span> <span className="l-dim">Integration tests — 14 of 18 passing</span></div>
      <div className="l-block"><span className="l-prompt">›</span> Reparenting the terminal node, then I'll re-run the fit<span className="m-tcursor2"></span></div>
    </>
  );
}
function waitTranscript(s) {
  return (
    <>
      <div><span className="l-prompt">›</span> Building the model-profile indirection layer</div>
      <div className="l-dim">&nbsp;&nbsp;Read constants/models.ts · spawn/resolveModel.ts</div>
      <div className="l-block"><span className="l-acc">●</span> Two profiles can resolve to the same model. Need a default.</div>
      <div className="l-block" style={{ color: '#d9aa49' }}>⏸ {s.say}</div>
      <div className="l-dim">&nbsp;&nbsp;Waiting for your reply…<span className="m-tcursor2"></span></div>
    </>
  );
}
function idleTranscript(s) {
  return (
    <>
      <div><span className="l-prompt">›</span> {s.say}</div>
      <div className="l-block l-dim">— session ended. Resume to attach a live terminal again.</div>
    </>
  );
}

function TerminalSheet({ session, onClose, notify }) {
  const [closing, setClosing] = useStateO(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  if (!session) return null;

  const live = session.live;
  const isActive = session.id === 's-fluffy';
  const isWait = session.status === 'wait';
  const branch = isActive ? 'fix/terminal-reparent' : isWait ? 'feat/model-profile' : '—';

  return (
    <>
      <div className={'m-scrim' + (closing ? ' m-scrim--out' : '')} onClick={close}></div>
      <div className={'m-term' + (closing ? ' m-term--out' : '')}>
        <div className="m-term__bar">
          <button className="m-term__down" onClick={close}><Icon name="chevronD" /></button>
          <div className="m-term__title">
            {live && <span className="m-tdot"></span>}
            <span className="m-term__name">{session.name}</span>
            <span className="m-term__model">· {modelFor(session.kind)}</span>
          </div>
          <button className="m-term__ib" onClick={() => notify('Session menu')}><Icon name="more" /></button>
        </div>
        <div className="m-term__branch"><Icon name="gitBranch" /> {branch} {live && <span style={{ marginLeft: 'auto', color: '#5aa777' }}>● live</span>}</div>

        <div className="m-term__body">
          {isActive ? richTranscript() : isWait ? waitTranscript(session) : idleTranscript(session)}
        </div>

        {live && (
          <div className="m-tstrip">
            <button className="m-tstrip__log" onClick={() => notify('Session log')}>
              <Icon name="chevronR" size={13} /> Log
              <span className="m-tstrip__live"><span className="m-tstrip__livedot"></span><span className="m-tstrip__livetag">LIVE</span></span>
            </button>
            <span className="m-tstrip__div"></span>
            <span className="m-tstrip__stat m-tstrip__stat--amber"><span className="v">⚡{ACTIVE.cache}%</span><span className="k">cache</span></span>
            <span className="m-tstrip__stat"><span className="v">{ACTIVE.ctxTokens}</span><span className="k">ctx {ACTIVE.ctxPct}%</span></span>
            <span className="m-tstrip__stat"><span className="v">{ACTIVE.turns}</span><span className="k">turns</span></span>
            <span className="m-tstrip__stat"><span className="v">{ACTIVE.tools}</span><span className="k">tools</span></span>
            <span className="m-tstrip__stat"><span className="v">{ACTIVE.duration}</span><span className="k">elapsed</span></span>
          </div>
        )}

        {live ? (
          <div className="m-term__input">
            <div className="m-term__field"><span className="m-tslash">›</span> {isWait ? 'Answer ' + session.name + '…' : 'Reply to ' + session.name + '…'}</div>
            <button className="m-term__send" onClick={() => notify('Sent')}><Icon name="arrowUp" sw={2} /></button>
          </div>
        ) : (
          <div className="m-term__input">
            <button className="m-term__field" style={{ justifyContent: 'center', color: '#e6e0d3', cursor: 'pointer' }} onClick={() => notify('Resuming ' + session.name)}>
              <Icon name="refresh" /> Resume session
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- bottom sheet shell ---------------- */
function BottomSheet({ title, onClose, children, raise }) {
  const [closing, setClosing] = useStateO(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  return (
    <>
      <div className={'m-scrim' + (raise ? ' m-scrim--raise' : '') + (closing ? ' m-scrim--out' : '')} onClick={close}></div>
      <div className={'m-sheet' + (raise ? ' m-sheet--raise' : '') + (closing ? ' m-sheet--out' : '')}>
        <div className="m-sheet__grab"></div>
        {title && <div className="m-sheet__title">{title}</div>}
        <div className="m-sheet__scroll">{typeof children === 'function' ? children(close) : children}</div>
      </div>
    </>
  );
}

/* ---------------- COMMAND SHEET ---------------- */
function CommandSheet({ onClose, notify }) {
  const opt = (close, icon, img, lbl, sub, kbd, action) => (
    <button className="m-cmd__row" onClick={() => { if (action) { action(); } else { notify(lbl); close(); } }}>
      <span className="m-cmd__ic">{img ? <img src={img} alt="" /> : <Icon name={icon} />}</span>
      <div className="m-cmd__body"><div className="m-cmd__lbl">{lbl}</div><div className="m-cmd__sub">{sub}</div></div>
      {kbd && <span className="m-cmd__kbd">{kbd}</span>}
    </button>
  );
  return (
    <BottomSheet title="Conduct" onClose={onClose}>
      {(close) => (
        <div className="m-cmd">
          {opt(close, 'plus', null, 'New task', 'Add a task to the queue', 'N', () => MUI.openSheet('createTask'))}
          {opt(close, null, M_AGENT_SRC.claude, 'Spawn Claude', 'Worker or orchestrator')}
          {opt(close, null, M_AGENT_SRC.codex, 'Spawn Codex', 'OpenAI agent')}
          {opt(close, null, M_AGENT_SRC.gemini, 'Spawn Gemini', 'Google agent')}
          {opt(close, 'terminal', null, 'New terminal', 'Plain tmux session')}
          {opt(close, 'users', null, 'New team member', 'Add an agent persona', null, () => MUI.openSheet('newMember'))}
          {opt(close, 'team', null, 'New team', 'Group workers under a coordinator')}
          {opt(close, 'spell', null, 'Cast spell', 'Inject a contextual prompt')}
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------------- PROJECT SWITCHER ---------------- */
function ProjectSheet({ onClose, notify }) {
  return (
    <BottomSheet title="Projects" onClose={onClose}>
      {(close) => (
        <div style={{ paddingBottom: 4 }}>
          <button className="m-projrow" style={{ borderTop: 'none' }} onClick={() => close()}>
            <span className="m-dot m-dot--run"></span>
            <span className="m-projrow__name">agent-maestro</span>
            <span className="m-projrow__meta">4 sessions</span>
            <span style={{ color: 'var(--pn-brand)', display: 'grid', placeItems: 'center' }}><Icon name="check" sw={2} /></span>
          </button>
          <button className="m-projrow" onClick={() => { notify('voice-alexa'); close(); }}>
            <span className="m-dot m-dot--run"></span>
            <span className="m-projrow__name">voice-alexa</span>
            <span className="m-projrow__meta">2 sessions</span>
          </button>
          <button className="m-projrow" onClick={() => { notify('All projects'); close(); }}>
            <span className="m-dot m-dot--idle"></span>
            <span className="m-projrow__name">design-tokens</span>
            <span className="m-projrow__meta">idle</span>
          </button>
          <button className="m-projrow" onClick={() => { notify('New project'); close(); }}>
            <span style={{ color: 'var(--pn-ink-3)', display: 'grid', placeItems: 'center', width: 7 }}><Icon name="plus" /></span>
            <span className="m-projrow__name" style={{ color: 'var(--pn-ink-2)' }}>New project</span>
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------------- PICKER SHEET (mobile translation of the desktop dropdown) ---------------- */
function PickerSheet({ config, onClose, notify }) {
  const [sel, setSel] = useStateO(config.multi ? (config.current || []) : config.current);
  if (!config) return null;
  const isCur = (v) => config.multi ? sel.includes(v) : sel === v;
  const pick = (close, v) => {
    if (config.multi) {
      config.onToggle && config.onToggle(v);
      setSel((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
    } else {
      config.onSelect && config.onSelect(v);
      close();
    }
  };
  return (
    <BottomSheet title={config.title} onClose={onClose} raise>
      {(close) => (
        <div className="m-picker">
          {config.options.map((o) => (
            <button key={o.value} className={'m-picker__row' + (isCur(o.value) ? ' m-picker__row--cur' : '')} onClick={() => pick(close, o.value)}>
              {o.glyph && <Glyph kind={o.glyph} size={16} />}
              {o.avatar && <Avatar a={o.avatar} />}
              <span className="m-picker__lbl">{o.label}</span>
              {isCur(o.value) && <Icon name="check" size={15} sw={2} className="m-picker__chk" />}
            </button>
          ))}
          {config.multi && <button className="m-picker__done" onClick={close}>Done</button>}
        </div>
      )}
    </BottomSheet>
  );
}

/* ---------------- FORM SHEET shell (header / scroll body / sticky footer) ---------------- */
function FormSheet({ onClose, children }) {
  const [closing, setClosing] = useStateO(false);
  const close = () => { setClosing(true); setTimeout(onClose, 300); };
  return (
    <>
      <div className={'m-scrim' + (closing ? ' m-scrim--out' : '')} onClick={close}></div>
      <div className={'m-formsheet' + (closing ? ' m-sheet--out' : '')}>
        <div className="m-sheet__grab"></div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </>
  );
}

function FTabs({ tabs, tab, setTab }) {
  return (
    <div className="m-ftabs">
      {tabs.map(([id, label, icon, n]) => (
        <button key={id} className={'m-ftab' + (tab === id ? ' m-ftab--active' : '')} onClick={() => setTab(id)}>
          <Icon name={icon} size={14} /> {label}{n != null && <span className="m-ftab__n">{n}</span>}
        </button>
      ))}
    </div>
  );
}

/* settings-list primitives (iOS-style grouped rows) */
function SetRow({ icon, label, children, onTap, last }) {
  return (
    <button className={'m-setrow' + (last ? ' m-setrow--last' : '') + (onTap ? '' : ' m-setrow--static')} onClick={onTap} disabled={!onTap}>
      {icon && <span className="m-setrow__ic"><Icon name={icon} size={16} /></span>}
      <span className="m-setrow__lbl">{label}</span>
      <span className="m-setrow__val">{children}</span>
      {onTap && <Icon name="chevronR" size={15} className="m-setrow__chev" />}
    </button>
  );
}
function SetSwitch({ icon, label, desc, on, onToggle, last }) {
  return (
    <button className={'m-setrow' + (last ? ' m-setrow--last' : '')} onClick={onToggle}>
      {icon && <span className="m-setrow__ic"><Icon name={icon} size={16} /></span>}
      <span className="m-setrow__txt"><span className="m-setrow__lbl">{label}</span>{desc && <span className="m-setrow__desc">{desc}</span>}</span>
      <span className={'m-switch m-switch--sm' + (on ? ' m-switch--on' : '')}><span className="m-switch__knob"></span></span>
    </button>
  );
}

/* ---------------- CREATE TASK ---------------- */
function CreateTaskSheet({ onClose, notify }) {
  const [priority, setPriority] = useStateO('high');
  const [worktree, setWorktree] = useStateO(true);
  const [danger, setDanger] = useStateO(false);
  const [model, setModel] = useStateO('opus-4.8');
  const [assignees, setAssignees] = useStateO([window.MEMBERS.rhea]);
  const pdot = { high: 'var(--pn-block)', medium: 'var(--pn-wait)', low: 'var(--pn-idle)' };
  const plabel = (p) => p === 'medium' ? 'Medium' : p[0].toUpperCase() + p.slice(1);
  const toggleAssignee = (name) => setAssignees((prev) => {
    const m = window.ALL_MEMBERS.find((x) => x.name === name);
    return prev.some((x) => x.name === name) ? prev.filter((x) => x.name !== name) : [...prev, m];
  });
  return (
    <FormSheet onClose={onClose}>
      {(close) => (
        <>
          <div className="m-fhead">
            <div className="m-fcrumb"><Icon name="listChecks" size={12} /> <b>agent-maestro</b> <Icon name="chevronR" size={10} /> New task</div>
            <button className="m-fclose" onClick={close}><Icon name="x" /></button>
            <input className="m-ftitle" placeholder="Untitled task" defaultValue="Fix terminal reparenting crash on board close" />
          </div>

          <div className="m-fbody m-fbody--text">
            <textarea className="m-textarea m-textarea--full" placeholder="Describe the task — type @ to reference a file, # to pull in a skill." defaultValue={"The board reparents [data-terminal-id]; TeamView moves term.element. Make the board reparent via the registry ref instead, then re-run fit.fit().\n\nKeep the diff surgical — touch only the reparent path and re-run fit.fit() once after the move."}></textarea>
            <div className="m-chiprow m-chiprow--text">
              <button className="m-mchip" onClick={() => notify('Attach')}><Icon name="paperclip" size={13} /> Attach</button>
              <button className="m-mchip" onClick={() => notify('Reference')}><Icon name="at" size={13} /> Reference</button>
              <button className="m-mchip" onClick={() => notify('Skill')}><Icon name="hash" size={13} /> Skill</button>
              <span className="m-mchip m-mchip--ref"><Icon name="doc" size={12} /> terminal-rendering-analysis.md <Icon name="x" size={11} /></span>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Configuration</div>
              <div className="m-setlist">
                <SetRow icon="sliders" label="Priority" onTap={() => MUI.openPicker({ title: 'Priority', current: priority, options: window.PRIORITIES.map((p) => ({ value: p, label: plabel(p) })), onSelect: setPriority })}>
                  <span className="m-setval"><span className="m-pdot" style={{ background: pdot[priority] }}></span>{plabel(priority)}</span>
                </SetRow>
                <SetRow icon="calendar" label="Due date" onTap={() => notify('Pick a date')}>
                  <span className="m-setval">Jun 12, 2026</span>
                </SetRow>
                <SetRow icon="users" label="Assignees" onTap={() => MUI.openPicker({ title: 'Assignees', multi: true, current: assignees.map((a) => a.name), options: window.ALL_MEMBERS.map((m) => ({ value: m.name, label: m.name, avatar: m })), onToggle: toggleAssignee })}>
                  {assignees.length ? <Avatars list={assignees} /> : <span className="m-setval m-setval--muted">Unassigned</span>}
                </SetRow>
                <SetRow icon="bot" label="Agent & model" last onTap={() => MUI.openPicker({ title: 'Model', current: model, options: window.MODELS.filter((m) => m !== 'default').map((m) => ({ value: m, label: m })), onSelect: setModel })}>
                  <span className="m-setval"><img className="m-setval__agent" src={M_AGENT_SRC.claude} alt="" />{model}</span>
                </SetRow>
              </div>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Execution</div>
              <div className="m-setlist">
                <SetSwitch icon="gitBranch" label="Git worktree" desc="Run on an isolated branch" on={worktree} onToggle={() => setWorktree((v) => !v)} />
                <SetSwitch icon="shield" label="YOLO permissions" desc="Auto-approve every action — no prompts" on={danger} onToggle={() => setDanger((v) => !v)} last />
              </div>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Skills <span className="m-setgroup__n">2</span></div>
              <div className="m-chiprow">
                <span className="m-mchip m-mchip--ref"><Icon name="sparkles" size={12} /> code-review <Icon name="x" size={11} /></span>
                <span className="m-mchip m-mchip--ref"><Icon name="sparkles" size={12} /> write-tests <Icon name="x" size={11} /></span>
                <button className="m-mchip" onClick={() => notify('Add skill')}><Icon name="plus" size={12} /> Add skill</button>
              </div>
            </div>
          </div>

          <div className="m-ffoot">
            <div className="m-ffoot__btns">
              <button className="m-btn" onClick={close}>Cancel</button>
              <button className="m-btn" onClick={() => { notify('Task created'); close(); }}>Create</button>
              <button className="m-btn m-btn--primary" style={{ flex: '0 0 auto' }} onClick={() => { notify('Created & started'); close(); }}><Icon name="play" size={14} /> Start</button>
            </div>
          </div>
        </>
      )}
    </FormSheet>
  );
}

/* ---------------- NEW TEAM MEMBER ---------------- */
function TeamMemberSheet({ member, onClose, notify }) {
  const MODE_LABEL = { worker: 'Worker', orch: 'Orchestrator', cowork: 'Co-Worker', cocoord: 'Co-Coordinator' };
  const PERM_LABEL = { acceptEdits: 'Accept edits', interactive: 'Interactive', readOnly: 'Read only', bypass: 'Bypass — auto-approve' };
  const TOOL_LABEL = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' };
  const [mode, setMode] = useStateO(member && member.mode === 'Coordinator' ? 'orch' : 'worker');
  const [global, setGlobal] = useStateO((member && member.scope) === 'global');
  const [tool, setTool] = useStateO((member && member.tool) || 'claude');
  const [model, setModel] = useStateO((member && member.model) || 'opus-4.8');
  const [perms, setPerms] = useStateO((member && member.perms) || 'acceptEdits');
  const [instr, setInstr] = useStateO((member && member.instrument) || 'violin');
  const init = (member && member.caps) || { spawn: false, edit: true, rTask: true, rSession: true };
  const [caps, setCaps] = useStateO(init);
  const toggleCap = (k) => setCaps((c) => ({ ...c, [k]: !c[k] }));
  const editing = !!member;

  return (
    <FormSheet onClose={onClose}>
      {(close) => (
        <>
          <div className="m-fhead">
            <div className="m-fcrumb"><Icon name="users" size={12} /> <b>agent-maestro</b> <Icon name="chevronR" size={10} /> {editing ? 'Edit member' : 'New team member'}</div>
            <button className="m-fclose" onClick={close}><Icon name="x" /></button>
            <div className="m-fhead__id">
              <button className="m-avatar-edit" style={member ? { color: member.color, background: member.bg } : null}>{member ? member.initial : 'R'}</button>
              <input className="m-ftitle" placeholder="Name — e.g. Frontend Dev" defaultValue={member ? member.name : ''} />
            </div>
          </div>

          <div className="m-fbody m-fbody--text">
            <div className="m-fld">
              <span className="m-flabel">Role <span className="m-req">*</span></span>
              <input className="m-input" placeholder="e.g. test runner" defaultValue={member ? member.say : 'Reparent strike lead'} />
            </div>
            <div className="m-fld m-fld--grow">
              <span className="m-flabel">Identity</span>
              <textarea className="m-textarea m-textarea--full m-textarea--mono" placeholder="Describe this member's persona, expertise, and how they approach tasks…" defaultValue={member ? member.identity : "You lead the terminal-reparenting fix. You read the rendering pipeline carefully, prefer the registry ref over DOM moves, and always re-run fit.fit() after a reparent. Hand off tests to @Ada."}></textarea>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Configuration</div>
              <div className="m-setlist">
                <SetRow icon="users" label="Mode" onTap={() => MUI.openPicker({ title: 'Mode', current: mode, options: Object.keys(MODE_LABEL).map((k) => ({ value: k, label: MODE_LABEL[k] })), onSelect: setMode })}>
                  <span className="m-setval">{MODE_LABEL[mode]}</span>
                </SetRow>
                <SetRow icon="bot" label="Agent" onTap={() => MUI.openPicker({ title: 'Agent', current: tool, options: Object.keys(TOOL_LABEL).map((k) => ({ value: k, label: TOOL_LABEL[k] })), onSelect: setTool })}>
                  <span className="m-setval"><img className="m-setval__agent" src={M_AGENT_SRC[tool]} alt="" />{TOOL_LABEL[tool]}</span>
                </SetRow>
                <SetRow icon="layers" label="Model" onTap={() => MUI.openPicker({ title: 'Model', current: model, options: window.MODELS.filter((m) => m !== 'default').map((m) => ({ value: m, label: m })), onSelect: setModel })}>
                  <span className="m-setval">{model}</span>
                </SetRow>
                <SetRow icon="shield" label="Permissions" last onTap={() => MUI.openPicker({ title: 'Permissions', current: perms, options: Object.keys(PERM_LABEL).map((k) => ({ value: k, label: PERM_LABEL[k] })), onSelect: setPerms })}>
                  <span className="m-setval">{PERM_LABEL[perms]}</span>
                </SetRow>
              </div>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Capabilities</div>
              <div className="m-setlist">
                <SetSwitch label="Spawn sessions" desc="Can create new agent sessions" on={caps.spawn} onToggle={() => toggleCap('spawn')} />
                <SetSwitch label="Edit tasks" desc="Create, edit and delete tasks" on={caps.edit} onToggle={() => toggleCap('edit')} />
                <SetSwitch label="Report task-level" desc="Report progress on individual tasks" on={caps.rTask} onToggle={() => toggleCap('rTask')} />
                <SetSwitch label="Report session-level" desc="Report session-wide progress" on={caps.rSession} onToggle={() => toggleCap('rSession')} last />
              </div>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Scope &amp; sound</div>
              <div className="m-setlist">
                <SetSwitch icon="graph" label="Global scope" desc="Available across every project" on={global} onToggle={() => setGlobal((v) => !v)} />
                <SetRow icon="music" label="Instrument" last onTap={() => MUI.openPicker({ title: 'Instrument', current: instr, options: ['piano', 'guitar', 'violin', 'trumpet', 'drums'].map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) })), onSelect: setInstr })}>
                  <span className="m-setval" style={{ textTransform: 'capitalize' }}>{instr}</span>
                </SetRow>
              </div>
            </div>

            <div className="m-setgroup">
              <div className="m-setgroup__lbl">Skills</div>
              <div className="m-chiprow">
                {((member && member.skills) || ['debugging']).map((sk) => <span key={sk} className="m-mchip m-mchip--ref"><Icon name="sparkles" size={12} /> {sk} <Icon name="x" size={11} /></span>)}
                <button className="m-mchip" onClick={() => notify('Add skill')}><Icon name="plus" size={12} /> Add skill</button>
              </div>
            </div>
          </div>

          <div className="m-ffoot">
            <div className="m-ffoot__btns">
              <button className="m-btn" onClick={close}>Cancel</button>
              <button className="m-btn m-btn--primary" onClick={() => { notify(editing ? 'Member saved' : 'Member created'); close(); }}><Icon name={editing ? 'check' : 'plus'} size={14} /> {editing ? 'Save changes' : 'Create member'}</button>
            </div>
          </div>
        </>
      )}
    </FormSheet>
  );
}

/* ---------------- RUN TASK — mobile-first launch configuration panel ---------------- */
function RunConfigSheet({ task, onClose, notify }) {
  const t = task || {};
  const [tool, setTool] = useStateO(t.tool || 'claude');
  const [model, setModel] = useStateO(t.model && t.model !== 'default' ? t.model : 'opus-4.8');
  const [perms, setPerms] = useStateO('accept');
  const [worktree, setWorktree] = useStateO(!!t.worktree);
  const [assignees] = useStateO(t.assignees || []);
  const PERMS = [['safe', 'Safe'], ['accept', 'Accept edits'], ['yolo', 'YOLO']];

  return (
    <FormSheet onClose={onClose}>
      {(close) => (
        <>
          <div className="m-fhead">
            <div className="m-fcrumb"><Icon name="play" size={12} /> <b>agent-maestro</b> <Icon name="chevronR" size={10} /> Run task</div>
            <button className="m-fclose" onClick={close}><Icon name="x" /></button>
            <div className="m-runtitle">{t.title || 'Untitled task'}</div>
          </div>

          <div className="m-fbody">
            <div className="m-fld">
              <span className="m-flabel">Agent</span>
              <div className="m-toolsel">
                {[['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([k, label]) => (
                  <button key={k} className={'m-tool' + (tool === k ? ' m-tool--active' : '')} onClick={() => setTool(k)}>
                    <img src={M_AGENT_SRC[k]} alt="" /><span className="m-tool__name">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="m-fld">
              <span className="m-flabel">Model</span>
              <select className="m-select" value={model} onChange={(e) => setModel(e.target.value)}>
                {window.MODELS.filter((m) => m !== 'default').map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>

            <div className="m-fld">
              <span className="m-flabel">Permissions</span>
              <div className="m-seg">
                {PERMS.map(([k, label]) => (
                  <button key={k} className={'m-seg-i' + (perms === k ? ' m-seg-i--active' : '')} onClick={() => setPerms(k)}>{label}</button>
                ))}
              </div>
              {perms === 'yolo' && <span className="m-runwarn"><Icon name="shield" size={12} /> Auto-approves every action — no prompts.</span>}
            </div>

            <div className="m-fld">
              <span className="m-flabel">Isolation</span>
              <button className={'m-toggle m-toggle--lg' + (worktree ? ' m-toggle--wt' : '')} onClick={() => setWorktree((v) => !v)}>
                <Icon name="gitBranch" size={14} /> {worktree ? 'Git worktree — isolated branch' : 'In-place — current branch'}
              </button>
            </div>

            <div className="m-fld">
              <span className="m-flabel">Assign to</span>
              <div className="m-chiprow">
                {assignees.length > 0
                  ? assignees.map((a) => <span key={a.name} className="m-mchip m-mchip--ref"><span className="m-av" style={{ width: 18, height: 18, fontSize: 9, color: a.color, background: a.bg }}>{a.initial}</span> {a.name}</span>)
                  : <span className="m-fhint" style={{ padding: 0 }}>Unassigned — runs as a fresh session</span>}
                <button className="m-mchip" onClick={() => notify('Assign')}><Icon name="plus" size={12} /> Add</button>
              </div>
            </div>

            <div className="m-runsummary">
              <Icon name="terminal" size={13} />
              <span className="m-runsummary__t">Spawns a {tool} session on <b>{model}</b>, {perms === 'safe' ? 'asking before edits' : perms === 'yolo' ? 'auto-approving everything' : 'accepting edits'}, {worktree ? 'in an isolated worktree' : 'on the current branch'}.</span>
            </div>
          </div>

          <div className="m-ffoot">
            <div className="m-ffoot__btns">
              <button className="m-btn" onClick={close}>Cancel</button>
              <button className="m-btn m-btn--primary" style={{ flex: '0 0 auto' }} onClick={() => { notify('Running ' + (t.title || 'task')); close(); }}><Icon name="play" size={14} /> Run task</button>
            </div>
          </div>
        </>
      )}
    </FormSheet>
  );
}

Object.assign(window, { NowPlaying, TerminalSheet, CommandSheet, ProjectSheet, BottomSheet, PickerSheet, FormSheet, CreateTaskSheet, TeamMemberSheet, RunConfigSheet });
