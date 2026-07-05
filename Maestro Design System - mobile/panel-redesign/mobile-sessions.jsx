/* mobile-sessions.jsx — Sessions list, Terminal screen, Team view, Board. */
const { useState: msS } = React;

/* =====================================================================
   SESSIONS
   ===================================================================== */
function SessCard({ s, child, onOpen, onActions }) {
  return (
    <div className={'mb-scard' + (s.needs ? ' mb-scard--needs' : '') + (child ? ' mb-scard--child' : '')} onClick={() => onOpen && onOpen(s)}>
      <span className="mb-scard__agent">
        {s.agent === 'terminal' ? <span style={{ fontFamily: 'var(--pn-mono)', color: 'var(--pn-run)', fontWeight: 700 }}>&gt;_</span> : <img src={'../assets/' + (s.agent === 'claude' ? 'claude-code-icon' : s.agent === 'codex' ? 'openai-codex-icon' : 'gemini-logo') + '.png'} alt="" />}
        {s.live && <span className="mb-livedot" style={{ background: s.dot }}></span>}
      </span>
      <div className="mb-scard__body">
        <div className="mb-scard__name">{s.name}</div>
        <div className="mb-scard__status">
          <span className={'pn-dot pn-dot--' + s.status + (s.live && s.status === 'run' ? ' pn-dot--live' : '')} style={{ position: 'relative' }}></span>
          <span className={'mb-scard__statustext' + (s.status === 'run' ? ' mb-scard__statustext--run' : s.status === 'wait' ? ' mb-scard__statustext--wait' : '')}>{s.statusText}</span>
        </div>
      </div>
      <div className="mb-scard__trail">
        <span className="mb-scard__elapsed">{s.elapsed}</span>
        <button className="mb-iconbtn mb-iconbtn--ghost" style={{ width: 28, height: 28 }} onClick={(e) => { e.stopPropagation(); onActions && onActions(s); }}><Icon name="more" size={16} /></button>
      </div>
    </div>
  );
}

function SessionsScreen({ nav }) {
  return (
    <>
      <div className="mb-head">
        <div className="mb-head__title"><span className="mb-head__eyebrow">Spaces</span><span className="mb-head__h">Sessions</span></div>
        <span className="mb-head__sp"></span>
        <button className="mb-iconbtn" onClick={() => nav.push('teamview')} title="Team view"><Icon name="teamview" /></button>
        <button className="mb-iconbtn"><Icon name="search" /></button>
      </div>
      <div className="mb-launch">
        <button className="mb-launchbtn"><span className="plus">＋</span> Terminal</button>
        <button className="mb-launchbtn"><img src="../assets/claude-code-icon.png" alt="" /> Claude</button>
        <button className="mb-launchbtn"><img src="../assets/openai-codex-icon.png" alt="" /> Codex</button>
        <button className="mb-launchbtn"><img src="../assets/gemini-logo.png" alt="" /> Gemini</button>
      </div>
      <div className="mb-body">
        <div className="mb-sec"><span className="mb-sec__t">Reparent strike team</span><span className="mb-sec__line"></span></div>
        <div className="mb-team">
          <div className="mb-team__hd"><span className="mb-team__dot" style={{ background: '#2f8f7f' }}></span><span className="mb-team__name">Rhea · coordinator</span><span className="mb-team__count">4 sessions</span></div>
          <SessCard s={{ name: 'Rhea', agent: 'claude', status: 'run', statusText: 'Coordinating 3 workers', elapsed: '14m', live: true, dot: '#7FC08C' }} onOpen={() => nav.push('terminal')} onActions={(s) => nav.sheet('sessActions', s)} />
          {M_SESSIONS_LIVE.map((s) => <SessCard key={s.id} s={s} child onOpen={() => nav.push('terminal')} onActions={(s) => nav.sheet('sessActions', s)} />)}
        </div>
        <div className="mb-sec"><span className="mb-sec__t">Idle <span className="n">· 2</span></span><span className="mb-sec__line"></span></div>
        {M_SESSIONS_IDLE.map((s) => <SessCard key={s.id} s={s} onOpen={() => nav.push('terminal')} onActions={(s) => nav.sheet('sessActions', s)} />)}
      </div>
      <button className="mb-fab" onClick={() => nav.sheet('newSession')}><Icon name="plus" /></button>
    </>
  );
}

/* =====================================================================
   TERMINAL (full screen)
   ===================================================================== */
