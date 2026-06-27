/* views.jsx — Team members list, Files tree, Skills list, Confirm dialogs.
   Relies on kit.jsx (Icon, AgentTile) + tiles.jsx (Avatar). */
const { useState: uS } = React;

/* ============================ TEAM MEMBERS ============================ */
function MemberRow({ m, archived }) {
  const [open, setOpen] = uS(m.open || false);
  return (
    <div className={'pn-mem' + (archived ? ' pn-mem--archived' : '')}>
      <div className="pn-mem__main" onClick={() => setOpen((v) => !v)}>
        <span className={'pn-mem__av' + (m.isDefault ? ' pn-mem__av--ring' : '')}>{m.avatar}</span>
        <div className="pn-mem__body">
          <div className="pn-mem__name">{m.name}</div>
          {m.role && <div className="pn-mem__role">{m.role}</div>}
        </div>
        <div className="pn-mem__badges">
          {m.profile
            ? <span className="pn-mbadge pn-mbadge--profile">◈ {m.profile}</span>
            : <span className="pn-mbadge pn-mbadge--model"><img src={'../assets/' + (m.agent === 'claude' ? 'claude-code-icon' : m.agent === 'codex' ? 'openai-codex-icon' : 'gemini-logo') + '.png'} alt="" /> {m.model}</span>}
          {m.scope === 'global' && <span className="pn-mbadge pn-mbadge--global"><Icon name="globe" size={11} /> GLOBAL</span>}
          {m.isDefault && <span className="pn-mbadge pn-mbadge--default">DEFAULT</span>}
        </div>
        <span className={'pn-mem__chev' + (open ? ' pn-mem__chev--open' : '')}><Icon name="chevronD" size={14} /></span>
      </div>
      {open && (
        <div className="pn-mem__exp">
          {m.role && <div className="pn-mem__block"><div className="pn-mem__blocklabel">Role</div><div className="pn-mem__blocktext">{m.role}</div></div>}
          {m.identity && <div className="pn-mem__block"><div className="pn-mem__blocklabel">Instructions</div><div className="pn-mem__blocktext pn-mem__blocktext--mono">{m.identity}</div></div>}
          {m.skills && <div className="pn-mem__block"><div className="pn-mem__blocklabel">Skills</div><div className="pn-mem__skills">{m.skills.map((s) => <span key={s} className="pn-skill__tag">{s}</span>)}</div></div>}
          <div className="pn-mem__actions">
            {!archived && <button className="pn-btn pn-btn--primary" style={{ height: 28 }}><Icon name="play" size={12} /> Run</button>}
            <span className="pn-sp"></span>
            {archived
              ? <><button className="pn-btn" style={{ height: 28 }}><Icon name="refresh" size={12} /> Restore</button><button className="pn-btn pn-btn--ghost" style={{ height: 28, color: 'var(--pn-block)' }}><Icon name="trash" size={12} /> Delete</button></>
              : <><button className="pn-btn" style={{ height: 28 }}>{m.isDefault ? 'Configure' : 'Edit'}</button><button className="pn-btn pn-btn--ghost" style={{ height: 28 }}><Icon name="archiveBox" size={12} /> Archive</button></>}
          </div>
        </div>
      )}
    </div>
  );
}

const MEMBERS = [
  { name: 'Rhea', avatar: '🎻', role: 'Reparent strike lead', agent: 'claude', model: 'Opus 4.8', isDefault: true, identity: 'You lead the terminal-reparenting fix. Prefer the registry ref over DOM moves; always re-run fit.fit() after a reparent.', skills: ['debugging', 'code-review'] },
  { name: 'Kit', avatar: '🎹', role: 'Pipeline & WebSocket', agent: 'codex', model: '5.3-codex', identity: 'You own the realtime pipeline. Keep session updates idempotent and deduped.', skills: ['write-tests'] },
  { name: 'Ada', avatar: '🥁', role: 'Test runner', profile: 'fast-haiku', agent: 'claude', model: 'Haiku', scope: 'global', identity: 'You run and triage the test suite, reporting failures crisply.' },
];

