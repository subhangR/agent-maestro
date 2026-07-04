/* editor.jsx — the Spell editor (S3): header fields + rule builder.
   Two comparable directions ("Guided" stepped vs "Inline" dense) share one
   RuleBuilder. Event→action filtering, 5 config panels, matcher, run-command
   ack, live summary, validation. Exports SpellEditor, spell helpers. */

const { useState, useMemo, useRef, useEffect } = React;

/* ---- model helpers ---- */
function defaultAction(type) {
  switch (type) {
    case 'inject-prompt': return { type, prompt: '' };
    case 'feed-context':  return { type, prompt: '' };
    case 'run-command':   return { type, command: '', args: [], cwd: '', feedOutput: false, _ack: false };
    case 'continue-loop': return { type, loopType: 'single-shot', maxIterations: 1 };
    case 'notify-channel':return { type, channel: '', message: '' };
    default: return { type: 'inject-prompt', prompt: '' };
  }
}
function emptyRule() {
  return { id: rid(), enabled: true, label: '', trigger: { type: 'hook', hookEvent: 'PostToolUse', matcher: '' }, action: defaultAction('inject-prompt') };
}
function cloneSpell(s) { return JSON.parse(JSON.stringify(s)); }

function validateSpell(spell) {
  const spellErrs = [];
  if (!spell.name || spell.name.trim().length === 0) spellErrs.push('Name is required.');
  if (spell.name && spell.name.length > 60) spellErrs.push('Name must be 60 characters or fewer.');
  if (spell.description && spell.description.length > 1000) spellErrs.push('Description must be 1000 characters or fewer.');
  if (spell.rules.length < 1) spellErrs.push('A spell needs at least one rule.');
  if (spell.rules.length > 20) spellErrs.push('A spell can have at most 20 rules.');
  const ruleErrs = {};
  for (const r of spell.rules) {
    const e = [];
    const a = r.action;
    if (r.trigger.type === 'schedule') e.push('Scheduled triggers are not available yet.');
    if (!CAPABILITY[r.trigger.hookEvent].includes(a.type)) e.push('This action is not allowed on this event.');
    if ((a.type === 'inject-prompt' || a.type === 'feed-context') && (!a.prompt || !a.prompt.trim())) e.push('Message text is required.');
    if (a.type === 'run-command') {
      if (!a.command || !a.command.trim()) e.push('A command is required.');
      if (!a._ack) e.push('You must acknowledge that this runs shell commands.');
    }
    if (a.type === 'continue-loop' && (!a.maxIterations || a.maxIterations < 1)) e.push('Max iterations must be at least 1.');
    if (e.length) ruleErrs[r.id] = e;
  }
  return { spellErrs, ruleErrs, ok: spellErrs.length === 0 && Object.keys(ruleErrs).length === 0 };
}

function actionKindOf(a) { return (a.type === 'inject-prompt' || a.type === 'feed-context') ? 'message' : a.type; }

/* ---- small field wrapper ---- */
function Field({ label, req, opt, hint, children, err }) {
  return (
    <div className="sp-fld">
      {label && <label className="sp-flabel">{label}{req && <span className="req">*</span>}{opt && <span className="opt">optional</span>}</label>}
      {hint && <div className="sp-fhint">{hint}</div>}
      {children}
      {err && <div className="sp-err"><Icon name="alert" />{err}</div>}
    </div>
  );
}

/* =====================================================================
   RULE BUILDER — trigger → matcher → action → config
   ===================================================================== */
