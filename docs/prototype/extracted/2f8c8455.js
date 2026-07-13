/* app.jsx — the Maestro desktop shell hosting the Spell system.
   Holds all spell state and renders the studio / cast / drawers / popovers. */

const { useState: uSt, useEffect: uEf, useRef: uRf } = React;

/* ---------- shell: icon rail ---------- */
const RAIL = [
  ['tasks', 'listChecks', 'Tasks', 6],
  ['members', 'users', 'Members', 4],
  ['teams', 'team', 'Teams', null],
  ['skills', 'sparkles', 'Skills', null],
  ['files', 'folder', 'Files', null],
];

function App() {
  const [dark, setDark] = uSt(false);
  const [disconnected, setDisconnected] = uSt(false);
  const [loadState, setLoadState] = uSt('ready'); // ready | loading | error

  const [custom, setCustom] = uSt(() => CUSTOM_SPELLS.map(s => ({ ...s })));
  const spells = [...SEED_SPELLS, ...custom];
  const spellsById = Object.fromEntries(spells.map(s => [s.id, s]));

  const [actives, setActives] = uSt(() => ACTIVE.map(a => ({ ...a })));
  const [ensembles, setEnsembles] = uSt([
    { id: 'ens-reparent', name: 'Reparent strike team', spellId: 'seed-context-primer', memberIds: ['sess-alexa','sess-fluffy'], objective: 'Land the terminal-reparent fix and its regression test together.' },
  ]);

  const [overlay, setOverlay] = uSt(null); // {type:'studio'|'cast'|'spellbook'|'activity'|'send'|'ensemble', ...}
  const [popover, setPopover] = uSt(null); // {sessionId, anchor}
  const [confirmCfg, setConfirmCfg] = uSt(null);
  const [toasts, setToasts] = uSt([]);

  uEf(() => { document.documentElement.dataset.theme = dark ? 'dark' : ''; }, [dark]);

  /* live loop tick */
  uEf(() => {
    if (disconnected) return;
    const t = setInterval(() => {
      setActives(cur => cur.map(a => {
        if (!a.enabled) return a;
        const s = spellsById[a.spellId];
        const loopRule = s && s.rules.find(r => r.action.type === 'continue-loop' && r.enabled);
        if (!loopRule) return a;
        const it = a.ruleIterations[loopRule.id] || 0;
        const max = loopRule.action.maxIterations || 1;
        if (it >= max) return a;
        return { ...a, ruleIterations: { ...a.ruleIterations, [loopRule.id]: it + 1 } };
      }));
    }, 3200);
    return () => clearInterval(t);
  }, [disconnected, custom]);

  /* helpers */
  const activeCountBySpell = {};
  actives.forEach(a => { activeCountBySpell[a.spellId] = (activeCountBySpell[a.spellId] || 0) + 1; });
  const confirm = (cfg) => setConfirmCfg(cfg);

  let TID = 0;
  function toast(msg, undo) {
    const id = 't' + (Date.now()) + (TID++);
    setToasts(cur => [...cur, { id, msg, undo }]);
    setTimeout(() => setToasts(cur => cur.filter(t => t.id !== id)), 6000);
  }
  const dismissToast = (id) => setToasts(cur => cur.filter(t => t.id !== id));

  /* spell CRUD */
  function saveSpell(spell, mode) {
    const clean = cloneSpell(spell);
    clean.rules.forEach(r => { if (r.action._ack !== undefined) { /* keep ack */ } });
    if (mode === 'create') {
      clean.id = 'custom-' + Date.now(); clean.isDefault = false; clean.createdAt = Date.now(); clean.updatedAt = Date.now();
      setCustom(cur => [...cur, clean]);
      toast(<>Created <b>{clean.name}</b>. It's in your spellbook.</>);
    } else {
      clean.updatedAt = Date.now();
      setCustom(cur => cur.map(s => s.id === clean.id ? clean : s));
      toast(<>Saved <b>{clean.name}</b>. {activeCountBySpell[clean.id] ? 'Changes apply on the next trigger.' : ''}</>);
    }
    return clean;
  }
  function deleteSpell(id) {
    const s = spellsById[id];
    setCustom(cur => cur.filter(x => x.id !== id));
    setActives(cur => cur.filter(a => a.spellId !== id));
    setConfirmCfg(null);
    setOverlay(null);
    toast(<>Deleted <b>{s ? s.name : 'spell'}</b>.</>);
  }

  /* cast */
  function cast(spell, sessionIds, mode, ensembleName) {
    const ensembleId = mode === 'coordinate' ? 'ens-' + Date.now() : null;
    const created = sessionIds.map((sid, i) => ({
      id: 'act-' + Date.now() + '-' + i, sessionId: sid, spellId: spell.id, color: spell.color,
      enabled: true, ruleIterations: {}, castAt: Date.now() + i, ensembleId,
    }));
    setActives(cur => [...cur, ...created]);
    if (ensembleId) {
      const ens = { id: ensembleId, name: ensembleName || 'Ensemble', spellId: spell.id, memberIds: sessionIds, objective: '' };
      setEnsembles(cur => [...cur, ens]);
      setOverlay({ type: 'ensemble', ensembleId });
    } else {
      setOverlay(null);
    }
    const names = sessionIds.map(id => (SESSIONS.find(s => s.id === id) || {}).name).filter(Boolean);
    toast(<>Cast <b>{spell.name}</b> on {names.length > 1 ? names.length + ' sessions' : names[0]}.</>, () => {
      setActives(cur => cur.filter(a => !created.find(c => c.id === a.id)));
      if (ensembleId) setEnsembles(cur => cur.filter(e => e.id !== ensembleId));
    });
  }
  function deactivate(activeId) {
    const a = actives.find(x => x.id === activeId);
    const s = a && spellsById[a.spellId];
    setActives(cur => cur.filter(x => x.id !== activeId));
    if (a) toast(<>Deactivated <b>{s ? s.name : 'spell'}</b>.</>, () => setActives(cur => [...cur, a]));
  }
  function deactivateAll() {
    const snapshot = actives;
    setActives([]);
    setConfirmCfg(null);
    toast(<>Deactivated <b>all {snapshot.length} spells</b>.</>, () => setActives(snapshot));
  }
  const toggleActive = (id) => setActives(cur => cur.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  const resetLoop = (id, ruleId) => setActives(cur => cur.map(a => a.id === id ? { ...a, ruleIterations: { ...a.ruleIterations, [ruleId]: 0 } } : a));

  function openPopover(e, sessionId) {
    const r = e.currentTarget.getBoundingClientRect();
    setPopover({ sessionId, anchor: { top: r.bottom + 6, left: r.right } });
  }
  function openCast(spell) { setOverlay({ type: 'cast', spellId: spell.id }); setPopover(null); }
  function openStudioForCast() { setOverlay({ type: 'studio', mode: 'detail' }); }

  const totalActive = actives.length;

  return (
    <div className="pn-shell sp-root">
      {/* top bar */}
      <div className="pn-top">
        <div className="pn-lights"><i></i><i></i><i></i></div>
        <div className="pn-ptabs">
          <span className="pn-ptab pn-ptab--active"><span className="pn-dot pn-dot--run"></span> agent-maestro</span>
          <span className="pn-ptab">voice-alexa</span>
        </div>
        <div className="pn-top-r">
          <button className="pn-ib" title={disconnected ? 'Reconnect (demo)' : 'Simulate disconnect'} onClick={() => setDisconnected(d => !d)} style={disconnected ? { color: 'var(--pn-wait)' } : undefined}><Icon name={disconnected ? 'wifiOff' : 'wifi'} /></button>
          <button className="pn-ib" title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(d => !d)}><Icon name={dark ? 'sun' : 'moon'} /></button>
          <button className="pn-ib" title="Command"><span className="pn-kbd">⌘K</span></button>
        </div>
      </div>

      <div className="pn-shell-body">
        {/* icon rail */}
        <div className="pn-rail">
          <span className="pn-rail-mark"><Mark size={24} /></span>
          {RAIL.map(([id, icon, label, badge]) => (
            <button key={id} className={'pn-rail-btn' + (id === 'tasks' ? ' pn-rail-btn--active' : '')} title={label}>
              <Icon name={icon} sw={1.55} />{badge ? <span className="pn-rail-badge">{badge}</span> : null}
            </button>
          ))}
          <button className="pn-rail-btn" title="Spells" onClick={() => setOverlay({ type: 'studio', mode: 'detail' })} style={{ color: 'var(--pn-brand)' }}>
            <Icon name="wand" sw={1.6} />{totalActive ? <span className="pn-rail-badge" style={{ background: 'var(--pn-brand)' }}>{totalActive}</span> : null}
          </button>
          <span className="pn-rail-spacer"></span>
          <button className="pn-rail-btn" title="Settings"><Icon name="settings" sw={1.55} /></button>
        </div>

        {/* task panel (left) with S7 task-spell assignment */}
        <div className="pn-mp">
          <div className="pn-head"><span className="pn-proj">agent-maestro <Icon name="chevronD" size={13} /></span></div>
          <div className="pn-scroll" style={{ position: 'relative' }}>
            <div className="pn-sec-head"><span className="pn-eyebrow">In progress <span className="pn-count">· 2</span></span><span className="pn-line"></span></div>

            <div className="pn-row">
              <div className="pn-row__lead" style={{ paddingTop: 3 }}><span className="pn-dot-wrap"><span className="pn-dot pn-dot--run pn-dot--live"></span></span></div>
              <div className="pn-row__body">
                <div className="pn-row__title">Fix terminal reparenting crash on board close</div>
                <div className="pn-row__sub"><span className="pn-tag pn-tag--high">high</span><span className="pn-meta">#st1 · 3 subtasks</span></div>
                {/* S7 — spells on spawn */}
                <div className="sp-taskspells" style={{ marginTop: 9, padding: '9px 10px', border: '1px solid var(--pn-line)', borderRadius: 'var(--pn-r-sm)', background: 'var(--pn-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                    <Icon name="wand" size={12} style={{ color: 'var(--pn-brand)' }} />
                    <span className="sp-eyebrow" style={{ fontSize: 9 }}>Spells on spawn</span>
                    <span style={{ flex: 1 }}></span>
                    <button className="sp-ibs" style={{ width: 20, height: 20 }} title="Attach a spell" onClick={() => setOverlay({ type: 'studio', mode: 'detail' })}><Icon name="plus" size={13} /></button>
                  </div>
                  <div className="sp-chips">
                    <span className="sp-chip"><span className="sp-chip__dot" style={{ background: SPELL_COLORS.cyan }}></span>⚙️ CI Guard</span>
                    <span className="sp-chip"><span className="sp-chip__dot" style={{ background: SPELL_COLORS.indigo }}></span>📚 Context Primer</span>
                  </div>
                  <div className="sp-fhint" style={{ marginTop: 6, fontSize: 10.5 }}>Auto-activate when a session spawns for this task.</div>
                </div>
              </div>
            </div>

            <div className="pn-row">
              <div className="pn-row__lead" style={{ paddingTop: 3 }}><span className="pn-dot-wrap"><span className="pn-dot pn-dot--wait"></span></span></div>
              <div className="pn-row__body">
                <div className="pn-row__title">WebSocket pipeline — dedupe session updates</div>
                <div className="pn-row__sub"><span className="pn-tag pn-tag--med">medium</span><span className="pn-meta">#st2</span></div>
              </div>
            </div>

            <div className="pn-sec-head"><span className="pn-eyebrow">Up next <span className="pn-count">· 3</span></span><span className="pn-line"></span></div>
            <div className="pn-row"><div className="pn-row__lead" style={{ paddingTop: 3 }}><span className="pn-dot pn-dot--idle"></span></div><div className="pn-row__body"><div className="pn-row__title">Add a model-profile indirection layer</div><div className="pn-row__sub"><span className="pn-tag pn-tag--med">medium</span><span className="pn-meta">#st3 · 2 subtasks</span></div></div></div>
            <div className="pn-row"><div className="pn-row__lead" style={{ paddingTop: 3 }}><span className="pn-dot pn-dot--block"></span></div><div className="pn-row__body"><div className="pn-row__title">Migrate task ordering to server persistence</div><div className="pn-row__sub"><span className="pn-tag pn-tag--med">medium</span><span className="pn-meta">#st5</span></div></div></div>
          </div>
        </div>

        {/* center terminal */}
        <div className="pn-term">
          <div className="pn-term-bar"><span className="pn-tdot"></span><b>fluffy-starlight</b><span className="pn-tslash">·</span><span>claude · opus-4.8</span><span style={{ marginLeft: 'auto', color: '#6a6457' }}>fix/terminal-reparent</span></div>
          <div className="pn-term-body">
            <div><span className="l-prompt">›</span> Analyzing terminal reparenting in <span className="l-file">AppWorkspace.tsx</span></div>
            <div className="l-dim">&nbsp;&nbsp;Read SessionTerminal.tsx · MultiProjectSessionsView.tsx</div>
            <div style={{ marginTop: 10 }}><span className="l-acc">●</span> Editing <span className="l-file">MultiProjectSessionsView.tsx</span></div>
            <div className="l-ok">&nbsp;&nbsp;+ reparent registry.current.get(session.id)?.term.element</div>
            <div style={{ marginTop: 10, color: '#8a8474' }}>┌─ <span style={{ color: '#d99a4e' }}>⚙️ CI Guard</span> · PostToolUse → run <span style={{ color: '#cbb98a' }}>npm run lint</span></div>
            <div className="l-ok">│&nbsp;&nbsp;✓ 0 problems · fed back to agent</div>
            <div style={{ color: '#8a8474' }}>└─ <span style={{ color: '#d99a4e' }}>🔍 Self-Critic</span> · iteration 1/3</div>
            <div style={{ marginTop: 10 }}><span className="l-prompt">›</span> Reparenting the terminal node, then re-running the fit<span className="pn-tcursor"></span></div>
          </div>
          <div className="pn-term-input"><span className="pn-tslash">›</span> Message fluffy-starlight…</div>
        </div>

        {/* spaces panel (right) with S5 chips */}
        <div className="pn-sp">
          <div className="pn-tabs" style={{ paddingTop: 0 }}>
            <button className="pn-tab pn-tab--active" style={{ paddingTop: 14 }}>Sessions <span className="pn-tab-n">5</span></button>
            <span className="pn-head-spacer" style={{ flex: 1 }}></span>
            <button className="pn-ib" title="Activity — why did it fire?" style={{ alignSelf: 'center' }} onClick={() => setOverlay({ type: 'activity' })}><Icon name="eye" /></button>
            <button className="pn-ib" title="Send once (one-shot)" style={{ alignSelf: 'center' }} onClick={() => setOverlay({ type: 'send' })}><Icon name="send" /></button>
            <button className="pn-ib" title="Active spells (spellbook)" style={{ alignSelf: 'center', color: totalActive ? 'var(--pn-brand)' : undefined }} onClick={() => setOverlay({ type: 'spellbook' })}><Icon name="layers" /></button>
          </div>

          {disconnected && <div className="sp-disc"><Icon name="wifiOff" /> Live connection lost — active-spell state may be stale.</div>}

          <div className="pn-scroll" style={{ position: 'relative' }}>
            <div className="pn-sec-head"><span className="pn-eyebrow">Running <span className="pn-count">· 3</span></span><span className="pn-line"></span></div>
            {SESSIONS.filter(s => s.live).map(s => (
              <SessionRow key={s.id} session={s} actives={actives.filter(a => a.sessionId === s.id)} spellsById={spellsById}
                onOpen={openPopover} onAddCast={() => setOverlay({ type: 'studio', mode: 'detail' })} disconnected={disconnected} />
            ))}
            <div className="pn-sec-head"><span className="pn-eyebrow">Idle <span className="pn-count">· 2</span></span><span className="pn-line"></span></div>
            {SESSIONS.filter(s => !s.live).map(s => (
              <SessionRow key={s.id} session={s} actives={actives.filter(a => a.sessionId === s.id)} spellsById={spellsById}
                onOpen={openPopover} onAddCast={() => setOverlay({ type: 'studio', mode: 'detail' })} disconnected={disconnected} />
            ))}
          </div>
        </div>
      </div>

      {/* ---------- overlays ---------- */}
      {overlay && overlay.type === 'studio' && (
        <SpellStudio spells={spells} activeCountBySpell={activeCountBySpell} initialMode={overlay.mode} initialSpellId={overlay.spellId}
          loadState={loadState} onRetry={() => { setLoadState('loading'); setTimeout(() => setLoadState('ready'), 900); }}
          onClose={() => setOverlay(null)} onSaveSpell={saveSpell} onDeleteSpell={deleteSpell}
          onCast={openCast} confirm={confirm} />
      )}
      {overlay && overlay.type === 'cast' && (
        <CastLauncher spell={spellsById[overlay.spellId]} sessions={SESSIONS} onClose={() => setOverlay(null)} onCast={cast} confirm={confirm} />
      )}
      {overlay && overlay.type === 'spellbook' && (
        <SpellbookDrawer actives={actives} sessions={SESSIONS} spellsById={spellsById} disconnected={disconnected}
          onClose={() => setOverlay(null)} onDeactivate={deactivate} onToggle={toggleActive} onResetLoop={resetLoop}
          onDeactivateAll={() => confirm({ title: 'Deactivate all spells?', body: 'This removes every active spell from every session. You can undo right after.', danger: true, confirmLabel: 'Deactivate all', onConfirm: deactivateAll })} />
      )}
      {overlay && overlay.type === 'activity' && (
        <ActivityDrawer activity={ACTIVITY} sessions={SESSIONS} spellsById={spellsById} onClose={() => setOverlay(null)} />
      )}
      {overlay && overlay.type === 'send' && (
        <SendDrawer sessions={SESSIONS} onClose={() => setOverlay(null)} onSent={(verb, entity, sess) => { setOverlay(null); toast(<>Sent <b>{verb} · {entity.title}</b> to {sess.name}.</>); }} />
      )}
      {overlay && overlay.type === 'ensemble' && (
        <EnsembleDrawer ensemble={ensembles.find(e => e.id === overlay.ensembleId) || ensembles[0]} sessions={SESSIONS} spellsById={spellsById}
          onClose={() => setOverlay(null)} onDisband={() => { setEnsembles(cur => cur.filter(e => e.id !== overlay.ensembleId)); setActives(cur => cur.map(a => a.ensembleId === overlay.ensembleId ? { ...a, ensembleId: null } : a)); setOverlay(null); toast(<>Ensemble disbanded.</>); }} />
      )}

      {/* popover */}
      {popover && (() => {
        const session = SESSIONS.find(s => s.id === popover.sessionId);
        const list = actives.filter(a => a.sessionId === popover.sessionId);
        if (list.length === 0) return null;
        return <ActivePopover session={session} actives={list} spellsById={spellsById} anchor={popover.anchor} disconnected={disconnected}
          onClose={() => setPopover(null)} onDeactivate={(id) => { deactivate(id); if (list.length === 1) setPopover(null); }}
          onToggle={toggleActive} onResetLoop={resetLoop} onAddCast={() => { setPopover(null); setOverlay({ type: 'studio', mode: 'detail' }); }} />;
      })()}

      {confirmCfg && (
        <ConfirmDialog {...confirmCfg} onConfirm={() => { confirmCfg.onConfirm(); if (!confirmCfg._keep) setConfirmCfg(null); }} onCancel={() => setConfirmCfg(null)} />
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

/* ---------- session row with active chips ---------- */
function SessionRow({ session, actives, spellsById, onOpen, onAddCast, disconnected }) {
  const s = session;
  return (
    <div className={'pn-sess' + (s.status === 'wait' ? ' pn-sess--wait' : '')} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <AgentTile kind={s.agent} lg />
      <div className="pn-sess__body">
        <div className="pn-sess__name">{s.name}</div>
        <div className="pn-sess__status">
          <span className="pn-dot-wrap"><span className={'pn-dot pn-dot--' + s.status + (s.live ? ' pn-dot--live' : '')}></span></span>
          <span className={'pn-sess__statustext' + (s.status === 'wait' ? ' pn-sess__statustext--wait' : s.status === 'run' ? ' pn-sess__statustext--run' : '')}>{s.statusText}</span>
        </div>
      </div>
      <div style={{ flexBasis: '100%', height: 0 }}></div>
      <div style={{ paddingLeft: 41, paddingTop: 8, width: '100%' }}>
        <ActiveChips actives={actives} spellsById={spellsById} onOpen={onOpen} onAddCast={onAddCast} disconnected={disconnected} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