function TeamMembersView() {
  const [tab, setTab] = uS('active');
  return (
    <div className="pn-vframe pn-vframe--tall">
      <div className="pn-vhd">
        <Icon name="users" size={17} style={{ color: 'var(--pn-ink-3)' }} />
        <span className="pn-vhd__title">Team</span>
        <span className="pn-chip">{MEMBERS.length}</span>
        <span className="pn-vhd__sp"></span>
        <button className="pn-btn pn-btn--primary" style={{ height: 30 }}><Icon name="plus" size={14} /> New member</button>
      </div>
      <div className="pn-vsearch"><Icon name="search" /><input placeholder="Search members" /></div>
      <div className="pn-vsec"><div className="pn-vtoggle"><button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>Active <span className="n">3</span></button><button className={tab === 'archived' ? 'on' : ''} onClick={() => setTab('archived')}>Archived <span className="n">1</span></button></div></div>
      <div className="pn-vscroll">
        {tab === 'active'
          ? MEMBERS.map((m, i) => <MemberRow key={i} m={i === 0 ? { ...m, open: true } : m} />)
          : <MemberRow m={{ name: 'Milo', avatar: '🎺', role: 'Docs writer (retired)', agent: 'gemini', model: 'Gemini 2.5' }} archived />}
      </div>
    </div>
  );
}

/* ============================ FILES ============================ */
function FRow({ f }) {
  const [open, setOpen] = uS(f.open ?? true);
  const pad = 10 + f.depth * 15;
  const isFolder = f.kind === 'folder';
  return (
    <>
      <div className={'pn-frow' + (f.active ? ' pn-frow--active' : '')} style={{ paddingLeft: pad }} onClick={() => isFolder && setOpen((v) => !v)}>
        {isFolder
          ? <span className={'pn-frow__tw' + (open ? ' pn-frow__tw--open' : '')}><Icon name="chevronR" /></span>
          : <span className="pn-frow__tw"></span>}
        <span className={'pn-frow__ic pn-frow__ic--' + (isFolder ? 'folder' : 'file')}>
          {isFolder ? <Icon name={open ? 'folderOpen' : 'folder'} size={14} /> : <Icon name={f.code ? 'fileCode' : 'doc'} size={13} />}
        </span>
        <span className="pn-frow__name" style={f.git === 'd' ? { textDecoration: 'line-through', opacity: 0.6 } : null}>{f.name}</span>
        {f.git && <span className={'pn-frow__git pn-frow__git--' + f.git}>{f.git === 'm' ? 'M' : f.git === 'a' ? 'A' : f.git === 'd' ? 'D' : '?'}</span>}
      </div>
      {isFolder && open && f.children && f.children.map((c, i) => <FRow key={i} f={c} />)}
    </>
  );
}
const TREE = [
  { name: 'src', kind: 'folder', depth: 0, open: true, children: [
    { name: 'components', kind: 'folder', depth: 1, open: true, children: [
      { name: 'SessionTerminal.tsx', kind: 'file', code: true, depth: 2, git: 'm', active: true },
      { name: 'TeamView.tsx', kind: 'file', code: true, depth: 2, git: 'm' },
      { name: 'MaestroPanel.tsx', kind: 'file', code: true, depth: 2 },
    ] },
    { name: 'stores', kind: 'folder', depth: 1, open: false, children: [] },
    { name: 'terminal-theme.ts', kind: 'file', code: true, depth: 1, git: 'a' },
    { name: 'main.tsx', kind: 'file', code: true, depth: 1 },
  ] },
  { name: 'docs', kind: 'folder', depth: 0, open: false, children: [] },
  { name: 'old-theme.css', kind: 'file', depth: 0, git: 'd' },
  { name: 'package.json', kind: 'file', depth: 0 },
  { name: 'README.md', kind: 'file', depth: 0, git: 'm' },
];
function FilesView() {
  return (
    <div className="pn-vframe pn-vframe--tall">
      <div className="pn-vhd">
        <Icon name="folder" size={16} style={{ color: 'var(--pn-ink-3)' }} />
        <div style={{ minWidth: 0 }}>
          <div className="pn-vhd__title">Files</div>
          <div className="pn-files__path">~/code/agent-maestro</div>
        </div>
        <span className="pn-vhd__sp"></span>
        <button className="pn-ib" title="Refresh"><Icon name="refresh" /></button>
        <button className="pn-ib" title="Close"><Icon name="x" /></button>
      </div>
      <div className="pn-vscroll" style={{ paddingTop: 6 }}>
        {TREE.map((f, i) => <FRow key={i} f={f} />)}
      </div>
      <div className="pn-files__foot">
        <span className="pn-files__footchip"><span className="pn-frow__git pn-frow__git--m">M</span> 3</span>
        <span className="pn-files__footchip"><span className="pn-frow__git pn-frow__git--a">A</span> 1</span>
        <span className="pn-files__footchip"><span className="pn-frow__git pn-frow__git--d">D</span> 1</span>
        <span style={{ marginLeft: 'auto' }}>main</span>
      </div>
    </div>
  );
}