function RuleBuilder({ rule, onChange, dir, showErrors, errs }) {
  const ev = rule.trigger.hookEvent;
  const evMeta = HOOK_EVENTS.find(e => e.id === ev);
  const allowed = CAPABILITY[ev];
  const isToolEvent = ev === 'PreToolUse' || ev === 'PostToolUse';
  const [advOpen, setAdvOpen] = useState(!!rule.trigger.matcher && !isToolEvent);
  const kind = actionKindOf(rule.action);

  function setTrigger(patch) { onChange({ ...rule, trigger: { ...rule.trigger, ...patch } }); }
  function setAction(a) { onChange({ ...rule, action: a }); }

  function pickEvent(newEv) {
    let action = rule.action;
    if (!CAPABILITY[newEv].includes(action.type)) {
      // gracefully correct to first allowed action (FR-3.7)
      const firstAllowed = CAPABILITY[newEv].find(t => t !== 'inject-prompt' && t !== 'feed-context') || 'inject-prompt';
      const pref = CAPABILITY[newEv].includes('inject-prompt') ? 'inject-prompt' : firstAllowed;
      action = defaultAction(pref);
    }
    const matcher = (newEv === 'PreToolUse' || newEv === 'PostToolUse') ? rule.trigger.matcher : rule.trigger.matcher;
    onChange({ ...rule, trigger: { ...rule.trigger, hookEvent: newEv, matcher }, action });
  }

  function pickKind(k) {
    if (k === 'message') { if (kind !== 'message') setAction(defaultAction('inject-prompt')); return; }
    if (rule.action.type !== k) setAction(defaultAction(k));
  }

  // matcher tool toggles
  const selectedTools = rule.trigger.matcher ? rule.trigger.matcher.split('|').filter(Boolean) : [];
  function toggleTool(t) {
    let next = selectedTools.includes(t) ? selectedTools.filter(x => x !== t) : [...selectedTools, t];
    setTrigger({ matcher: next.join('|') });
  }

  const stepped = dir === 'guided';
  const err = (key) => showErrors && errs && errs.find(m => m.toLowerCase().includes(key));

  const triggerBlock = (
    <div className={stepped ? 'sp-step' : ''}>
      {stepped && <div className="sp-step__hd"><span className="sp-step__n">1</span><span className="sp-step__t">When it fires</span></div>}
      {!stepped && <label className="sp-flabel" style={{ marginBottom: 8, display: 'block' }}>Trigger</label>}
      <div className="sp-seg" role="tablist" style={{ marginBottom: 12 }}>
        <button className={'sp-seg-i' + (rule.trigger.type === 'hook' ? ' sp-seg-i--active' : '')} onClick={() => setTrigger({ type: 'hook' })}><Icon name="bolt" size={13} /> Hook event</button>
        <button className="sp-seg-i" disabled title="Coming soon"><Icon name="calendar" size={13} /> Schedule <span className="sp-soon">SOON</span></button>
      </div>
      <div className="sp-events">
        {HOOK_EVENTS.map(e => (
          <button key={e.id} className={'sp-event' + (ev === e.id ? ' sp-event--active' : '')} onClick={() => pickEvent(e.id)}>
            <div className="sp-event__name">{e.label}</div>
            <div className="sp-event__desc">{e.fires}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const matcherBlock = (
    <div className={stepped ? 'sp-step' : ''} style={!stepped ? { marginTop: 14 } : undefined}>
      {stepped && <div className="sp-step__hd"><span className="sp-step__n">2</span><span className="sp-step__t">What it matches</span></div>}
      {!stepped && <label className="sp-flabel" style={{ marginBottom: 8, display: 'block' }}>Matcher</label>}
      {isToolEvent ? (
        <>
          <div className="sp-fhint" style={{ marginBottom: 8 }}>Pick which tools this applies to. {selectedTools.length === 0 ? <b>Fires on every tool use.</b> : null}</div>
          <div className="sp-tools">
            {TOOLS.map(t => (
              <button key={t} className={'sp-tool' + (selectedTools.includes(t) ? ' sp-tool--active' : '')} onClick={() => toggleTool(t)}>{t}</button>
            ))}
          </div>
        </>
      ) : (
        <div className="sp-matchnote">{rule.trigger.matcher ? <>Fires when {evMeta.matches} matches <code className="sp-rsum__code">/{rule.trigger.matcher}/</code></> : <>No matcher — fires on <b>every</b> {evMeta.label.toLowerCase()}.</>}</div>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="sp-adv" onClick={() => setAdvOpen(o => !o)}><Icon name={advOpen ? 'chevronD' : 'chevronR'} /> Advanced matcher (raw regex)</button>
        {advOpen && (
          <div style={{ marginTop: 8 }}>
            <input className="sp-input sp-mono" placeholder={isToolEvent ? 'e.g. Edit|Write' : 'regex tested against ' + (evMeta.matches || 'the payload')} value={rule.trigger.matcher} onChange={e => setTrigger({ matcher: e.target.value })} />
            <div className="sp-fhint" style={{ marginTop: 5 }}>Matched against {evMeta.matches || 'the raw payload'}. Serializes to the single backend matcher. Max 4096 chars.</div>
          </div>
        )}
      </div>
    </div>
  );

  const actionBlock = (
    <div className={stepped ? 'sp-step' : ''} style={!stepped ? { marginTop: 14 } : undefined}>
      {stepped && <div className="sp-step__hd"><span className="sp-step__n">3</span><span className="sp-step__t">What it does</span></div>}
      {!stepped && <label className="sp-flabel" style={{ marginBottom: 8, display: 'block' }}>Action</label>}
      <div className="sp-actions">
        {allowed.includes('inject-prompt') && (
          <button className={'sp-action' + (kind === 'message' ? ' sp-action--active' : '')} onClick={() => pickKind('message')}>
            <span className="sp-action__ic"><Icon name="quote" /></span>
            <span className="sp-action__body"><span className="sp-action__name">Message the agent</span><span className="sp-action__blurb">Say a prompt, or feed context it reads</span></span>
          </button>
        )}
        {['run-command','continue-loop','notify-channel'].filter(t => allowed.includes(t)).map(t => (
          <button key={t} className={'sp-action' + (kind === t ? ' sp-action--active' : '')} onClick={() => pickKind(t)}>
            <span className="sp-action__ic"><Icon name={ACTIONS[t].icon} /></span>
            <span className="sp-action__body"><span className="sp-action__name">{ACTIONS[t].label}</span><span className="sp-action__blurb">{ACTIONS[t].blurb}</span></span>
            {ACTIONS[t].risky && <span className="sp-action__risk">side-effects</span>}
          </button>
        ))}
      </div>
      {!allowed.includes('continue-loop') && (ev === 'Stop' || ev === 'SubagentStop' ? null : (
        <div className="sp-fhint" style={{ marginTop: 8 }}>Looping is only available on <b>Agent stops</b> and <b>Subagent stops</b>.</div>
      ))}
    </div>
  );

  const configBlock = (
    <div className={stepped ? 'sp-step' : ''} style={!stepped ? { marginTop: 14 } : undefined}>
      {stepped && <div className="sp-step__hd"><span className="sp-step__n">4</span><span className="sp-step__t">Configure</span></div>}
      <ActionConfig rule={rule} setAction={setAction} showErrors={showErrors} errs={errs} />
    </div>
  );

  return (
    <div className={stepped ? '' : 'sp-inline-grid'} style={!stepped ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 22px', alignItems: 'start' } : undefined}>
      {stepped ? (<>{triggerBlock}{matcherBlock}{actionBlock}{configBlock}</>) : (
        <>
          <div>{triggerBlock}{matcherBlock}</div>
          <div>{actionBlock}{configBlock}</div>
        </>
      )}
      <div style={!stepped ? { gridColumn: '1 / -1' } : undefined}>
        <LiveSummary rule={rule} />
        <div style={{ marginTop: 12 }}>
          <Field label="Rule label" opt hint="A human handle used in summaries and active-spell surfaces.">
            <input className="sp-input" placeholder="e.g. Lint edits" value={rule.label} onChange={e => onChange({ ...rule, label: e.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* ---- per-action config panels ---- */
function ActionConfig({ rule, setAction, showErrors, errs }) {
  const a = rule.action;
  const findErr = (k) => showErrors && errs && errs.find(m => m.toLowerCase().includes(k));

  if (a.type === 'inject-prompt' || a.type === 'feed-context') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Deliver as" hint="Same text — different delivery.">
          <div className="sp-radio">
            <button className={'sp-radio-i' + (a.type === 'inject-prompt' ? ' sp-radio-i--active' : '')} onClick={() => setAction({ ...a, type: 'inject-prompt' })}>
              <div className="sp-radio-i__t">Prompt</div><div className="sp-radio-i__d">Say it, as if typed</div>
            </button>
            <button className={'sp-radio-i' + (a.type === 'feed-context' ? ' sp-radio-i--active' : '')} onClick={() => setAction({ ...a, type: 'feed-context' })}>
              <div className="sp-radio-i__t">Context</div><div className="sp-radio-i__d">Give it as background</div>
            </button>
          </div>
        </Field>
        <Field label="Message" req err={findErr('message text') && 'Message text is required.'}>
          <textarea className={'sp-textarea' + (findErr('message text') ? ' sp-textarea--err' : '')} placeholder="What should the agent hear?" value={a.prompt} onChange={e => setAction({ ...a, prompt: e.target.value })} />
        </Field>
      </div>
    );
  }
  if (a.type === 'run-command') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
          <Field label="Command" req err={findErr('command is') && 'A command is required.'}>
            <input className={'sp-input sp-mono' + (findErr('command is') ? ' sp-input--err' : '')} placeholder="npm" value={a.command} onChange={e => setAction({ ...a, command: e.target.value })} />
          </Field>
          <Field label="Arguments" opt hint="Space-separated; literal (no shell expansion).">
            <input className="sp-input sp-mono" placeholder="run lint" value={(a.args || []).join(' ')} onChange={e => setAction({ ...a, args: e.target.value.split(' ').filter(Boolean) })} />
          </Field>
        </div>
        <Field label="Working directory" opt hint="Defaults to the session working directory.">
          <input className="sp-input sp-mono" placeholder="./" value={a.cwd} onChange={e => setAction({ ...a, cwd: e.target.value })} />
        </Field>
        <label className="sp-target" style={{ cursor: 'pointer' }} onClick={() => setAction({ ...a, feedOutput: !a.feedOutput })}>
          <span className={'sp-switch' + (a.feedOutput ? ' sp-switch--on' : '')}></span>
          <span className="sp-target__body">
            <span className="sp-target__name">Feed output back to the agent</span>
            <span className="sp-target__meta"><span className="sp-fhint">Runs async; stdout is delivered when it finishes. Off by default.</span></span>
          </span>
        </label>
        <div className={'sp-warn'}>
          <span className="sp-warn__ic"><Icon name="alert" size={17} /></span>
          <div className="sp-warn__body">
            <div className="sp-warn__t">This rule runs shell commands on your machine</div>
            <div className="sp-warn__p">Commands run with your permissions. Only cast spells you trust.</div>
            <button className="sp-warn__ack" onClick={() => setAction({ ...a, _ack: !a._ack })}>
              <span className={'sp-check' + (a._ack ? ' sp-check--on sp-check--ok' : '')}>{a._ack && <Icon name="check" size={12} />}</span>
              I understand and accept
            </button>
            {showErrors && findErr('acknowledge') && <div className="sp-err" style={{ marginTop: 6 }}><Icon name="alert" />You must acknowledge this before saving.</div>}
          </div>
        </div>
      </div>
    );
  }
  if (a.type === 'continue-loop') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Loop style" hint="Shapes the nudge given to the agent each iteration.">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {LOOP_TYPES.map(l => (
              <button key={l.id} className={'sp-event' + (a.loopType === l.id ? ' sp-event--active' : '')} onClick={() => setAction({ ...a, loopType: l.id })}>
                <div className="sp-event__name">{l.label}</div>
                <div className="sp-event__desc">{l.blurb}</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Max iterations" req hint="Keeps the agent going past a stop, up to this cap." err={findErr('max iterations') && 'Must be at least 1.'}>
          <input type="number" min="1" className={'sp-input sp-mono' + (findErr('max iterations') ? ' sp-input--err' : '')} style={{ width: 120 }} value={a.maxIterations} onChange={e => setAction({ ...a, maxIterations: parseInt(e.target.value || '0', 10) })} />
        </Field>
      </div>
    );
  }
  if (a.type === 'notify-channel') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Channel" opt hint="Routing hint — the relay decides delivery.">
          <input className="sp-input sp-mono" placeholder="telegram" value={a.channel} onChange={e => setAction({ ...a, channel: e.target.value })} />
        </Field>
        <Field label="Message override" opt hint='Defaults to "[spell] fired on <event>".'>
          <input className="sp-input" placeholder="Custom notification text" value={a.message} onChange={e => setAction({ ...a, message: e.target.value })} />
        </Field>
      </div>
    );
  }
  return null;
}

function LiveSummary({ rule }) {
  return (
    <div className="sp-live">
      <span className="sp-live__k">Reads as</span>
      <span className="sp-live__v"><RuleSummary rule={rule} /></span>
    </div>
  );
}

/* =====================================================================
   RULE CARD (collapsible)
   ===================================================================== */
function RuleCard({ rule, index, open, onToggle, onChange, onDup, onRemove, onMove, canMoveUp, canMoveDown, dir, showErrors, errs }) {
  const invalid = showErrors && errs && errs.length > 0;
  return (
    <div className={'sp-rule' + (open ? ' sp-rule--open' : '') + (!rule.enabled ? ' sp-rule--disabled' : '') + (invalid ? ' sp-rule--err' : '')}>
      <div className="sp-rule__bar">
        <span className="sp-rule__grip" title="Drag to reorder"><Icon name="dotsGrip" /></span>
        <span className="sp-rule__num">{index + 1}</span>
        <button className="sp-rule__sum" style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }} onClick={onToggle}>
          {rule.label ? <div className="sp-drule__label" style={{ marginBottom: 3 }}>{rule.label}</div> : null}
          <RuleSummary rule={rule} compact={!open} />
        </button>
        <div className="sp-rule__toolbar">
          {invalid && <span className="sp-rule__errdot" title={errs.join(' ')}><Icon name="alert" size={15} /></span>}
          <button className={'sp-switch' + (rule.enabled ? ' sp-switch--on' : '')} title={rule.enabled ? 'Disable rule' : 'Enable rule'} onClick={() => onChange({ ...rule, enabled: !rule.enabled })}></button>
          <span className="sp-rule__div"></span>
          <span className="sp-stepper">
            <button className="sp-stepper__b" disabled={!canMoveUp} title="Move up" onClick={() => onMove(-1)}><Icon name="chevronUp" size={12} /></button>
            <button className="sp-stepper__b" disabled={!canMoveDown} title="Move down" onClick={() => onMove(1)}><Icon name="chevronD" size={12} /></button>
          </span>
          <button className="sp-ibs" title="Duplicate rule" onClick={onDup}><Icon name="copy" /></button>
          <button className="sp-ibs sp-ibs--danger" title="Remove rule" onClick={onRemove}><Icon name="trash" /></button>
          <button className="sp-ibs" title={open ? 'Collapse' : 'Expand'} onClick={onToggle}><Icon name={open ? 'chevronUp' : 'chevronD'} /></button>
        </div>
      </div>
      {open && <div className="sp-rule__body"><RuleBuilder rule={rule} onChange={onChange} dir={dir} showErrors={showErrors} errs={errs} /></div>}
    </div>
  );
}

/* =====================================================================
   SPELL EDITOR
   ===================================================================== */
function SpellEditor({ spell, mode, dir, onDirChange, onSave, onCancel, onDirty }) {
  const [draft, setDraft] = useState(() => cloneSpell(spell));
  const [expandedId, setExpandedId] = useState(spell.rules.length === 1 ? spell.rules[0].id : (spell.rules[0] ? spell.rules[0].id : null));
  const [showErrors, setShowErrors] = useState(false);
  const initial = useRef(JSON.stringify(spell));

  const dirty = JSON.stringify(draft) !== initial.current;
  useEffect(() => { onDirty && onDirty(dirty); }, [dirty]);

  const { spellErrs, ruleErrs, ok } = useMemo(() => validateSpell(draft), [draft]);

  function patch(p) { setDraft(d => ({ ...d, ...p })); }
  function setRule(id, next) { setDraft(d => ({ ...d, rules: d.rules.map(r => r.id === id ? next : r) })); }
  function addRule() {
    const r = emptyRule();
    setDraft(d => ({ ...d, rules: [...d.rules, r] }));
    setExpandedId(r.id);
  }
  function dupRule(id) {
    setDraft(d => {
      const idx = d.rules.findIndex(r => r.id === id);
      const copy = cloneSpell(d.rules[idx]); copy.id = rid(); copy.label = copy.label ? copy.label + ' copy' : '';
      const rules = [...d.rules]; rules.splice(idx + 1, 0, copy);
      return { ...d, rules };
    });
  }
  function removeRule(id) { setDraft(d => ({ ...d, rules: d.rules.filter(r => r.id !== id) })); }
  function moveRule(id, delta) {
    setDraft(d => {
      const idx = d.rules.findIndex(r => r.id === id); const j = idx + delta;
      if (j < 0 || j >= d.rules.length) return d;
      const rules = [...d.rules]; const [x] = rules.splice(idx, 1); rules.splice(j, 0, x);
      return { ...d, rules };
    });
  }
  function trySave() {
    if (!ok) { setShowErrors(true); return; }
    onSave(draft);
  }

  const nameErr = showErrors && spellErrs.find(m => m.toLowerCase().includes('name'));

  return (
    <div className="sp-pane">
      <div className="sp-pane__hd" style={{ alignItems: 'center' }}>
        <div className="sp-avatar" style={{ background: sc(draft.color, 0.14), borderColor: sc(draft.color, 0.4), color: 'var(--pn-ink)' }}>{draft.icon || '✨'}</div>
        <div className="sp-pane__hdbody">
          <div className="sp-eyebrow" style={{ marginBottom: 5 }}>{mode === 'create' ? 'New spell' : 'Editing'} · {draft.rules.length}/20 {draft.rules.length === 1 ? 'rule' : 'rules'}</div>
          <input className="sp-input" style={{ fontFamily: 'var(--pn-serif)', fontSize: 20, fontWeight: 500, border: 'none', background: 'transparent', padding: 0 }} placeholder="Name your spell" value={draft.name} onChange={e => patch({ name: e.target.value })} />
          {nameErr && <div className="sp-err" style={{ marginTop: 4 }}><Icon name="alert" />{nameErr}</div>}
        </div>
        <div className="sp-dirtoggle" title="Compare editor layouts">
          <span>Layout</span>
          <div className="sp-seg">
            <button className={'sp-seg-i' + (dir === 'guided' ? ' sp-seg-i--active' : '')} onClick={() => onDirChange('guided')}>Guided</button>
            <button className={'sp-seg-i' + (dir === 'inline' ? ' sp-seg-i--active' : '')} onClick={() => onDirChange('inline')}>Inline</button>
          </div>
        </div>
      </div>

      <div className="sp-pane__body sp-scroll">
        {/* identity */}
        <div className="sp-ed__section">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <Field label="Description" req hint="A one-line human summary (not the injected text).">
              <textarea className="sp-textarea" style={{ minHeight: 56 }} placeholder="What does this spell do?" value={draft.description} onChange={e => patch({ description: e.target.value })} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 18 }}>
              <Field label="Icon">
                <input className="sp-input" style={{ textAlign: 'center', fontSize: 20 }} maxLength={10} value={draft.icon} onChange={e => patch({ icon: e.target.value })} />
              </Field>
              <Field label="Color" hint="The spell's identity on session chips.">
                <div className="sp-swatches">
                  {SPELL_COLOR_ORDER.map(c => (
                    <button key={c} className={'sp-swatch' + (draft.color === c ? ' sp-swatch--active' : '')} style={{ background: SPELL_COLORS[c] }} title={c} onClick={() => patch({ color: c })}></button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </div>

        {/* rules */}
        <div className="sp-ed__section">
          <div className="sp-ed__sechd">
            <span className="sp-eyebrow">Rules <span className="sp-count">· {draft.rules.length}</span></span>
            <span className="sp-sec__line"></span>
            <span className="sp-fhint">Fire top-to-bottom on a shared event.</span>
          </div>
          <div className="sp-rules">
            {draft.rules.map((r, i) => (
              <RuleCard key={r.id} rule={r} index={i} open={expandedId === r.id}
                onToggle={() => setExpandedId(id => id === r.id ? null : r.id)}
                onChange={next => setRule(r.id, next)}
                onDup={() => dupRule(r.id)} onRemove={() => removeRule(r.id)}
                onMove={(d) => moveRule(r.id, d)} canMoveUp={i > 0} canMoveDown={i < draft.rules.length - 1}
                dir={dir} showErrors={showErrors} errs={ruleErrs[r.id]} />
            ))}
          </div>
          {draft.rules.length < 20 && <button className="sp-addrule" onClick={addRule}><Icon name="plus" /> Add rule</button>}
          {showErrors && spellErrs.filter(m => !m.toLowerCase().includes('name')).map((m, i) => <div key={i} className="sp-err" style={{ marginTop: 8 }}><Icon name="alert" />{m}</div>)}
        </div>
      </div>

      <div className="sp-ed__foot">
        <div className="sp-ed__footL">
          {mode === 'edit' && <span className="sp-savehint"><Icon name="info" size={13} /> If this spell is active, changes apply on the next trigger — no re-cast needed.</span>}
          {showErrors && !ok && <span className="sp-err"><Icon name="alert" /> Fix the highlighted fields.</span>}
        </div>
        <button className="sp-btn sp-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="sp-btn sp-btn--primary" onClick={trySave}><Icon name="check" /> {mode === 'create' ? 'Create spell' : 'Save changes'}</button>
      </div>
    </div>
  );
}

/* color helper: soft fill from a spell color slug */
function sc(slug, alpha) {
  const hex = SPELL_COLORS[slug] || '#B26A2B';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return alpha === undefined ? hex : `rgba(${r},${g},${b},${alpha})`;
}

Object.assign(window, { SpellEditor, validateSpell, emptyRule, defaultAction, cloneSpell, Field, sc });
