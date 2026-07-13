/* surfaces.jsx — Cast launcher (S4), active-spell chips + popover (S5),
   Spellbook drawer (S6), Task spells (S7), Activity (S8), Ensemble (S9),
   Send / entities (S10), plus toasts and the confirm dialog. */

const { useState: uS, useEffect: uE, useRef: uR } = React;

/* ============================ CONFIRM DIALOG ============================ */
function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="sp-overlay" style={{ zIndex: 95 }} onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="sp-modal" style={{ width: 420, maxWidth: '92vw' }} role="alertdialog">
        <div style={{ padding: '20px 20px 8px' }}>
          <div className="t-h3" style={{ marginBottom: 8, fontFamily: 'var(--pn-serif)', fontWeight: 500, fontSize: 20 }}>{title}</div>
          <div className="t-body" style={{ fontSize: 13 }}>{body}</div>
        </div>
        <div className="sp-ed__foot" style={{ borderTop: '1px solid var(--pn-line)', marginTop: 12 }}>
          <span style={{ flex: 1 }}></span>
          <button className="sp-btn sp-btn--ghost sp-btn--sm" onClick={onCancel}>Cancel</button>
          <button className={'sp-btn sp-btn--sm ' + (danger ? 'sp-btn--danger' : 'sp-btn--primary')} onClick={onConfirm}>{confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ CAST LAUNCHER ============================ */
function CastLauncher({ spell, sessions, onCast, onClose, confirm }) {
  const eligible = sessions.filter(s => s.live);
  const [sel, setSel] = uS(eligible[0] ? [eligible[0].id] : []);
  const [mode, setMode] = uS('single');
  const [ensembleName, setEnsembleName] = uS('');
  const [casting, setCasting] = uS(false);
  const risky = spellIsRisky(spell);

  function toggle(id) {
    setSel(cur => {
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      // auto mode: 1 → single, >1 → broadcast (unless coordinate already chosen)
      setMode(m => next.length <= 1 ? 'single' : (m === 'coordinate' ? 'coordinate' : 'broadcast'));
      return next;
    });
  }

  function doCast() {
    setCasting(true);
    setTimeout(() => { onCast(spell, sel, mode, ensembleName); }, 650);
  }
  function attemptCast() {
    if (sel.length === 0) return;
    if (risky) {
      confirm({
        title: 'Cast “' + spell.name + '”?', danger: true, confirmLabel: 'Cast anyway',
        body: 'This spell has rules that run commands or loop the agent. It will act on ' + sel.length + ' session' + (sel.length > 1 ? 's' : '') + ' automatically until deactivated.',
        onConfirm: doCast,
      });
    } else doCast();
  }

  return (
    <div className="sp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-modal sp-cast" role="dialog" aria-label="Cast spell">
        <div className="sp-mhd">
          <span className="sp-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="wand" size={14} style={{ color: 'var(--pn-brand)' }} /> Activate automation</span>
          <span style={{ flex: 1 }}></span>
          <button className="sp-mhd__x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="sp-cast__body sp-scroll">
          <div className="sp-cast__spell">
            <span className="sp-ident" style={{ background: sc(spell.color, 0.14), borderColor: sc(spell.color, 0.4) }}>{spell.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-title" style={{ fontSize: 14 }}>{spell.name}</div>
              <div className="sp-card__sum" style={{ marginTop: 3 }}>{spellSummary(spell)}</div>
            </div>
            {risky && <span className="sp-badge sp-badge--risk">Side-effects</span>}
          </div>

          {eligible.length === 0 ? (
            <div className="sp-empty" style={{ padding: '30px 20px' }}>
              <span className="sp-empty__ic"><Icon name="terminal" size={22} /></span>
              <div className="sp-empty__h">No eligible sessions</div>
              <div className="sp-empty__p">There are no running sessions to cast onto. Spawn a session first.</div>
            </div>
          ) : (
            <>
              <div className="sp-fld">
                <label className="sp-flabel">Target sessions <span className="req">*</span> <span className="opt">{sel.length} selected</span></label>
                <div className="sp-targets">
                  {sessions.map(s => (
                    <button key={s.id} disabled={!s.live} className={'sp-target' + (sel.includes(s.id) ? ' sp-target--sel' : '') + (!s.live ? ' sp-target--disabled' : '')} onClick={() => s.live && toggle(s.id)}>
                      <span className={'sp-tcheck' + (sel.includes(s.id) ? ' sp-tcheck--on' : '')}>{sel.includes(s.id) && <Icon name="check" size={12} />}</span>
                      <AgentTile kind={s.agent} />
                      <span className="sp-target__body">
                        <span className="sp-target__name">{s.name}</span>
                        <span className="sp-target__meta"><span className="pn-dot-wrap"><span className={'pn-dot pn-dot--' + s.status + (s.live ? ' pn-dot--live' : '')}></span></span><span className="sp-fhint">{s.live ? s.statusText : 'Not running'}</span></span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="sp-fld">
                <label className="sp-flabel">Cast mode</label>
                <div className="sp-modes">
                  <button className={'sp-mode' + (mode === 'single' ? ' sp-mode--active' : '')} disabled={sel.length !== 1} onClick={() => setMode('single')}>
                    <div className="sp-mode__t">Single</div><div className="sp-mode__d">One session</div>
                  </button>
                  <button className={'sp-mode' + (mode === 'broadcast' ? ' sp-mode--active' : '')} disabled={sel.length < 1} onClick={() => setMode('broadcast')}>
                    <div className="sp-mode__t">Broadcast</div><div className="sp-mode__d">Each session, independently</div>
                  </button>
                  <button className={'sp-mode' + (mode === 'coordinate' ? ' sp-mode--active' : '')} disabled={sel.length < 2} onClick={() => setMode('coordinate')}>
                    <div className="sp-mode__t">Coordinate</div><div className="sp-mode__d">Form an ensemble (≥2)</div>
                  </button>
                </div>
              </div>

              {mode === 'coordinate' && (
                <Field label="Ensemble name" opt hint="A shared handle for the coordinated group.">
                  <input className="sp-input" placeholder="e.g. Reparent strike team" value={ensembleName} onChange={e => setEnsembleName(e.target.value)} />
                </Field>
              )}
            </>
          )}
        </div>
        <div className="sp-ed__foot">
          <div className="sp-ed__footL">
            {risky && eligible.length > 0 && <span className="sp-savehint" style={{ color: 'var(--pn-block)' }}><Icon name="alert" size={13} /> Will run automatically until deactivated.</span>}
          </div>
          <button className="sp-btn sp-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="sp-btn sp-btn--primary" disabled={sel.length === 0 || casting} onClick={attemptCast}>
            {casting ? <><span className="sp-skel" style={{ width: 13, height: 13, borderRadius: '50%' }}></span> Casting…</> : <><Icon name="wand" /> Cast {mode === 'broadcast' ? 'to ' + sel.length : mode === 'coordinate' ? 'ensemble' : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ ACTIVE CHIPS (S5) ============================ */
function ActiveChips({ actives, spellsById, onOpen, onAddCast, disconnected, max = 3 }) {
  if (actives.length === 0) {
    return <button className="sp-chip sp-chip--add" onClick={onAddCast}><Icon name="plus" size={11} /> Cast</button>;
  }
  const shown = actives.slice(0, max);
  const overflow = actives.length - shown.length;
  return (
    <div className="sp-chips">
      {shown.map(a => {
        const s = spellsById[a.spellId];
        const loop = loopProgress(a, s);
        return (
          <button key={a.id} className={'sp-chip' + (!a.enabled ? ' sp-chip--disabled' : '')} onClick={e => onOpen(e, a.sessionId)} title={s ? s.name : ''}>
            <span className="sp-chip__dot" style={{ background: SPELL_COLORS[a.color], opacity: disconnected ? 0.4 : 1 }}></span>
            {s ? s.icon : '✨'} {s ? s.name : 'Spell'}
            {loop && <span className="sp-chip__loop">{loop}</span>}
            {!a.enabled && <Icon name="power" size={10} />}
          </button>
        );
      })}
      {overflow > 0 && <button className="sp-chip sp-chip--more" onClick={e => onOpen(e, actives[0].sessionId)}>+{overflow}</button>}
      <button className="sp-chip sp-chip--add" onClick={onAddCast} title="Cast another"><Icon name="plus" size={11} /></button>
    </div>
  );
}
function loopProgress(active, spell) {
  if (!spell) return null;
  const loopRule = spell.rules.find(r => r.action.type === 'continue-loop');
  if (!loopRule) return null;
  const it = active.ruleIterations[loopRule.id] || 0;
  return it + '/' + (loopRule.action.maxIterations || 1);
}

/* ============================ ACTIVE POPOVER (S5) ============================ */
function ActivePopover({ session, actives, spellsById, anchor, onClose, onDeactivate, onToggle, onResetLoop, onAddCast, disconnected }) {
  const ref = uR(null);
  uE(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const style = anchor ? { top: Math.min(anchor.top, window.innerHeight - 380), left: Math.max(12, anchor.left - 300) } : {};
  return (
    <div className="sp-pop" ref={ref} style={style} role="dialog">
      <div className="sp-pop__hd">
        <AgentTile kind={session.agent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-title" style={{ fontSize: 13 }}>{session.name}</div>
          <div className="sp-eyebrow" style={{ fontSize: 9.5, marginTop: 2 }}>{actives.length} active {actives.length === 1 ? 'spell' : 'spells'}</div>
        </div>
        <button className="sp-btn sp-btn--sm" onClick={onAddCast}><Icon name="plus" size={12} /> Cast</button>
      </div>
      {disconnected && <div className="sp-disc"><Icon name="wifiOff" /> Live connection lost — state may be stale.</div>}
      <div className="sp-pop__body">
        {actives.map(a => {
          const s = spellsById[a.spellId];
          const loopRule = s && s.rules.find(r => r.action.type === 'continue-loop');
          const it = loopRule ? (a.ruleIterations[loopRule.id] || 0) : 0;
          const max = loopRule ? (loopRule.action.maxIterations || 1) : 0;
          return (
            <div className="sp-arow" key={a.id}>
              <div className="sp-arow__top">
                <span className="sp-chip__dot" style={{ background: SPELL_COLORS[a.color], width: 10, height: 10 }}></span>
                <span className="sp-arow__name">{s ? s.icon + ' ' + s.name : 'Spell'}</span>
                {!a.enabled && <span className="sp-badge">Paused</span>}
                <button className="sp-ibs" title={a.enabled ? 'Pause' : 'Resume'} onClick={() => onToggle(a.id)}><span className={'sp-switch' + (a.enabled ? ' sp-switch--on' : '')}></span></button>
              </div>
              {loopRule && (
                <div className="sp-arow__loop">
                  <span className="sp-eyebrow" style={{ fontSize: 9 }}>Loop</span>
                  <span className="sp-loopbar"><i style={{ width: (max ? (it / max * 100) : 0) + '%', background: SPELL_COLORS[a.color] }}></i></span>
                  <span className="sp-meta">{it}/{max}</span>
                  <button className="sp-ibs" title="Reset loop counter" onClick={() => onResetLoop(a.id, loopRule.id)}><Icon name="refresh" size={13} /></button>
                </div>
              )}
              <div className="sp-arow__acts">
                <button className="sp-btn sp-btn--ghost sp-btn--sm" style={{ height: 24 }} onClick={() => onDeactivate(a.id)}><Icon name="x" size={12} /> Deactivate</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ SPELLBOOK DRAWER (S6) ============================ */
function SpellbookDrawer({ actives, sessions, spellsById, onClose, onDeactivate, onToggle, onResetLoop, onDeactivateAll, disconnected }) {
  const bySession = sessions.map(s => ({ session: s, list: actives.filter(a => a.sessionId === s.id) })).filter(x => x.list.length > 0);
  const total = actives.length;
  return (
    <div className="sp-drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-drawer" role="dialog" aria-label="Spellbook — active spells">
        <div className="sp-drawer__hd">
          <span className="sp-wand" style={{ color: 'var(--pn-brand)', display: 'grid', placeItems: 'center' }}><Icon name="layers" size={18} /></span>
          <div style={{ flex: 1 }}>
            <div className="t-title" style={{ fontSize: 15 }}>Active spells</div>
            <div className="sp-eyebrow" style={{ fontSize: 9.5, marginTop: 2 }}>{total} active across {bySession.length} {bySession.length === 1 ? 'session' : 'sessions'}</div>
          </div>
          <button className="sp-mhd__x" onClick={onClose}><Icon name="x" /></button>
        </div>
        {disconnected && <div className="sp-disc"><Icon name="wifiOff" /> Live connection lost — showing last known state.</div>}
        <div className="sp-drawer__body sp-scroll">
          {total === 0 ? (
            <div className="sp-empty" style={{ marginTop: 40 }}>
              <span className="sp-empty__ic"><Icon name="layers" size={22} /></span>
              <div className="sp-empty__h">Nothing running</div>
              <div className="sp-empty__p">No spells are active on any session. Cast one from the spellbook.</div>
            </div>
          ) : bySession.map(({ session, list }) => (
            <div className="sp-group" key={session.id}>
              <div className="sp-group__hd">
                <AgentTile kind={session.agent} />
                <span className="sp-sess-name">{session.name}</span>
                <span style={{ flex: 1 }}></span>
                <span className="sp-meta">{list.length} active</span>
              </div>
              {list.map(a => {
                const s = spellsById[a.spellId];
                const loopRule = s && s.rules.find(r => r.action.type === 'continue-loop');
                const it = loopRule ? (a.ruleIterations[loopRule.id] || 0) : 0;
                const max = loopRule ? (loopRule.action.maxIterations || 1) : 0;
                return (
                  <div className="sp-arow" key={a.id} style={{ paddingLeft: 18, paddingRight: 18 }}>
                    <div className="sp-arow__top">
                      <span className="sp-chip__dot" style={{ background: SPELL_COLORS[a.color], width: 10, height: 10 }}></span>
                      <span className="sp-arow__name">{s ? s.icon + ' ' + s.name : 'Spell'}</span>
                      {a.ensembleId && <span className="sp-badge">Ensemble</span>}
                      {!a.enabled && <span className="sp-badge">Paused</span>}
                      <button className="sp-ibs" onClick={() => onToggle(a.id)}><span className={'sp-switch' + (a.enabled ? ' sp-switch--on' : '')}></span></button>
                    </div>
                    {loopRule && (
                      <div className="sp-arow__loop" style={{ paddingLeft: 26 }}>
                        <span className="sp-eyebrow" style={{ fontSize: 9 }}>Loop</span>
                        <span className="sp-loopbar"><i style={{ width: (max ? it / max * 100 : 0) + '%', background: SPELL_COLORS[a.color] }}></i></span>
                        <span className="sp-meta">{it}/{max}</span>
                        <button className="sp-ibs" onClick={() => onResetLoop(a.id, loopRule.id)} title="Reset loop"><Icon name="refresh" size={13} /></button>
                      </div>
                    )}
                    <div className="sp-arow__acts" style={{ paddingLeft: 26 }}>
                      <button className="sp-btn sp-btn--ghost sp-btn--sm" style={{ height: 24 }} onClick={() => onDeactivate(a.id)}><Icon name="x" size={12} /> Deactivate</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {total > 0 && (
          <div className="sp-ed__foot">
            <span style={{ flex: 1 }}></span>
            <button className="sp-btn sp-btn--danger sp-btn--sm" onClick={onDeactivateAll}><Icon name="power" /> Deactivate all</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ ACTIVITY DRAWER (S8) ============================ */
function ActivityDrawer({ activity, sessions, spellsById, onClose }) {
  const sById = Object.fromEntries(sessions.map(s => [s.id, s]));
  return (
    <div className="sp-drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-drawer" role="dialog" aria-label="Automation activity">
        <div className="sp-drawer__hd">
          <span style={{ color: 'var(--pn-brand)', display: 'grid', placeItems: 'center' }}><Icon name="eye" size={18} /></span>
          <div style={{ flex: 1 }}>
            <div className="t-title" style={{ fontSize: 15 }}>Automation activity</div>
            <div className="sp-eyebrow" style={{ fontSize: 9.5, marginTop: 2 }}>Why did it fire?</div>
          </div>
          <span className="sp-chip"><span className="sp-chip__dot" style={{ background: 'var(--pn-run)' }}></span> Live</span>
          <button className="sp-mhd__x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="sp-drawer__body sp-scroll">
          {activity.length === 0 ? (
            <div className="sp-empty" style={{ marginTop: 40 }}><span className="sp-empty__ic"><Icon name="eye" size={22} /></span><div className="sp-empty__h">Quiet for now</div><div className="sp-empty__p">Nothing has fired recently. Rule-fired events show up here in real time.</div></div>
          ) : activity.map(ev => {
            const s = spellsById[ev.spellId]; const sess = sById[ev.sessionId];
            return (
              <div className="sp-act" key={ev.id}>
                <div className="sp-act__rail"><span className="sp-act__dot" style={{ background: ev.outcome === 'error' ? 'var(--pn-block)' : (s ? SPELL_COLORS[s.color] : 'var(--pn-run)') }}></span></div>
                <div className="sp-act__body">
                  <div className="sp-act__top">
                    <span className="sp-act__name">{s ? s.icon + ' ' + s.name : 'Spell'}</span>
                    <span className={'sp-outcome sp-outcome--' + ev.outcome}>{ev.outcome === 'ok' ? 'ran' : 'error'}</span>
                    <span className="sp-act__time">{ev.at}</span>
                  </div>
                  <div className="sp-act__sum">{ev.ruleLabel} · {ev.event} → {ACTIONS[ev.action] ? ACTIONS[ev.action].label.toLowerCase() : ev.action} · on {sess ? sess.name : ev.sessionId}</div>
                  <div className={'sp-act__detail' + (ev.outcome === 'error' ? ' sp-act__detail--err' : '')}>{ev.outcome === 'error' ? '✗ ' : '✓ '}{ev.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================ SEND / ENTITIES (S10) ============================ */
function SendDrawer({ sessions, onClose, onSent }) {
  const [type, setType] = uS('task');
  const [entity, setEntity] = uS(null);
  const [verb, setVerb] = uS(null);
  const et = ENTITY_TYPES.find(t => t.id === type);
  const eligible = sessions.filter(s => s.live);
  return (
    <div className="sp-drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-drawer" role="dialog" aria-label="Send to session">
        <div className="sp-drawer__hd">
          <span style={{ color: 'var(--pn-ink-2)', display: 'grid', placeItems: 'center' }}><Icon name="send" size={17} /></span>
          <div style={{ flex: 1 }}>
            <div className="t-title" style={{ fontSize: 15 }}>Send once</div>
            <div className="sp-eyebrow" style={{ fontSize: 9.5, marginTop: 2 }}>One-shot prompt · not an automation</div>
          </div>
          <button className="sp-mhd__x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--pn-line)' }}>
          <div className="sp-fhint">Take an entity, run it through a template, and drop the prompt into a session — once. No hooks, no ring.</div>
        </div>
        <div className="sp-etypes">
          {ENTITY_TYPES.map(t => (
            <button key={t.id} className={'sp-etype' + (type === t.id ? ' sp-etype--active' : '')} onClick={() => { setType(t.id); setEntity(null); setVerb(null); }}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
        <div className="sp-drawer__body sp-scroll">
          {(ENTITIES[type] || []).map(e => (
            <div className="sp-entity" key={e.id}>
              <div className="sp-entity__body">
                <div className="sp-entity__title">{e.title}</div>
                <div className="sp-entity__meta">{e.meta}</div>
              </div>
              <div className="sp-verbs">
                {et.verbs.map(v => (
                  <button key={v} className="sp-verb" onClick={() => { setEntity(e); setVerb(v); }}>{v}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {entity && (
          <div className="sp-ed__foot" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="sp-savehint" style={{ flex: '1 1 100%', color: 'var(--pn-ink-2)' }}>{verb} <b>{entity.title}</b> → send to:</span>
            {eligible.map(s => <button key={s.id} className="sp-btn sp-btn--sm" onClick={() => onSent(verb, entity, s)}><AgentTile kind={s.agent} sm /> {s.name}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ ENSEMBLE DRAWER (S9) ============================ */
function EnsembleDrawer({ ensemble, sessions, spellsById, onClose, onDisband }) {
  const members = sessions.filter(s => ensemble.memberIds.includes(s.id));
  const spell = spellsById[ensemble.spellId];
  return (
    <div className="sp-drawer-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sp-drawer" role="dialog" aria-label="Ensemble">
        <div className="sp-drawer__hd">
          <span style={{ color: 'var(--pn-brand)', display: 'grid', placeItems: 'center' }}><Icon name="team" size={18} /></span>
          <div style={{ flex: 1 }}>
            <div className="t-title" style={{ fontSize: 15 }}>{ensemble.name || 'Ensemble'}</div>
            <div className="sp-eyebrow" style={{ fontSize: 9.5, marginTop: 2 }}>{members.length} sessions · coordinated by {spell ? spell.name : 'a spell'}</div>
          </div>
          <button className="sp-mhd__x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="sp-drawer__body sp-scroll">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--pn-line)' }}>
            <div className="sp-flabel" style={{ marginBottom: 6 }}>Objective</div>
            <div className="t-body" style={{ fontSize: 13 }}>{ensemble.objective || 'Coordinate work across the group toward the shared goal.'}</div>
          </div>
          <div className="sp-sec"><span className="sp-eyebrow">Members</span><span className="sp-sec__line"></span></div>
          {members.map((s, i) => (
            <div className="sp-entity" key={s.id}>
              <AgentTile kind={s.agent} />
              <div className="sp-entity__body">
                <div className="sp-entity__title">{s.name} {i === 0 && <span className="sp-badge sp-badge--seed" style={{ marginLeft: 4 }}>Leader</span>}</div>
                <div className="sp-entity__meta">{s.agent} · {s.statusText}</div>
              </div>
              <button className="sp-ibs sp-ibs--danger" title="Remove"><Icon name="x" /></button>
            </div>
          ))}
        </div>
        <div className="sp-ed__foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="sp-input" placeholder="Message all members…" />
            <button className="sp-btn sp-btn--primary"><Icon name="send" /> Send</button>
          </div>
          <div style={{ display: 'flex' }}>
            <button className="sp-btn sp-btn--sm"><Icon name="plus" /> Add member</button>
            <span style={{ flex: 1 }}></span>
            <button className="sp-btn sp-btn--danger sp-btn--sm" onClick={onDisband}><Icon name="power" /> Disband</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ TOASTS ============================ */
function Toasts({ toasts, onDismiss }) {
  return (
    <div className="sp-toasts">
      {toasts.map(t => (
        <div className="sp-toast" key={t.id}>
          <span className="sp-toast__msg">{t.msg}</span>
          {t.undo && <button className="sp-toast__undo" onClick={() => { t.undo(); onDismiss(t.id); }}>Undo</button>}
          <button className="sp-toast__x" onClick={() => onDismiss(t.id)}><Icon name="x" size={13} /></button>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { ConfirmDialog, CastLauncher, ActiveChips, ActivePopover, SpellbookDrawer, ActivityDrawer, SendDrawer, EnsembleDrawer, Toasts });