/* ============================ SKILLS ============================ */
function SkillCard({ s }) {
  const [open, setOpen] = uS(s.open || false);
  return (
    <div className="pn-skill">
      <div className="pn-skill__hd" onClick={() => setOpen((v) => !v)}>
        <span className="pn-skill__ic"><Icon name="sparkles" /></span>
        <div className="pn-skill__body">
          <div className="pn-skill__namerow">
            <span className="pn-skill__name">{s.name}</span>
            <span className="pn-skill__badges">
              {s.source && <span className="pn-sbadge pn-sbadge--src">{s.source}</span>}
              {s.version && <span className="pn-sbadge pn-sbadge--ver">v{s.version}</span>}
            </span>
          </div>
          <div className="pn-skill__desc">{s.desc}</div>
        </div>
      </div>
      {open && (
        <div className="pn-skill__exp">
          {s.triggers && <div className="pn-skill__row"><span className="pn-skill__rowlabel">triggers</span><span className="pn-skill__rowval">{s.triggers}</span></div>}
          {s.tags && <div className="pn-skill__row"><span className="pn-skill__rowlabel">tags</span><span className="pn-skill__rowval"><span className="pn-skill__tags">{s.tags.map((t) => <span key={t} className="pn-skill__tag">{t}</span>)}</span></span></div>}
          {s.path && <div className="pn-skill__row"><span className="pn-skill__rowlabel">path</span><span className="pn-skill__rowval pn-skill__path">{s.path}</span></div>}
        </div>
      )}
    </div>
  );
}
const PROJECT_SKILLS = [
  { name: 'code-review', source: '.claude', version: '1.2', desc: 'Reviews diffs for correctness, style, and missed edge cases before a PR.', triggers: 'review, pr, diff', tags: ['quality', 'git'], path: '.claude/skills/code-review/SKILL.md', open: true },
  { name: 'write-tests', source: '.claude', version: '0.9', desc: 'Generates and runs unit + integration tests for changed modules.', triggers: 'test, coverage', tags: ['testing'] },
];
const GLOBAL_SKILLS = [
  { name: 'debugging', source: '.agents', version: '2.0', desc: 'Systematic root-cause analysis: reproduce, bisect, isolate, fix.', triggers: 'bug, crash, repro', tags: ['debug'] },
  { name: 'find-skills', source: '.claude', desc: 'Discover relevant skills for your project from skills.sh.', tags: ['meta'] },
];
function SkillsView() {
  const [tab, setTab] = uS('installed');
  return (
    <div className="pn-vframe pn-vframe--tall">
      <div className="pn-vhd">
        <Icon name="sparkles" size={16} style={{ color: 'var(--pn-ink-3)' }} />
        <span className="pn-vhd__title">Skills</span>
        <span className="pn-vhd__sp"></span>
        <div className="pn-vtoggle"><button className={tab === 'installed' ? 'on' : ''} onClick={() => setTab('installed')}>Installed <span className="n">4</span></button><button className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>Marketplace</button></div>
      </div>
      <div className="pn-vsearch"><Icon name="search" /><input placeholder={tab === 'installed' ? 'Filter skills' : 'Search skills.sh'} /></div>
      {tab === 'installed' ? (
        <div className="pn-vscroll" style={{ paddingTop: 6 }}>
          <div className="pn-vsec"><span className="pn-eyebrow"><Icon name="folder" size={11} style={{ verticalAlign: '-1px', marginRight: 5 }} />Project · {PROJECT_SKILLS.length}</span><span className="pn-line"></span></div>
          {PROJECT_SKILLS.map((s, i) => <SkillCard key={i} s={s} />)}
          <div className="pn-vsec"><span className="pn-eyebrow"><Icon name="globe" size={11} style={{ verticalAlign: '-1px', marginRight: 5 }} />Global · {GLOBAL_SKILLS.length}</span><span className="pn-line"></span></div>
          {GLOBAL_SKILLS.map((s, i) => <SkillCard key={i} s={s} />)}
        </div>
      ) : (
        <div className="pn-vscroll" style={{ padding: '14px 12px' }}>
          <div style={{ fontFamily: 'var(--pn-serif)', fontSize: 17, color: 'var(--pn-ink)', marginBottom: 4 }}>skills.sh</div>
          <div style={{ fontSize: 12, color: 'var(--pn-ink-3)', marginBottom: 14 }}>The open agent-skills ecosystem. Works with Claude Code, Codex, Gemini &amp; more.</div>
          {[{ n: 'nextjs', r: 'vercel/next.js-skill', d: 'Next.js development best practices', i: '2.1k' }, { n: 'typescript', r: 'anthropics/typescript-skill', d: 'TypeScript best practices', i: '5.4k' }, { n: 'react', r: 'facebook/react-skill', d: 'React development patterns', i: '4.0k' }].map((x) => (
            <div key={x.n} className="pn-skill"><div className="pn-skill__hd">
              <span className="pn-skill__ic"><Icon name="sparkles" /></span>
              <div className="pn-skill__body"><div className="pn-skill__namerow"><span className="pn-skill__name">{x.n}</span><span className="pn-skill__badges"><span className="pn-sbadge"><Icon name="download" size={9} style={{ verticalAlign: '-1px', marginRight: 2 }} />{x.i}</span></span></div><div className="pn-skill__desc">{x.d}</div><div className="pn-skill__path" style={{ marginTop: 4 }}>{x.r}</div></div>
              <button className="pn-btn" style={{ height: 26, alignSelf: 'center' }}><Icon name="plus" size={12} /> Add</button>
            </div></div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ CONFIRM DIALOGS ============================ */
function CloseSessionDialog({ name, childCount, liveCount, working }) {
  return (
    <div className="pn-scrim">
      <div className="pn-dlg">
        <div className="pn-dlg__hd">
          <span className="pn-dlg__icon pn-dlg__icon--danger"><Icon name="x" size={18} sw={2} /></span>
          <span className="pn-dlg__title">Close session</span>
        </div>
        <div className="pn-dlg__body">
          <div className="pn-dlg__msg">
            Close <strong>{name}</strong>{childCount ? <> and its {childCount} sub-session{childCount === 1 ? '' : 's'}</> : ''}?
          </div>
          {(liveCount || working) && (
            <div className="pn-dlg__warn pn-dlg__warn--danger">
              <Icon name="alert" size={14} />
              {working
                ? <span>This session has an agent currently working. Closing will stop it.</span>
                : <span>{liveCount} live terminal{liveCount === 1 ? '' : 's'} will be stopped. The record{childCount ? 's stay' : ' stays'} in Archived.</span>}
            </div>
          )}
        </div>
        <div className="pn-dlg__foot"><span className="pn-sp"></span><button className="pn-btn pn-btn--ghost">Cancel</button><button className="pn-btn" style={{ background: 'var(--pn-block)', color: '#fff', borderColor: 'var(--pn-block)' }}>Close session</button></div>
      </div>
    </div>
  );
}
function DiscardDialog() {
  return (
    <div className="pn-scrim">
      <div className="pn-dlg">
        <div className="pn-dlg__hd"><span className="pn-dlg__icon pn-dlg__icon--warn"><Icon name="alert" size={18} /></span><span className="pn-dlg__title">Unsaved changes</span></div>
        <div className="pn-dlg__body"><div className="pn-dlg__msg">You have unsaved task details. Are you sure you want to discard them?</div></div>
        <div className="pn-dlg__foot"><span className="pn-sp"></span><button className="pn-btn pn-btn--ghost">Keep editing</button><button className="pn-btn pn-btn--primary">Discard</button></div>
      </div>
    </div>
  );
}
function DeleteTaskDialog() {
  return (
    <div className="pn-scrim">
      <div className="pn-dlg">
        <div className="pn-dlg__hd"><span className="pn-dlg__icon pn-dlg__icon--danger"><Icon name="trash" size={17} /></span><span className="pn-dlg__title">Delete task</span></div>
        <div className="pn-dlg__body"><div className="pn-dlg__msg">Are you sure you want to delete <strong>"Fix terminal reparenting crash"</strong>? This task has <strong>3 subtasks</strong> that will also be deleted.</div></div>
        <div className="pn-dlg__foot"><span className="pn-sp"></span><button className="pn-btn pn-btn--ghost">Cancel</button><button className="pn-btn" style={{ background: 'var(--pn-block)', color: '#fff', borderColor: 'var(--pn-block)' }}>Delete</button></div>
      </div>
    </div>
  );
}

function Views() {
  return (
    <div className="pn-vstage">
      <div><div className="pn-vcap">Team members</div><TeamMembersView /></div>
      <div><div className="pn-vcap">Files</div><FilesView /></div>
      <div><div className="pn-vcap">Skills</div><SkillsView /></div>
      <div className="pn-dlg-stage">
        <div className="pn-vcap">Close session — with sub-sessions</div>
        <CloseSessionDialog name="Rhea" childCount={3} liveCount={2} />
        <div className="pn-vcap" style={{ marginTop: 8 }}>Close session — agent working</div>
        <CloseSessionDialog name="fluffy-starlight" working />
        <div className="pn-vcap" style={{ marginTop: 8 }}>Delete task</div>
        <DeleteTaskDialog />
        <div className="pn-vcap" style={{ marginTop: 8 }}>Discard changes</div>
        <DiscardDialog />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Views />);