function CtxGaugeM({ pct }) {
  const r = 8, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return <span className="mb-tstrip__gauge"><svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r={r} fill="none" stroke="#38301f" strokeWidth="2.3" /><circle cx="11" cy="11" r={r} fill="none" stroke="#7FC08C" strokeWidth="2.3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 11 11)" /></svg></span>;
}
function TerminalScreen({ nav }) {
  const [log, setLog] = msS(false);
  return (
    <div className="mb-term">
      <div className="mb-term__hd">
        <div className="mb-term__bar">
          <button className="mb-back" style={{ color: '#897f6b', paddingLeft: 0 }} onClick={() => nav.setTab('sessions')}><Icon name="chevronL" /></button>
          <span className="d"></span><b>fluffy-starlight</b>
          <button className="mb-term__switch" onClick={() => nav.sheet('switchSession')}>claude · opus-4.8 <Icon name="chevronD" size={12} /></button>
        </div>
      </div>
      <div className="mb-term__body">
        <div><span className="p">›</span> Analyzing terminal reparenting in <span className="f">AppWorkspace.tsx</span></div>
        <div className="dim">&nbsp;&nbsp;Read SessionTerminal.tsx · MultiProjectSessionsView.tsx</div>
        <div style={{ marginTop: 10 }}><span className="p">●</span> The board moves <span className="f">[data-terminal-id]</span> while</div>
        <div className="dim">&nbsp;&nbsp;TeamView moves <span className="f">term.element</span>. They disagree.</div>
        <div style={{ marginTop: 10 }}><span className="p">●</span> Editing <span className="f">MultiProjectSessionsView.tsx</span></div>
        <div className="ok">&nbsp;&nbsp;+ registry.current.get(id)?.term.element</div>
        <div className="ok">&nbsp;&nbsp;+ re-run fit.fit() after the move</div>
        <div style={{ marginTop: 10 }}><span className="ok">✓</span> <span className="dim">tests — 14 of 18 passing</span></div>
        <div style={{ marginTop: 10 }}><span className="p">›</span> Reparenting the node now<span className="mb-tcur"></span></div>
      </div>

      <div className={'mb-tlog' + (log ? ' mb-tlog--open' : '')}>
        <div className="mb-tlog__in">
          <div className="mb-tlog__turn"><span className="mb-tlog__role mb-tlog__role--u">you</span><span className="mb-tlog__txt">Fix the terminal reparenting crash when the board closes.</span></div>
          <div className="mb-tlog__turn"><span className="mb-tlog__role mb-tlog__role--a">claude</span><span className="mb-tlog__txt">Routing the board through the registry ref, then re-running fit.</span></div>
        </div>
      </div>

      <div className="mb-tstrip">
        <button className="mb-tstrip__btn" onClick={() => setLog((v) => !v)}><Icon name={log ? 'chevronD' : 'layers'} /></button>
        <div className="mb-tstrip__stats">
          <span className="mb-tstrip__stat"><CtxGaugeM pct={24} /><span className="v">48.2k</span><span className="k">/200k</span></span>
          <span className="mb-tstrip__div"></span>
          <span className="mb-tstrip__stat mb-tstrip__stat--a">⚡<span className="v">92%</span><span className="k">cache</span></span>
          <span className="mb-tstrip__stat"><span className="v">8</span><span className="k">turns</span></span>
          <span className="mb-tstrip__stat"><span className="v">23</span><span className="k">tools</span></span>
          <span className="mb-tstrip__stat"><span className="k">⧗</span><span className="v">4m</span></span>
        </div>
        <span className="mb-tstrip__div"></span>
        <button className="mb-tstrip__btn"><Icon name="paperclip" /></button>
        <button className="mb-tstrip__btn"><Icon name="pen" /></button>
        <button className="mb-tstrip__btn mb-tstrip__btn--cast"><span style={{ fontSize: 16 }}>✦</span></button>
      </div>

      <div className="mb-term__composer">
        <div className="mb-term__input"><span className="ph">Type / for commands…</span></div>
        <button className="mb-term__send"><Icon name="arrowRight" /></button>
      </div>
    </div>
  );
}

/* =====================================================================
   TEAM VIEW (coordinator + horizontal workers)
   ===================================================================== */
