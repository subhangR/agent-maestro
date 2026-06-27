/* right-panels.jsx — three layouts for the Spaces (right) panel.
   A · Roster     — clean status-grouped rows
   B · Cards      — calm cards on white
   C · NowPlaying — live "what each agent is doing" (the signature move) */

function SpacesToolbar({ active }) {
  return (
    <div className="pn-tabs" style={{ paddingTop: 0 }}>
      <button className={'pn-tab' + (active === 'sessions' ? ' pn-tab--active' : '')} style={{ paddingTop: 13 }}>Sessions <span className="pn-tab-n">4</span></button>
      <button className={'pn-tab' + (active === 'resources' ? ' pn-tab--active' : '')} style={{ paddingTop: 13 }}>Resources</button>
      <span className="pn-head-spacer" style={{ flex: 1 }}></span>
      <button className="pn-ib" title="New space" style={{ alignSelf: 'center' }}><Icon name="plus" /></button>
      <button className="pn-ib" title="Collapse" style={{ alignSelf: 'center' }}><Icon name="chevronR" /></button>
    </div>
  );
}

function QuickLaunch() {
  return (
    <div className="pn-quick">
      <button className="pn-qchip"><span className="pn-plus">＋</span> Terminal</button>
      <button className="pn-qchip"><img src="../assets/claude-code-icon.png" alt="" /> Claude</button>
      <button className="pn-qchip"><img src="../assets/openai-codex-icon.png" alt="" /> Codex</button>
      <button className="pn-qchip"><img src="../assets/gemini-logo.png" alt="" /> Gemini</button>
    </div>
  );
}

