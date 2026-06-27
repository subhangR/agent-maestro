/* modals.jsx — Create Task & New Team Member, in the new theme.
   Relies on kit.jsx (Icon, AgentTile) + tiles.jsx (Avatar, Glyph). */

const MEM = [
  { initial: 'R', name: 'Rhea', color: '#1f6f5f', bg: '#dcebe6' },
  { initial: 'K', name: 'Kit', color: '#7a5cc0', bg: '#ece4f7' },
  { initial: 'A', name: 'Ada', color: '#b06a2b', bg: '#f4e7d6' },
];

/* ============================ CREATE TASK ============================ */
function CreateTaskModal() {
  const [priority, setPriority] = React.useState('medium');
  const [tab, setTab] = React.useState('details');
  const [worktree, setWorktree] = React.useState(false);
  const [danger, setDanger] = React.useState(false);
  const [assignees] = React.useState([MEM[0]]);

  const pdot = { high: 'var(--pn-block)', medium: 'var(--pn-wait)', low: 'var(--pn-idle)' };

  return (
    <div className="pn-mdl">
      <div className="pn-mdl__hd">
        <div className="pn-mdl__hdmain">
          <div className="pn-mdl__crumb"><Icon name="listChecks" /> <b>agent-maestro</b> <Icon name="chevronR" size={11} /> New task</div>
          <input className="pn-mdl__titleinput" placeholder="Untitled task" defaultValue="Fix terminal reparenting crash on board close" />
        </div>
        <button className="pn-mdl__close"><Icon name="x" /></button>
      </div>

      <div className="pn-mdl__body">
        <div className="pn-desc pn-fld">
          <textarea className="pn-textarea" placeholder="Describe the task — type @ to reference a file, # to pull in a skill." defaultValue={"The board reparents [data-terminal-id]; TeamView moves term.element. Make the board reparent via the registry ref instead, then re-run fit.fit()."}></textarea>
          <div className="pn-desc__bar">
            <button className="pn-mchip"><Icon name="paperclip" /> Attach</button>
            <button className="pn-mchip"><Icon name="at" /> Reference</button>
            <button className="pn-mchip"><Icon name="hash" /> Skill</button>
            <span className="pn-mchip pn-mchip--ref"><Icon name="doc" size={12} /> terminal-rendering-analysis.md <Icon name="x" size={11} /></span>
          </div>
        </div>
      </div>

      <div className="pn-mtabs">
        {[['details', 'Details', 'sliders'], ['skills', 'Skills', 'sparkles'], ['subtasks', 'Subtasks', 'listChecks'], ['refs', 'References', 'at']].map(([id, label, icon]) => (
          <button key={id} className={'pn-mtab' + (tab === id ? ' pn-mtab--active' : '')} onClick={() => setTab(id)}>
            <Icon name={icon} /> {label}{id === 'skills' && <span className="pn-mtab__n">2</span>}
          </button>
        ))}
      </div>

      <div className="pn-mdl__body" style={{ maxHeight: 220, paddingTop: 16, paddingBottom: 16 }}>
        {tab === 'details' && (
          <>
            <div className="pn-fld">
              <span className="pn-flabel">Priority</span>
              <div className="pn-prio-pills">
                {['high', 'medium', 'low'].map((p) => (
                  <button key={p} className={'pn-prio-pill' + (priority === p ? ' pn-prio-pill--active' : '')} onClick={() => setPriority(p)}>
                    <span className="pn-pdot" style={{ background: pdot[p] }}></span>{p === 'medium' ? 'Medium' : p[0].toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="pn-frow">
              <div className="pn-fld" style={{ flex: 1 }}>
                <span className="pn-flabel">Due date</span>
                <div style={{ position: 'relative' }}>
                  <Icon name="calendar" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--pn-ink-4)' }} />
                  <input className="pn-input" style={{ paddingLeft: 32 }} placeholder="No due date" defaultValue="Jun 12, 2026" />
                </div>
              </div>
              <div className="pn-fld">
                <span className="pn-flabel">Isolation</span>
                <button className={'pn-toggle' + (worktree ? ' pn-toggle--on-wt' : '')} onClick={() => setWorktree((v) => !v)} style={{ height: 38 }}><Icon name="gitBranch" size={14} /> {worktree ? 'Git worktree' : 'In-place'}</button>
              </div>
              <div className="pn-fld">
                <span className="pn-flabel">Permissions</span>
                <button className={'pn-toggle' + (danger ? ' pn-toggle--on-danger' : '')} onClick={() => setDanger((v) => !v)} style={{ height: 38 }}><Icon name="shield" size={14} /> {danger ? 'YOLO' : 'Safe'}</button>
              </div>
            </div>
          </>
        )}
        {tab === 'skills' && (
          <div className="pn-fld">
            <span className="pn-flabel">Skills attached <span className="req">2</span></span>
            <div className="pn-desc__bar" style={{ marginTop: 0 }}>
              <span className="pn-mchip pn-mchip--ref"><Icon name="sparkles" size={12} /> code-review <Icon name="x" size={11} /></span>
              <span className="pn-mchip pn-mchip--ref"><Icon name="sparkles" size={12} /> write-tests <Icon name="x" size={11} /></span>
              <button className="pn-mchip"><Icon name="plus" size={12} /> Add skill</button>
            </div>
          </div>
        )}
        {tab === 'subtasks' && <div className="pn-fhint">No subtasks yet. Subtasks appear here once the task is created.</div>}
        {tab === 'refs' && <div className="pn-fhint">Reference other tasks to give this one context. None linked yet.</div>}
      </div>

      <div className="pn-mdl__foot">
        <div className="pn-mdl__footL">
          <span className="pn-flabel" style={{ letterSpacing: '0.06em' }}>Assignee</span>
          <Avatar a={assignees[0]} />
          <button className="pn-assignadd"><Icon name="plus" size={13} /></button>
          <span className="pn-badge pn-badge--model" style={{ marginLeft: 4 }}><AgentTile kind="claude" /> opus-4.8 <Icon name="chevronD" size={9} className="pn-badge__caret" /></span>
        </div>
        <div className="pn-mdl__footR">
          <button className="pn-btn pn-btn--ghost">Cancel</button>
          <button className="pn-btn">Create</button>
          <button className="pn-btn pn-btn--primary"><Icon name="play" size={13} /> Create &amp; start</button>
        </div>
      </div>
    </div>
  );
}

/* ========================= NEW TEAM MEMBER ========================= */
function TeamMemberModal() {
  const [mode, setMode] = React.useState('worker');
  const [scope, setScope] = React.useState('project');
  const [tool, setTool] = React.useState('claude');
  const [instr, setInstr] = React.useState('violin');
  const [tab, setTab] = React.useState('caps');
  const [caps, setCaps] = React.useState({ spawn: false, edit: true, rTask: true, rSession: true });
  const toggleCap = (k) => setCaps((c) => ({ ...c, [k]: !c[k] }));

  return (
    <div className="pn-mdl">
      <div className="pn-mdl__hd">
        <div className="pn-mdl__hdmain">
          <div className="pn-mdl__crumb"><Icon name="users" /> <b>agent-maestro</b> <Icon name="chevronR" size={11} /> New team member</div>
          <input className="pn-mdl__titleinput" placeholder="Name — e.g. Frontend Dev" defaultValue="Rhea" />
        </div>
        <button className="pn-mdl__close"><Icon name="x" /></button>
      </div>

      <div className="pn-mdl__body">
        <div className="pn-frow" style={{ alignItems: 'flex-end' }}>
          <div className="pn-fld">
            <span className="pn-flabel">Avatar</span>
            <button className="pn-avatar-edit" title="Pick avatar">R</button>
          </div>
          <div className="pn-fld" style={{ flex: 1, minWidth: 160 }}>
            <span className="pn-flabel">Role <span className="req">*</span></span>
            <input className="pn-input" placeholder="e.g. frontend specialist, test runner" defaultValue="Reparent strike lead" />
          </div>
          <div className="pn-fld">
            <span className="pn-flabel">Mode</span>
            <div className="pn-seg">
              <button className={'pn-seg-i' + (mode === 'worker' ? ' pn-seg-i--active' : '')} onClick={() => setMode('worker')}>Worker</button>
              <button className={'pn-seg-i' + (mode === 'orch' ? ' pn-seg-i--active' : '')} onClick={() => setMode('orch')}>Orchestrator</button>
            </div>
          </div>
          <div className="pn-fld">
            <span className="pn-flabel">Scope</span>
            <button className={'pn-toggle' + (scope === 'global' ? ' pn-toggle--on-wt' : '')} onClick={() => setScope((s) => s === 'global' ? 'project' : 'global')} style={{ height: 30 }}>{scope === 'global' ? 'Global' : 'Project'}</button>
          </div>
        </div>

        <div className="pn-fld">
          <span className="pn-flabel">Identity</span>
          <textarea className="pn-textarea pn-textarea--mono" placeholder="Describe this member's persona, expertise, and how they approach tasks…" defaultValue={"You lead the terminal-reparenting fix. You read the rendering pipeline carefully, prefer the registry ref over DOM moves, and always re-run fit.fit() after a reparent. Hand off tests to @Ada."}></textarea>
        </div>

        <div className="pn-fld">
          <span className="pn-flabel">Agent &amp; model</span>
          <div className="pn-toolsel">
            {[['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([k, label]) => (
              <button key={k} className={'pn-tool' + (tool === k ? ' pn-tool--active' : '')} onClick={() => setTool(k)}>
                <AgentTile kind={k} /><span className="pn-tool__name">{label}</span>
              </button>
            ))}
          </div>
          <div className="pn-frow" style={{ marginTop: 4 }}>
            <div className="pn-fld" style={{ flex: 1 }}>
              <select className="pn-select" defaultValue="opus-4.8"><option>opus-4.8</option><option>sonnet-4.5</option><option>opus[1m]</option></select>
            </div>
            <div className="pn-fld" style={{ flex: 1 }}>
              <select className="pn-select" defaultValue="acceptEdits"><option value="acceptEdits">Accept edits</option><option>Interactive</option><option>Read only</option><option>Bypass — auto-approve</option></select>
            </div>
          </div>
        </div>
      </div>

      <div className="pn-mtabs">
        {[['caps', 'Capabilities', 'shield'], ['skills', 'Skills', 'sparkles'], ['sound', 'Sound', 'music']].map(([id, label, icon]) => (
          <button key={id} className={'pn-mtab' + (tab === id ? ' pn-mtab--active' : '')} onClick={() => setTab(id)}><Icon name={icon} /> {label}</button>
        ))}
      </div>

      <div className="pn-mdl__body" style={{ maxHeight: 210 }}>
        {tab === 'caps' && (
          <div className="pn-caps">
            {[['spawn', 'Spawn sessions', 'Can create new agent sessions'], ['edit', 'Edit tasks', 'Create, edit and delete tasks'], ['rTask', 'Report task-level', 'Report progress on individual tasks'], ['rSession', 'Report session-level', 'Report session-wide progress']].map(([k, name, desc]) => (
              <div key={k} className="pn-cap" onClick={() => toggleCap(k)}>
                <div className="pn-cap__body"><div className="pn-cap__name">{name}</div><div className="pn-cap__desc">{desc}</div></div>
                <span className={'pn-switch' + (caps[k] ? ' pn-switch--on' : '')}></span>
              </div>
            ))}
          </div>
        )}
        {tab === 'skills' && (
          <div className="pn-fld">
            <span className="pn-flabel">Skills</span>
            <div className="pn-desc__bar" style={{ marginTop: 0 }}>
              <span className="pn-mchip pn-mchip--ref"><Icon name="sparkles" size={12} /> debugging <Icon name="x" size={11} /></span>
              <button className="pn-mchip"><Icon name="plus" size={12} /> Add skill</button>
            </div>
          </div>
        )}
        {tab === 'sound' && (
          <div className="pn-fld">
            <span className="pn-flabel"><Icon name="music" size={12} /> Instrument — each agent plays a distinct voice</span>
            <div className="pn-instr">
              {['piano', 'guitar', 'violin', 'trumpet', 'drums'].map((i) => (
                <button key={i} className={'pn-instr-i' + (instr === i ? ' pn-instr-i--active' : '')} onClick={() => setInstr(i)}>
                  <Icon name="music" /><span className="pn-instr-i__name">{i}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pn-mdl__foot">
        <div className="pn-mdl__footL"><span className="pn-savehint"><span className="pn-dot pn-dot--idle"></span> ⌘↵ to save</span></div>
        <div className="pn-mdl__footR">
          <button className="pn-btn pn-btn--ghost">Cancel</button>
          <button className="pn-btn pn-btn--primary"><Icon name="plus" size={13} /> Create member</button>
        </div>
      </div>
    </div>
  );
}

function Modals() {
  return (
    <div className="pn-mdl-stage">
      <div className="pn-mdl-col"><div className="pn-mdl-cap">Create task</div><CreateTaskModal /></div>
      <div className="pn-mdl-col"><div className="pn-mdl-cap">New team member</div><TeamMemberModal /></div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Modals />);