function TeamViewScreen({ nav }) {
  return (
    <div className="mb-push">
      <div className="mb-subhead">
        <button className="mb-back" onClick={nav.pop}><Icon name="chevronL" /> Sessions</button>
        <span className="mb-subhead__t">Team view</span>
        <div className="mb-subhead__r"><button className="mb-iconbtn mb-iconbtn--ghost"><Icon name="more" /></button></div>
      </div>
      <div className="mb-body">
        <div className="mb-tv">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 16px 10px' }}>
            <span className="mb-meta" style={{ fontSize: 12 }}>maestro-lead</span><Icon name="chevronR" size={12} style={{ color: 'var(--pn-ink-4)' }} /><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pn-ink)' }}>Rhea</span>
          </div>
          <div className="mb-tv__coord">
            <div className="mb-tv__coordhd">
              <span className="mb-av-emblem" style={{ width: 34, height: 34, boxShadow: '0 0 0 1.5px var(--pn-brand), 0 0 0 3px var(--pn-card)' }}><svg viewBox="0 0 24 24">{emblemById('violin').svg}</svg></span>
              <span className="mb-tv__coordname">Rhea</span>
              <span className="mb-tv__badge"><Icon name="baton" /> Coordinator</span>
            </div>
            <div className="mb-tv__coordterm">
              <div><span className="p">›</span> Coordinating reparent fix across 3 workers</div>
              <div className="dim">&nbsp;&nbsp;reviewing fluffy-starlight's diff…</div>
            </div>
          </div>
          <div className="mb-dlabel" style={{ padding: '4px 16px 8px' }}>Workers · 3</div>
          <div className="mb-tv__workers">
            <div className="mb-tv__wcard" onClick={() => nav.push('terminal')}>
              <div className="mb-tv__whd"><AgentTile kind="claude" /><span className="mb-tv__wname">fluffy-starlight</span><Glyph kind="working" size={14} /></div>
              <div className="mb-tv__wterm"><div><span className="p">›</span> Editing view</div><div className="ok">+ registry ref</div><div style={{ color: '#897f6b' }}>re-running fit…</div></div>
            </div>
            <div className="mb-tv__wcard mb-tv__wcard--needs" onClick={() => nav.push('terminal')}>
              <div className="mb-tv__whd"><AgentTile kind="claude" /><span className="mb-tv__wname">vast-neumann</span><Glyph kind="needsInput" size={14} /></div>
              <div className="mb-tv__wterm"><div><span className="p">›</span> Per-project or</div><div><span className="p">&nbsp;&nbsp;global?<span className="mb-tcur"></span></span></div></div>
              <div className="mb-tv__wfoot" style={{ color: 'var(--pn-wait)' }}>Needs input <span className="ar"><Icon name="arrowRight" size={13} /></span></div>
            </div>
            <div className="mb-tv__wcard" onClick={() => nav.push('teamview')}>
              <div className="mb-tv__whd"><AgentTile kind="codex" /><span className="mb-tv__wname">Alexa coordinator</span><Glyph kind="working" size={14} /></div>
              <div className="mb-tv__wterm"><div><span className="p">›</span> Delegating to 2</div><div className="dim">&nbsp;&nbsp;sub-workers</div></div>
              <div className="mb-tv__wfoot">2 workers — drill in <span className="ar"><Icon name="arrowRight" size={13} /></span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   BOARD (horizontal snap columns)
   ===================================================================== */
const M_BCOLS = [
  { status: 'todo', label: 'Backlog', tasks: [{ id: '151', title: 'Add a model-profile indirection layer', priority: 'medium' }, { id: '156', title: 'Voice directives — Alexa handoff', priority: 'low' }] },
  { status: 'blocked', label: 'Blocked', tasks: [{ id: '144', title: 'Migrate task ordering to server persistence', priority: 'medium' }] },
  { status: 'in_progress', label: 'In progress', tasks: [{ id: '142', title: 'Fix terminal reparenting crash on board close', priority: 'high', sessions: 2 }, { id: '138', title: 'WebSocket — dedupe session updates', priority: 'medium', sessions: 1 }] },
  { status: 'in_review', label: 'Review', tasks: [{ id: '149', title: 'Verify Opus 1M context window', priority: 'low' }] },
  { status: 'completed', label: 'Done', tasks: [{ id: '140', title: 'Add /loop recurring command', priority: 'low' }] },
];
const M_PRIO_DOT = { high: 'var(--pn-block)', medium: 'var(--pn-wait)', low: 'var(--pn-idle)' };
function BoardScreen({ nav }) {
  const [idx, setIdx] = msS(2);
  const onScroll = (e) => { const w = e.target.firstChild.offsetWidth + 12; setIdx(Math.round(e.target.scrollLeft / w)); };
  return (
    <div className="mb-push">
      <div className="mb-subhead">
        <button className="mb-back" onClick={nav.pop}><Icon name="chevronL" /> Tasks</button>
        <span className="mb-subhead__t">agent-maestro · board</span>
        <div className="mb-subhead__r"><button className="mb-iconbtn mb-iconbtn--ghost"><Icon name="sliders" /></button></div>
      </div>
      <div className="mb-pagedots">{M_BCOLS.map((c, i) => <i key={i} className={i === idx ? 'on' : ''}></i>)}</div>
      <div className="mb-board" onScroll={onScroll} ref={(el) => { if (el && !el._init) { el._init = true; el.scrollLeft = (el.firstChild.offsetWidth + 12) * 2; } }}>
        {M_BCOLS.map((col) => (
          <div className="mb-bcol" key={col.status}>
            <div className="mb-bcol__hd"><Glyph kind={col.status} size={15} /><span className="mb-bcol__t">{col.label}</span><span className="mb-bcol__n">{col.tasks.length}</span></div>
            <div className="mb-bcol__body">
              {col.tasks.map((t) => (
                <div className="mb-bcard" key={t.id} onClick={() => nav.push('taskDetail', { ...t, status: col.status, subs: null })}>
                  <div className="mb-bcard__top"><span className="mb-bcard__pdot" style={{ background: M_PRIO_DOT[t.priority] }}></span><span className="mb-bcard__t">{t.title}</span></div>
                  <div className="mb-bcard__foot"><span className="mb-meta">#{t.id}</span>{t.sessions && <span className="mb-meta"><span className="pn-dot pn-dot--run"></span>{t.sessions}</span>}{(col.status === 'todo' || col.status === 'blocked') && <button className="mb-tag mb-tag--green" style={{ marginLeft: 'auto', padding: '3px 9px' }}>$ work on</button>}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SessionsScreen, TerminalScreen, TeamViewScreen, BoardScreen });
