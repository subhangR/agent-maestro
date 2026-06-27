/* terminal-strip.jsx — the fused bottom strip (stats + log toggle + actions).
   Relies on kit.jsx (Icon). Self-contained dark palette via terminal-strip.css. */

function CtxGauge({ pct }) {
  const r = 10, c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <span className="pn-tstrip__gauge">
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle className="pn-tstrip__gauge__track" cx="13" cy="13" r={r} fill="none" strokeWidth="2.5" />
        <circle className="pn-tstrip__gauge__fill" cx="13" cy="13" r={r} fill="none" strokeWidth="2.5"
          strokeDasharray={c} strokeDashoffset={off} />
      </svg>
    </span>
  );
}

function TerminalStrip({ stats, live = true, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const s = stats || {
    ctxTokens: '48.2k', ctxPct: 24, ctxMax: '200k',
    cache: 92, out: '12.4k', turns: 8, tools: 23, duration: '4m 12s', model: 'opus-4.8',
  };
  return (
    <>
      <div className={'pn-tlog' + (open ? ' pn-tlog--open' : '')}>
        <div className="pn-tlog__inner">
          <div className="pn-tlog__turn"><span className="pn-tlog__role pn-tlog__role--user">you</span><span className="pn-tlog__text">Fix the terminal reparenting crash when the board closes.</span></div>
          <div className="pn-tlog__turn"><span className="pn-tlog__role pn-tlog__role--asst">claude</span><span className="pn-tlog__text">The board reparents <span style={{ color: '#CBB98A' }}>[data-terminal-id]</span> while TeamView moves <span style={{ color: '#CBB98A' }}>term.element</span>. I'll route the board through the registry ref.</span></div>
          <div className="pn-tlog__tool"><span className="pn-tlog__toolchev">▸</span><span className="pn-tlog__toolname">Edit</span><span className="pn-tlog__toolsum">MultiProjectSessionsView.tsx</span><span className="pn-tlog__diffstat"><span className="add">+12</span> <span className="rem">−4</span></span></div>
          <div className="pn-tlog__bash"><div className="pn-tlog__bashcmd"><span className="p">$</span>npm test -- reparent</div><div className="pn-tlog__bashout">PASS  reparent keeps terminal mounted{'\n'}PASS  fit() re-runs after move</div></div>
          <div className="pn-tlog__turn"><span className="pn-tlog__role pn-tlog__role--asst">claude</span><span className="pn-tlog__text">Reparenting the node now, then re-running the fit.</span></div>
        </div>
      </div>

      <div className={'pn-tstrip' + (open ? ' pn-tstrip--open' : '')}>
        <button className="pn-tstrip__log" onClick={() => setOpen((v) => !v)}>
          <span className="pn-tstrip__chev"><Icon name="chevronR" /></span>
          <span className="pn-tstrip__title">Session Log</span>
          {live && <span className="pn-tstrip__live"><span className="pn-tstrip__livedot"></span><span className="pn-tstrip__livetag">LIVE</span></span>}
        </button>
        <span className="pn-tstrip__div"></span>

        <div className="pn-tstrip__stats">
          <span className="pn-tstrip__ctx">
            <CtxGauge pct={s.ctxPct} />
            <span className="pn-tstrip__ctxlabels">
              <span className="pn-tstrip__ctxval"><b>{s.ctxTokens}</b> / {s.ctxMax}</span>
              <span className="pn-tstrip__ctxsub">context · {s.ctxPct}%</span>
            </span>
          </span>
          <span className="pn-tstrip__div"></span>
          <span className="pn-tstrip__stat pn-tstrip__stat--amber"><span className="pn-tstrip__bolt">⚡</span><span className="v">{s.cache}%</span><span className="k">cache</span></span>
          <span className="pn-tstrip__stat"><span className="k">out</span><span className="v">{s.out}</span></span>
          <span className="pn-tstrip__stat"><span className="v">{s.turns}</span><span className="k">turns</span></span>
          <span className="pn-tstrip__stat"><span className="v">{s.tools}</span><span className="k">tools</span></span>
          <span className="pn-tstrip__stat"><span className="k">⧗</span><span className="v">{s.duration}</span></span>
        </div>
        <span className="pn-tstrip__model"><span className="dotmod"></span>{s.model}</span>

        <span className="pn-tstrip__div"></span>
        <div className="pn-tstrip__actions">
          <button className="pn-tstrip__btn" data-tip="Attach files — inject @paths"><Icon name="paperclip" /></button>
          <button className="pn-tstrip__btn" data-tip="Draw — sketch into session"><Icon name="pen" /></button>
          <button className="pn-tstrip__btn pn-tstrip__btn--cast" data-tip="Cast spell — inject prompt"><span className="pn-tstrip__spark">✦</span></button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { TerminalStrip });