/* ============================== A · ROSTER ============================== */
function SessRow({ kind, name, status, statusText, elapsed, tasks, live, active, wait }) {
  return (
    <div className={'pn-sess' + (active ? ' pn-sess--active' : '') + (wait ? ' pn-sess--wait' : '')}>
      <AgentTile kind={kind} lg />
      <div className="pn-sess__body">
        <div className="pn-sess__name">{name}</div>
        <div className="pn-sess__status">
          <span className={'pn-dot-wrap'}><span className={'pn-dot pn-dot--' + status + (live ? ' pn-dot--live' : '')}></span></span>
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
function RosterRight() {
  return (
    <div className="pn-panel" style={{ borderLeft: '1px solid var(--pn-line-2)' }}>
      <SpacesToolbar active="sessions" />
      <QuickLaunch />
      <div className="pn-scroll">
        <div className="pn-sec-head"><span className="pn-eyebrow">Running <span className="pn-count">· 2</span></span><span className="pn-line"></span></div>
        <div className="pn-list">
          <SessRow kind="claude" name="fluffy-starlight" status="run" statusText="Editing SessionTerminal.tsx" elapsed="4m" tasks="#142" live active />
          <SessRow kind="codex" name="Alexa coordinator" status="run" statusText="Running test suite" elapsed="12m" tasks="3" live />
        </div>

        <div className="pn-sec-head"><span className="pn-eyebrow">Needs input <span className="pn-count">· 1</span></span><span className="pn-line"></span></div>
        <div className="pn-list">
          <SessRow kind="claude" name="vast-neumann" status="wait" statusText="Waiting on your reply" elapsed="2m" tasks="#151" wait />
        </div>

        <div className="pn-sec-head"><span className="pn-eyebrow">Idle <span className="pn-count">· 1</span></span><span className="pn-line"></span></div>
        <div className="pn-list">
          <SessRow kind="gemini" name="concurrent-cosmos" status="idle" statusText="Idle" elapsed="1h" />
          <SessRow kind="terminal" name="zesty-wave" status="idle" statusText="Exited · code 0" elapsed="3h" />
        </div>
      </div>
      <div className="pn-fade"></div>
      <div className="pn-foot">
        <button className="pn-btn pn-btn--block"><Icon name="plus" size={14} /> New session</button>
      </div>
    </div>
  );
}

/* ============================== B · CARDS ============================== */
function SessCard({ kind, name, pill, pillText, activity, tasks, elapsed, live }) {
  return (
    <div className="pn-card-s">
      <div className="pn-card-s__top">
        <AgentTile kind={kind} lg />
        <span className="pn-card-s__name">{name}</span>
        <span className={'pn-pill pn-pill--' + pill}>
          <span className="pn-dot-wrap"><span className={'pn-dot pn-dot--' + (pill === 'run' ? 'run' : pill === 'wait' ? 'wait' : 'idle') + (live ? ' pn-dot--live' : '')}></span></span>
          {pillText}
        </span>
      </div>
      <div className="pn-card-s__act"><span className="pn-caret">›</span><span>{activity}</span></div>
      <div className="pn-card-s__foot">
        {tasks && <span className="pn-chip">{tasks}</span>}
        <span className="pn-meta" style={{ marginLeft: 'auto' }}><Icon name="clock" size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />{elapsed}</span>
      </div>
    </div>
  );
}
function CardsRight() {
  return (
    <div className="pn-panel" style={{ borderLeft: '1px solid var(--pn-line-2)' }}>
      <SpacesToolbar active="sessions" />
      <QuickLaunch />
      <div className="pn-scroll">
        <div className="pn-cards">
          <SessCard kind="claude" name="fluffy-starlight" pill="run" pillText="Running" live activity="Reparenting terminal nodes via registry…" tasks="#142" elapsed="4m" />
          <SessCard kind="claude" name="vast-neumann" pill="wait" pillText="Needs input" activity="Asking: which Opus 1M gap to close?" tasks="#151" elapsed="2m" />
          <SessCard kind="codex" name="Alexa coordinator" pill="run" pillText="Running" live activity="Running integration tests on staging…" tasks="3 tasks" elapsed="12m" />
          <SessCard kind="gemini" name="concurrent-cosmos" pill="idle" pillText="Idle" activity="Last: summarized the WebSocket pipeline" tasks="#138" elapsed="1h" />
        </div>
      </div>
      <div className="pn-fade"></div>
      <div className="pn-foot">
        <button className="pn-btn pn-btn--block"><Icon name="plus" size={14} /> New session</button>
      </div>
    </div>
  );
}

/* ============================== C · NOW PLAYING ============================== */
function NpItem({ kind, name, elapsed, say, typing, prog }) {
  return (
    <div className="pn-np__item">
      <div className="pn-np__top">
        <AgentTile kind={kind} lg />
        <span className="pn-np__name">{name}</span>
        <span className="pn-dot-wrap"><span className="pn-dot pn-dot--run pn-dot--live"></span></span>
        <span className="pn-np__elapsed">{elapsed}</span>
      </div>
      <div className="pn-np__say">
        “{say}”
        {typing && <span className="pn-typing"><i></i><i></i><i></i></span>}
      </div>
      <div className="pn-np__bar"><i style={{ width: prog + '%' }}></i></div>
    </div>
  );
}
function NowPlayingRight() {
  return (
    <div className="pn-panel" style={{ borderLeft: '1px solid var(--pn-line-2)' }}>
      <SpacesToolbar active="sessions" />
      <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--pn-serif)', fontSize: 20, fontWeight: 500, color: 'var(--pn-ink)', whiteSpace: 'nowrap' }}>Now playing</span>
        <span className="pn-chip" style={{ marginLeft: 'auto' }}>2 live</span>
      </div>
      <div className="pn-scroll">
        <div className="pn-np">
          <NpItem kind="claude" name="fluffy-starlight" elapsed="4m12s" say="Reparenting the terminal node, then I’ll re-run the fit" typing prog={62} />
          <NpItem kind="codex" name="Alexa coordinator" elapsed="12m" say="Integration tests passing — 14 of 18 green so far" typing prog={78} />
        </div>

        <div className="pn-sec-head" style={{ paddingTop: 18 }}><span className="pn-eyebrow">Needs you <span className="pn-count">· 1</span></span><span className="pn-line"></span></div>
        <div className="pn-list">
          <SessRow kind="claude" name="vast-neumann" status="wait" statusText="Asking about the Opus 1M gap" elapsed="2m" tasks="#151" wait />
        </div>

        <div className="pn-offstage">
          <span className="pn-eyebrow">Off stage</span>
          <div className="pn-off-row"><AgentTile kind="gemini" /><span className="pn-off-row__name">concurrent-cosmos</span><span className="pn-meta">idle · 1h</span></div>
          <div className="pn-off-row"><AgentTile kind="terminal" /><span className="pn-off-row__name">zesty-wave</span><span className="pn-meta">exited · 3h</span></div>
        </div>
      </div>
      <div className="pn-fade"></div>
      <div className="pn-foot">
        <button className="pn-btn pn-btn--block"><Icon name="plus" size={14} /> New session</button>
      </div>
    </div>
  );
}

Object.assign(window, { RosterRight, CardsRight, NowPlayingRight });
