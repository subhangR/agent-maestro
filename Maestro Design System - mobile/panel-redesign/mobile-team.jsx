/* mobile-team.jsx — Team members, More menu, Skills, Files, + all sheets/dialogs. */
const { useState: mtS } = React;

/* =====================================================================
   TEAM MEMBERS
   ===================================================================== */
const M_MEMBERS = [
  { ...M_AV.rhea, role: 'Reparent strike lead', agent: 'claude', model: 'Opus 4.8', isDefault: true, identity: 'You lead the terminal-reparenting fix. Prefer the registry ref over DOM moves; always re-run fit.fit().', skills: ['debugging', 'code-review'], mode: 'Coordinator' },
  { ...M_AV.kit, role: 'Pipeline & WebSocket', agent: 'codex', model: '5.3-codex', identity: 'You own the realtime pipeline. Keep updates idempotent and deduped.', skills: ['write-tests'], mode: 'Worker' },
  { ...M_AV.ada, role: 'Test runner', agent: 'claude', model: 'Haiku', profile: 'fast-haiku', scope: 'global', identity: 'You run and triage the test suite.', mode: 'Worker' },
];
function TeamScreen({ nav }) {
  return (
    <>
      <div className="mb-head">
        <div className="mb-head__title"><span className="mb-head__eyebrow">Project</span><span className="mb-head__h">Team</span></div>
        <span className="mb-head__sp"></span>
        <button className="mb-iconbtn"><Icon name="search" /></button>
      </div>
      <div className="mb-chips"><button className="mb-chip mb-chip--on">Active <span className="n">3</span></button><button className="mb-chip">Archived <span className="n">1</span></button></div>
      <div className="mb-body">
        <div className="mb-sec"><span className="mb-sec__t">Members</span><span className="mb-sec__line"></span></div>
        {M_MEMBERS.map((m, i) => (
          <button key={i} className="mb-row" style={{ background: 'var(--pn-card)', margin: '0 16px 9px', border: '1px solid var(--pn-line)', borderRadius: 14, borderBottom: '1px solid var(--pn-line)' }} onClick={() => nav.push('memberDetail', m)}>
            <Emblem id={m.emblem} cls="mb-av-emblem" />
            <div className="mb-row__b">
              <div className="mb-row__name">{m.name} {m.isDefault && <span className="mb-tag mb-tag--green">DEFAULT</span>}</div>
              <div className="mb-row__sub">{m.role} · {m.mode}</div>
            </div>
            {m.profile ? <span className="mb-tag mb-tag--brand">◈ {m.profile}</span> : <span className="mb-tag">{m.model}</span>}
            <span className="mb-row__chev"><Icon name="chevronR" /></span>
          </button>
        ))}
      </div>
      <button className="mb-fab" onClick={() => nav.sheet('createMember')}><Icon name="plus" /></button>
    </>
  );
}
function MemberDetail({ nav, data: m }) {
  return (
    <div className="mb-push">
      <div className="mb-subhead"><button className="mb-back" onClick={nav.pop}><Icon name="chevronL" /> Team</button><span className="mb-subhead__t">{m.name}</span><div className="mb-subhead__r"><button className="mb-iconbtn mb-iconbtn--ghost"><Icon name="more" /></button></div></div>
      <div className="mb-body">
        <div className="mb-d">
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Emblem id={m.emblem} cls="mb-av-emblem" />
            <div style={{ flex: 1 }}><div className="mb-d__title" style={{ fontSize: 22 }}>{m.name}</div><div className="mb-meta" style={{ fontSize: 13, marginTop: 2 }}>{m.role}</div></div>
          </div>
          <button className="mb-btn mb-btn--primary mb-btn--block"><Icon name="play" size={15} /> Run with {m.name}</button>
          <div className="mb-d__group">
            <div className="mb-d__row"><span className="mb-d__rowlabel">Mode</span><span className="mb-d__rowval">{m.mode}</span></div>
            <div className="mb-d__row"><span className="mb-d__rowlabel">Agent</span><span className="mb-d__rowval"><AgentTile kind={m.agent} /> {m.model}</span></div>
            <div className="mb-d__row"><span className="mb-d__rowlabel">Scope</span><span className="mb-d__rowval">{m.scope === 'global' ? 'Global' : 'Project'}</span></div>
            {m.profile && <div className="mb-d__row"><span className="mb-d__rowlabel">Profile</span><span className="mb-d__rowval" style={{ color: 'var(--pn-brand)' }}>◈ {m.profile}</span></div>}
          </div>
          <div><div className="mb-dlabel">Identity</div><div className="mb-d__desc" style={{ fontFamily: 'var(--pn-mono)', fontSize: 13 }}>{m.identity}</div></div>
          {m.skills && <div><div className="mb-dlabel">Skills</div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{m.skills.map((s) => <span key={s} className="mb-tag" style={{ padding: '4px 9px', fontSize: 11 }}>{s}</span>)}</div></div>}
          <div className="mb-d__group">
            <button className="mb-row" style={{ background: 'var(--pn-card)' }}><Icon name="pen" size={17} style={{ color: 'var(--pn-ink-3)' }} /><div className="mb-row__b"><div className="mb-row__name" style={{ fontSize: 14 }}>Edit member</div></div><span className="mb-row__chev"><Icon name="chevronR" /></span></button>
            <button className="mb-row" style={{ background: 'var(--pn-card)' }}><Icon name="archiveBox" size={17} style={{ color: 'var(--pn-ink-3)' }} /><div className="mb-row__b"><div className="mb-row__name" style={{ fontSize: 14 }}>Archive</div></div></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   MORE menu + Skills + Files
   ===================================================================== */
function MoreScreen({ nav }) {
  const item = (icon, name, sub, to, badge) => (
    <button className="mb-row" style={{ background: 'var(--pn-card)' }} onClick={() => to && (typeof to === 'function' ? to() : nav.push(to))}>
      <span className="mb-toggle__ic"><Icon name={icon} /></span>
      <div className="mb-row__b"><div className="mb-row__name">{name}</div><div className="mb-row__sub">{sub}</div></div>
      {badge && <span className="mb-tag mb-tag--brand">{badge}</span>}
      <span className="mb-row__chev"><Icon name="chevronR" /></span>
    </button>
  );
  return (
    <>
      <div className="mb-head"><div className="mb-head__title"><span className="mb-head__eyebrow">agent-maestro</span><span className="mb-head__h">More</span></div></div>
      <div className="mb-body">
        <div className="mb-sec"><span className="mb-sec__t">Workspace</span><span className="mb-sec__line"></span></div>
        <div className="mb-card-list">
          {item('sparkles', 'Skills', '4 installed · marketplace', 'skills')}
          {item('folder', 'Files', '~/code/agent-maestro · 5 changes', 'files')}
          {item('grid', 'Board', 'Kanban across all tasks', 'board')}
          {item('graph', 'Dependency graph', 'Task relationships', null)}
        </div>
        <div className="mb-sec"><span className="mb-sec__t">Projects</span><span className="mb-sec__line"></span></div>
        <div className="mb-card-list">
          {item('listChecks', 'agent-maestro', '6 tasks · 4 sessions', null)}
          {item('listChecks', 'voice-alexa', '3 tasks · 1 session', null)}
          {item('plus', 'Add project', 'Open a folder', null)}
        </div>
        <div className="mb-sec"><span className="mb-sec__t">App</span><span className="mb-sec__line"></span></div>
        <div className="mb-card-list">
          {item('settings', 'Settings', 'Theme, models, defaults', () => nav.sheet('settings'))}
          {item('bot', 'Voice & directives', 'Alexa coordinator', null)}
        </div>
      </div>
    </>
  );
}
function SkillsScreenM({ nav }) {
  const card = (s) => (
    <div className="mb-skill" key={s.name}>
      <div className="mb-skill__top"><span className="mb-skill__ic"><Icon name="sparkles" /></span><span className="mb-skill__name">{s.name}</span><span className="mb-tag">{s.src}</span>{s.ver && <span className="mb-tag mb-tag--brand">v{s.ver}</span>}</div>
      <div className="mb-skill__desc">{s.desc}</div>
    </div>
  );
  return (
    <div className="mb-push">
      <div className="mb-subhead"><button className="mb-back" onClick={nav.pop}><Icon name="chevronL" /> More</button><span className="mb-subhead__t">Skills</span><div className="mb-subhead__r"><button className="mb-iconbtn mb-iconbtn--ghost"><Icon name="plus" /></button></div></div>
      <div className="mb-chips"><button className="mb-chip mb-chip--on">Installed <span className="n">4</span></button><button className="mb-chip">Marketplace</button></div>
      <div className="mb-body">
        <div className="mb-sec"><span className="mb-sec__t">Project · 2</span><span className="mb-sec__line"></span></div>
        {[{ name: 'code-review', src: '.claude', ver: '1.2', desc: 'Reviews diffs for correctness, style, and missed edge cases before a PR.' }, { name: 'write-tests', src: '.claude', ver: '0.9', desc: 'Generates and runs unit + integration tests for changed modules.' }].map(card)}
        <div className="mb-sec"><span className="mb-sec__t">Global · 2</span><span className="mb-sec__line"></span></div>
        {[{ name: 'debugging', src: '.agents', ver: '2.0', desc: 'Systematic root-cause analysis: reproduce, bisect, isolate, fix.' }, { name: 'find-skills', src: '.claude', desc: 'Discover relevant skills for your project from skills.sh.' }].map(card)}
      </div>
    </div>
  );
}
const M_TREE = [
  { name: 'src', kind: 'folder', depth: 0, open: true },
  { name: 'components', kind: 'folder', depth: 1, open: true },
  { name: 'SessionTerminal.tsx', kind: 'file', depth: 2, git: 'm', active: true },
  { name: 'TeamView.tsx', kind: 'file', depth: 2, git: 'm' },
  { name: 'MaestroPanel.tsx', kind: 'file', depth: 2 },
  { name: 'terminal-theme.ts', kind: 'file', depth: 1, git: 'a' },
  { name: 'old-theme.css', kind: 'file', depth: 0, git: 'd' },
  { name: 'README.md', kind: 'file', depth: 0, git: 'm' },
];
function FilesScreenM({ nav }) {
  return (
    <div className="mb-push">
      <div className="mb-subhead"><button className="mb-back" onClick={nav.pop}><Icon name="chevronL" /> More</button><span className="mb-subhead__t">Files</span><div className="mb-subhead__r"><button className="mb-iconbtn mb-iconbtn--ghost"><Icon name="refresh" /></button></div></div>
      <div className="mb-body" style={{ paddingTop: 6 }}>
        {M_TREE.map((f, i) => (
          <button key={i} className="mb-row" style={{ paddingLeft: 16 + f.depth * 18, paddingTop: 11, paddingBottom: 11, background: f.active ? 'var(--pn-active)' : 'var(--pn-surface)' }}>
            <Icon name={f.kind === 'folder' ? (f.open ? 'folderOpen' : 'folder') : (f.name.endsWith('.md') ? 'doc' : 'fileCode')} size={16} style={{ color: f.kind === 'folder' ? 'var(--pn-brand-2)' : 'var(--pn-ink-4)', flex: '0 0 auto' }} />
            <span style={{ flex: 1, fontSize: 14, color: f.git === 'd' ? 'var(--pn-ink-4)' : 'var(--pn-ink-2)', textDecoration: f.git === 'd' ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
            {f.git && <span className={'mb-fgit mb-fgit--' + f.git}>{f.git.toUpperCase()}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   SHEETS + DIALOGS
   ===================================================================== */
function Sheet({ title, onClose, children, foot }) {
  return (
    <div className="mb-sheet-scrim" onClick={onClose}>
      <div className="mb-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mb-sheet__grip"></div>
        {title && <div className="mb-sheet__hd"><span className="mb-sheet__h">{title}</span><button className="mb-iconbtn mb-iconbtn--ghost" onClick={onClose}><Icon name="x" /></button></div>}
        <div className="mb-sheet__body">{children}</div>
        {foot && <div className="mb-sheet__foot">{foot}</div>}
      </div>
    </div>
  );
}

function CreateTaskSheet({ nav }) {
  const [prio, setPrio] = mtS('medium');
  const dot = { high: 'var(--pn-block)', medium: 'var(--pn-wait)', low: 'var(--pn-idle)' };
  return (
    <Sheet title="New task" onClose={nav.closeSheet} foot={<><button className="mb-btn mb-btn--ghost" onClick={nav.closeSheet}>Cancel</button><button className="mb-btn mb-btn--run mb-btn--block">Create &amp; run</button></>}>
      <div className="mb-field"><input className="mb-input" style={{ fontFamily: 'var(--pn-serif)', fontSize: 19 }} placeholder="Task title" autoFocus /></div>
      <div className="mb-field"><textarea className="mb-textarea" placeholder="Describe the task — @ to reference a file, # for a skill"></textarea></div>
      <div className="mb-field"><span className="mb-flabel">Priority</span><div className="mb-prio">{['high', 'medium', 'low'].map((p) => <button key={p} className={prio === p ? 'on' : ''} onClick={() => setPrio(p)}><span className="d" style={{ background: dot[p] }}></span>{p[0].toUpperCase() + p.slice(1)}</button>)}</div></div>
      <div className="mb-d__group">
        <div className="mb-d__row"><span className="mb-d__rowlabel">Assignee</span><span className="mb-d__rowval"><span className="mb-av" style={{ width: 22, height: 22, color: M_AV.rhea.color, background: M_AV.rhea.bg }}>R</span> Rhea <Icon name="chevronR" /></span></div>
        <div className="mb-d__row"><span className="mb-d__rowlabel">Model</span><span className="mb-d__rowval" style={{ fontFamily: 'var(--pn-mono)', fontSize: 13 }}>opus-4.8 <Icon name="chevronR" /></span></div>
      </div>
    </Sheet>
  );
}

function CreateMemberSheet({ nav }) {
  const [emblem, setEmblem] = mtS('violin');
  const [agent, setAgent] = mtS('claude');
  const [mode, setMode] = mtS('worker');
  const emblems = ['violin', 'piano', 'trumpet', 'snare', 'guitar', 'harp', 'quill', 'compass', 'gear', 'beaker', 'sun', 'owl'];
  return (
    <Sheet title="New team member" onClose={nav.closeSheet} foot={<><button className="mb-btn mb-btn--ghost" onClick={nav.closeSheet}>Cancel</button><button className="mb-btn mb-btn--primary mb-btn--block"><Icon name="plus" size={15} /> Create</button></>}>
      <div className="mb-field"><input className="mb-input" style={{ fontFamily: 'var(--pn-serif)', fontSize: 19 }} placeholder="Name" /></div>
      <div className="mb-field"><span className="mb-flabel">Emblem</span><div className="mb-emblems">{emblems.map((id) => <button key={id} className={'mb-emblem' + (emblem === id ? ' mb-emblem--on' : '')} onClick={() => setEmblem(id)}><svg viewBox="0 0 24 24">{emblemById(id).svg}</svg></button>)}</div></div>
      <div className="mb-field"><span className="mb-flabel">Role</span><input className="mb-input" placeholder="e.g. frontend specialist" /></div>
      <div className="mb-field"><span className="mb-flabel">Mode</span><div className="mb-prio"><button className={mode === 'worker' ? 'on' : ''} onClick={() => setMode('worker')}>Worker</button><button className={mode === 'orch' ? 'on' : ''} onClick={() => setMode('orch')}>Orchestrator</button></div></div>
      <div className="mb-field"><span className="mb-flabel">Agent</span><div className="mb-agents">{[['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([k, l]) => <button key={k} className={'mb-agent' + (agent === k ? ' mb-agent--on' : '')} onClick={() => setAgent(k)}><img src={'../assets/' + (k === 'claude' ? 'claude-code-icon' : k === 'codex' ? 'openai-codex-icon' : 'gemini-logo') + '.png'} alt="" />{l}</button>)}</div></div>
      <div className="mb-field"><span className="mb-flabel">Identity</span><textarea className="mb-textarea" placeholder="Persona, expertise, how they work…"></textarea></div>
    </Sheet>
  );
}

function RunConfigSheet({ nav, coord }) {
  return (
    <Sheet title={coord ? 'Coordinate' : 'Run task'} onClose={nav.closeSheet} foot={<button className={'mb-btn mb-btn--block ' + (coord ? 'mb-btn--coord' : 'mb-btn--run')}>{coord ? <><Icon name="baton" size={16} /> Spawn team</> : <><Icon name="play" size={15} /> Run now</>}</button>}>
      <div className="mb-d__desc" style={{ fontSize: 13 }}>{coord ? 'An orchestrator will spawn a team and delegate subtasks.' : 'A single worker executes this task.'}</div>
      <div className="mb-d__group">
        <div className="mb-d__row"><span className="mb-d__rowlabel">{coord ? 'Coordinator' : 'Worker'}</span><span className="mb-d__rowval"><span className="mb-av" style={{ width: 22, height: 22, color: M_AV.rhea.color, background: M_AV.rhea.bg }}>R</span> Rhea <Icon name="chevronR" /></span></div>
        <div className="mb-d__row"><span className="mb-d__rowlabel">Model</span><span className="mb-d__rowval" style={{ fontFamily: 'var(--pn-mono)', fontSize: 13 }}>opus-4.8 <Icon name="chevronR" /></span></div>
        {coord && <div className="mb-d__row"><span className="mb-d__rowlabel">Max workers</span><span className="mb-d__rowval">3 <Icon name="chevronR" /></span></div>}
      </div>
      <div className="mb-toggle"><span className="mb-toggle__ic"><Icon name="gitBranch" /></span><div className="mb-toggle__b"><div className="mb-toggle__name">Git worktree</div><div className="mb-toggle__desc">Isolate on a branch</div></div><button className="mb-switch mb-switch--on"></button></div>
    </Sheet>
  );
}

function SessActionsSheet({ nav, data: s }) {
  return (
    <Sheet onClose={nav.closeSheet}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 6 }}>
        <span className="mb-scard__agent" style={{ width: 42, height: 42 }}>{s && s.agent === 'terminal' ? <span style={{ fontFamily: 'var(--pn-mono)', color: 'var(--pn-run)', fontWeight: 700 }}>&gt;_</span> : <img src={'../assets/' + (s && s.agent === 'codex' ? 'openai-codex-icon' : s && s.agent === 'gemini' ? 'gemini-logo' : 'claude-code-icon') + '.png'} alt="" />}</span>
        <div><div style={{ fontSize: 16, fontWeight: 600 }}>{s ? s.name : 'Session'}</div><div className="mb-meta">{s ? s.statusText : ''}</div></div>
      </div>
      <div className="mb-actlist">
        <button className="mb-actrow" onClick={() => { nav.closeSheet(); nav.push('terminal'); }}><Icon name="terminal" /> Open terminal</button>
        <button className="mb-actrow"><Icon name="teamview" /> Team view <span className="mb-actrow__sub">3 workers</span></button>
        <button className="mb-actrow"><Icon name="refresh" /> Resume session</button>
        <button className="mb-actrow"><Icon name="copy" /> Copy reference</button>
        <button className="mb-actrow"><Icon name="check" /> Mark done</button>
        <button className="mb-actrow mb-actrow--danger" onClick={() => nav.sheet('confirmClose', s)}><Icon name="x" /> Close session</button>
      </div>
    </Sheet>
  );
}

function NewSessionSheet({ nav }) {
  return (
    <Sheet title="New session" onClose={nav.closeSheet}>
      <div className="mb-actlist">
        <button className="mb-actrow" onClick={() => { nav.closeSheet(); nav.push('terminal'); }}><span style={{ width: 19, textAlign: 'center', fontFamily: 'var(--pn-mono)', color: 'var(--pn-run)', fontWeight: 700 }}>&gt;_</span> Plain terminal</button>
        <button className="mb-actrow"><img src="../assets/claude-code-icon.png" style={{ width: 19, height: 19 }} alt="" /> Claude Code</button>
        <button className="mb-actrow"><img src="../assets/openai-codex-icon.png" style={{ width: 19, height: 19 }} alt="" /> Codex</button>
        <button className="mb-actrow"><img src="../assets/gemini-logo.png" style={{ width: 19, height: 19 }} alt="" /> Gemini</button>
        <button className="mb-actrow"><Icon name="users" /> Run a team member <span className="mb-actrow__sub">3</span></button>
      </div>
    </Sheet>
  );
}

function SwitchSessionSheet({ nav }) {
  const all = [{ name: 'Rhea', agent: 'claude', sub: 'coordinating', on: false }, { name: 'fluffy-starlight', agent: 'claude', sub: 'editing', on: true }, { name: 'Alexa coordinator', agent: 'codex', sub: 'needs input', on: false }];
  return (
    <Sheet title="Switch session" onClose={nav.closeSheet}>
      <div className="mb-actlist">
        {all.map((s) => (
          <button key={s.name} className="mb-actrow"><img src={'../assets/' + (s.agent === 'codex' ? 'openai-codex-icon' : 'claude-code-icon') + '.png'} style={{ width: 19, height: 19 }} alt="" /> {s.name} <span className="mb-actrow__sub">{s.on ? '● current' : s.sub}</span></button>
        ))}
      </div>
    </Sheet>
  );
}

function SettingsSheet({ nav }) {
  const [dark, setDark] = mtS(document.documentElement.dataset.theme === 'dark');
  const toggle = () => setDark((d) => { const nd = !d; document.documentElement.dataset.theme = nd ? 'dark' : ''; return nd; });
  return (
    <Sheet title="Settings" onClose={nav.closeSheet}>
      <div className="mb-toggle"><span className="mb-toggle__ic"><Icon name={dark ? 'moon' : 'sun'} /></span><div className="mb-toggle__b"><div className="mb-toggle__name">Dark theme</div><div className="mb-toggle__desc">Warm graphite</div></div><button className={'mb-switch' + (dark ? ' mb-switch--on' : '')} onClick={toggle}></button></div>
      <div className="mb-d__group">
        <div className="mb-d__row"><span className="mb-d__rowlabel">Default model</span><span className="mb-d__rowval" style={{ fontFamily: 'var(--pn-mono)', fontSize: 13 }}>opus-4.8 <Icon name="chevronR" /></span></div>
        <div className="mb-d__row"><span className="mb-d__rowlabel">Default mode</span><span className="mb-d__rowval">Safe <Icon name="chevronR" /></span></div>
        <div className="mb-d__row"><span className="mb-d__rowlabel">Notifications</span><span className="mb-d__rowval">On <Icon name="chevronR" /></span></div>
      </div>
    </Sheet>
  );
}

function ConfirmCloseDialog({ nav, data: s }) {
  return (
    <div className="mb-dlg-scrim" onClick={nav.closeSheet}>
      <div className="mb-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-dlg__hd"><span className="mb-dlg__ic mb-dlg__ic--danger"><Icon name="x" size={22} sw={2} /></span><span className="mb-dlg__t">Close session</span></div>
        <div className="mb-dlg__body">Close <strong>{s ? s.name : 'this session'}</strong>? Its live terminal will be stopped — the record stays in Archived.</div>
        <div className="mb-dlg__foot"><button className="mb-btn mb-btn--danger mb-btn--block" onClick={nav.closeSheet}>Close session</button><button className="mb-btn mb-btn--ghost mb-btn--block" onClick={nav.closeSheet}>Cancel</button></div>
      </div>
    </div>
  );
}

Object.assign(window, { TeamScreen, MemberDetail, MoreScreen, SkillsScreenM, FilesScreenM, Sheet, CreateTaskSheet, CreateMemberSheet, RunConfigSheet, SessActionsSheet, NewSessionSheet, SwitchSessionSheet, SettingsSheet, ConfirmCloseDialog });
