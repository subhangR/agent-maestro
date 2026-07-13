/* studio.jsx — the unified Spell Studio (S1 library + S2 detail + S3 editor).
   Left: browsable library. Right: detail (read-only) or editor. */

const { useState: useStateS, useMemo: useMemoS } = React;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'seed', label: 'Curated' },
  { id: 'custom', label: 'Mine' },
  { id: 'runs', label: 'Runs commands' },
  { id: 'loops', label: 'Loops' },
  { id: 'notifies', label: 'Notifies' },
  { id: 'injects', label: 'Messages' },
];

function LibraryCard({ spell, selected, onClick, activeCount }) {
  return (
    <button className={'sp-card' + (selected ? ' sp-card--sel' : '')} onClick={onClick}>
      <span className="sp-ident" style={{ background: sc(spell.color, 0.14), borderColor: sc(spell.color, 0.4) }}>{spell.icon || '✨'}</span>
      <span className="sp-card__body">
        <span className="sp-card__top">
          <span className="sp-card__name">{spell.name}</span>
          <span className={'sp-badge ' + (spell.isDefault ? 'sp-badge--seed' : 'sp-badge--custom')}>{spell.isDefault ? 'Curated' : 'Custom'}</span>
          {activeCount > 0 && <span className="sp-badge sp-badge--active" title={activeCount + ' active'}>● {activeCount}</span>}
        </span>
        <span className="sp-card__sum">{spellSummary(spell)}</span>
      </span>
    </button>
  );
}

function SpellLibrary({ spells, selectedId, onSelect, onCreate, activeCountBySpell, loadState, onRetry }) {
  const [q, setQ] = useStateS('');
  const [filter, setFilter] = useStateS('all');

  const filtered = useMemoS(() => {
    let list = spells;
    if (filter === 'seed') list = list.filter(s => s.isDefault);
    else if (filter === 'custom') list = list.filter(s => !s.isDefault);
    else if (['runs','loops','notifies','injects'].includes(filter)) list = list.filter(s => spellCategories(s).includes(filter));
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(s => (s.name + ' ' + s.description + ' ' + s.rules.map(r => r.action.type + ' ' + (r.action.command || '') + ' ' + (r.trigger.hookEvent)).join(' ')).toLowerCase().includes(t));
    }
    return list;
  }, [spells, filter, q]);

  const seeds = filtered.filter(s => s.isDefault);
  const customs = filtered.filter(s => !s.isDefault);
  const recentSpells = RECENT.map(id => spells.find(s => s.id === id)).filter(Boolean).slice(0, 6);

  return (
    <div className="sp-lib">
      <div className="sp-lib__hd">
        <span className="sp-lib__title">
          <span className="sp-wand"><Icon name="wand" size={19} /></span>
          <span className="t-title" style={{ fontSize: 15 }}>Spellbook</span>
        </span>
        <span style={{ flex: 1 }}></span>
        <button className="sp-btn sp-btn--sm sp-btn--primary" onClick={onCreate}><Icon name="plus" /> Create</button>
      </div>

      <div className="sp-search">
        <Icon name="search" />
        <input placeholder="Search spells" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="sp-filters">
        {FILTERS.map(f => <button key={f.id} className={'sp-fchip' + (filter === f.id ? ' sp-fchip--active' : '')} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>

      <div className="sp-lib__body sp-scroll">
        {loadState === 'loading' && (
          <div style={{ padding: '4px 16px' }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ display: 'flex', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--pn-line)' }}>
                <div className="sp-skel" style={{ width: 34, height: 34, borderRadius: 7 }}></div>
                <div style={{ flex: 1 }}>
                  <div className="sp-skel" style={{ width: '55%', height: 12, marginBottom: 8 }}></div>
                  <div className="sp-skel" style={{ width: '85%', height: 9 }}></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <div className="sp-empty">
            <span className="sp-empty__ic"><Icon name="alert" size={22} /></span>
            <div className="sp-empty__h">Couldn't load spells</div>
            <div className="sp-empty__p">The request failed. Check your connection and try again.</div>
            <button className="sp-btn sp-btn--sm" style={{ marginTop: 6 }} onClick={onRetry}><Icon name="refresh" /> Retry</button>
          </div>
        )}

        {loadState === 'ready' && filtered.length === 0 && (
          <div className="sp-empty">
            <span className="sp-empty__ic"><Icon name="search" size={22} /></span>
            <div className="sp-empty__h">No spells match</div>
            <div className="sp-empty__p">Nothing matches “{q || filter}”. Try a different search or filter.</div>
          </div>
        )}

        {loadState === 'ready' && filtered.length > 0 && (
          <>
            {recentSpells.length > 0 && filter === 'all' && !q && (
              <>
                <div className="sp-sec"><span className="sp-eyebrow">Recently used</span><span className="sp-sec__line"></span></div>
                <div className="sp-recent">
                  {recentSpells.map(s => (
                    <button key={s.id} className="sp-recent-chip" onClick={() => onSelect(s.id)}>
                      <span className="sp-ident sp-ident--sm" style={{ background: sc(s.color, 0.16), borderColor: sc(s.color, 0.4) }}>{s.icon}</span>
                      {s.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {seeds.length > 0 && (
              <>
                <div className="sp-sec"><span className="sp-eyebrow">Curated <span className="sp-count">· {seeds.length}</span></span><span className="sp-sec__line"></span></div>
                {seeds.map(s => <LibraryCard key={s.id} spell={s} selected={s.id === selectedId} onClick={() => onSelect(s.id)} activeCount={activeCountBySpell[s.id] || 0} />)}
              </>
            )}
            {customs.length > 0 ? (
              <>
                <div className="sp-sec"><span className="sp-eyebrow">Your spells <span className="sp-count">· {customs.length}</span></span><span className="sp-sec__line"></span></div>
                {customs.map(s => <LibraryCard key={s.id} spell={s} selected={s.id === selectedId} onClick={() => onSelect(s.id)} activeCount={activeCountBySpell[s.id] || 0} />)}
              </>
            ) : (filter === 'all' && !q && (
              <>
                <div className="sp-sec"><span className="sp-eyebrow">Your spells</span><span className="sp-sec__line"></span></div>
                <div className="sp-empty" style={{ padding: '28px 24px' }}>
                  <div className="sp-empty__p">No custom spells yet. Start from a curated one, or create your own.</div>
                  <button className="sp-btn sp-btn--sm" style={{ marginTop: 8 }} onClick={onCreate}><Icon name="plus" /> Create spell</button>
                </div>
              </>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Detail (S2, read-only view of a spell) ---- */
function DetailRule({ rule, index }) {
  const a = rule.action;
  const rows = [];
  rows.push(['Trigger', <span className="sp-rsum__trig">{eventPhrase(rule)}</span>]);
  if (a.type === 'inject-prompt' || a.type === 'feed-context') rows.push([a.type === 'inject-prompt' ? 'Prompt' : 'Context', <span className="sp-mono" style={{ fontSize: 12 }}>{a.prompt}</span>]);
  if (a.type === 'run-command') { rows.push(['Command', <code className="sp-rsum__code">{[a.command, ...(a.args || [])].join(' ')}</code>]); rows.push(['Feed output', a.feedOutput ? 'Yes' : 'No']); }
  if (a.type === 'continue-loop') { const lt = LOOP_TYPES.find(l => l.id === a.loopType); rows.push(['Loop', (lt ? lt.label : a.loopType) + ' · max ' + a.maxIterations]); }
  if (a.type === 'notify-channel') { rows.push(['Channel', a.channel || 'default']); if (a.message) rows.push(['Message', a.message]); }
  return (
    <div className="sp-drule">
      <div className="sp-drule__hd">
        <span className="sp-drule__num">{index + 1}</span>
        <span className="sp-drule__main">
          {rule.label && <div className="sp-drule__label">{rule.label}</div>}
          <RuleSummary rule={rule} compact />
        </span>
        <span className={'sp-badge ' + (rule.enabled ? 'sp-badge--active' : '')}>{rule.enabled ? 'On' : 'Off'}</span>
      </div>
      <div className="sp-drule__cfg">
        {rows.map(([k, v], i) => <div key={i} className="sp-kv"><span className="sp-kv__k">{k}</span><span className="sp-kv__v">{v}</span></div>)}
      </div>
    </div>
  );
}

function SpellDetail({ spell, activeCount, onCast, onEdit, onDuplicate, onDelete }) {
  const risky = spellIsRisky(spell);
  const updated = new Date(spell.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="sp-pane">
      <div className="sp-pane__hd">
        <span className="sp-ident sp-ident--lg" style={{ background: sc(spell.color, 0.14), borderColor: sc(spell.color, 0.4) }}>{spell.icon || '✨'}</span>
        <div className="sp-pane__hdbody">
          <div className="sp-pane__name">{spell.name}</div>
          <div className="sp-pane__meta">
            <span className={'sp-badge ' + (spell.isDefault ? 'sp-badge--seed' : 'sp-badge--custom')}>{spell.isDefault ? 'Curated · read-only' : 'Custom'}</span>
            {risky && <span className="sp-badge sp-badge--risk">Side-effects</span>}
            {activeCount > 0 && <span className="sp-badge sp-badge--active">Active on {activeCount}</span>}
            <span className="sp-metabar">{spell.rules.length} {spell.rules.length === 1 ? 'rule' : 'rules'} · updated {updated}</span>
          </div>
          <div className="sp-pane__desc">{spell.description}</div>
        </div>
      </div>

      <div className="sp-pane__body sp-scroll">
        <div className="sp-ed__sechd" style={{ marginBottom: 12 }}>
          <span className="sp-eyebrow">Rules <span className="sp-count">· {spell.rules.length}</span></span>
          <span className="sp-sec__line"></span>
        </div>
        {spell.rules.map((r, i) => <DetailRule key={r.id} rule={r} index={i} />)}
      </div>

      <div className="sp-ed__foot">
        <div className="sp-ed__footL">
          {spell.isDefault
            ? <span className="sp-savehint"><Icon name="shield" size={13} /> Curated spells are protected — editing saves an editable copy.</span>
            : <button className="sp-btn sp-btn--danger sp-btn--sm" onClick={onDelete}><Icon name="trash" /> Delete</button>}
        </div>
        <button className="sp-btn sp-btn--sm" onClick={onDuplicate}><Icon name="copy" /> Duplicate</button>
        <button className="sp-btn sp-btn--sm" onClick={onEdit}><Icon name="pen" /> {spell.isDefault ? 'Edit a copy' : 'Edit'}</button>
        <button className="sp-btn sp-btn--primary sp-btn--sm" onClick={onCast}><Icon name="wand" /> Cast spell</button>
      </div>
    </div>
  );
}

/* ---- The Studio shell ---- */
function newSpellDraft() {
  return { id: 'draft-' + Date.now(), isDefault: false, name: '', description: '', icon: '✨', color: 'sky', createdAt: Date.now(), updatedAt: Date.now(), rules: [emptyRule()] };
}

function SpellStudio({ spells, activeCountBySpell, initialMode, initialSpellId, onClose, onSaveSpell, onDeleteSpell, onCast, loadState, onRetry, confirm }) {
  const [selectedId, setSelectedId] = useStateS(initialSpellId || (spells[0] && spells[0].id));
  const [mode, setMode] = useStateS(initialMode || 'detail'); // detail | edit | create
  const [draft, setDraft] = useStateS(initialMode === 'create' ? newSpellDraft() : null);
  const [dir, setDir] = useStateS('guided');
  const [dirty, setDirty] = useStateS(false);

  const selected = spells.find(s => s.id === selectedId);

  function guardThen(fn) {
    if ((mode === 'edit' || mode === 'create') && dirty) {
      confirm({ title: 'Discard changes?', body: 'You have unsaved edits to this spell. Discard them?', danger: true, confirmLabel: 'Discard', onConfirm: () => { setDirty(false); fn(); } });
    } else fn();
  }

  function selectSpell(id) { guardThen(() => { setSelectedId(id); setMode('detail'); setDraft(null); }); }
  function startCreate() { guardThen(() => { setDraft(newSpellDraft()); setMode('create'); }); }
  function startEdit() {
    if (selected.isDefault) {
      // curated spells are protected — editing forks an editable copy
      const d = cloneSpell(selected);
      d.id = 'draft-' + Date.now(); d.isDefault = false; d.name = selected.name + ' (custom)';
      d.rules.forEach(r => r.id = rid());
      setDraft(d); setMode('create');
    } else {
      setDraft(cloneSpell(selected)); setMode('edit');
    }
  }
  function duplicate(s) {
    const d = cloneSpell(s);
    d.id = 'draft-' + Date.now(); d.isDefault = false; d.name = s.name + ' copy';
    d.rules.forEach(r => r.id = rid());
    guardThen(() => { setDraft(d); setMode('create'); });
  }
  function handleSave(saved) {
    const stored = onSaveSpell(saved, mode);
    setDirty(false); setDraft(null); setMode('detail'); setSelectedId(stored.id);
  }

  return (
    <div className="sp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) guardThen(onClose); }}>
      <div className="sp-modal sp-studio" role="dialog" aria-label="Spell studio">
        <SpellLibrary spells={spells} selectedId={selectedId} onSelect={selectSpell} onCreate={startCreate}
          activeCountBySpell={activeCountBySpell} loadState={loadState} onRetry={onRetry} />
        {(mode === 'edit' || mode === 'create') && draft ? (
          <SpellEditor spell={draft} mode={mode} dir={dir} onDirChange={setDir}
            onSave={handleSave} onCancel={() => guardThen(() => { setMode(mode === 'create' ? 'detail' : 'detail'); setDraft(null); })}
            onDirty={setDirty} />
        ) : selected ? (
          <SpellDetail spell={selected} activeCount={activeCountBySpell[selected.id] || 0}
            onCast={() => onCast(selected)} onEdit={startEdit} onDuplicate={() => duplicate(selected)}
            onDelete={() => confirm({ title: 'Delete “' + selected.name + '”?', body: (activeCountBySpell[selected.id] ? 'This spell is active on ' + activeCountBySpell[selected.id] + ' session(s); it will be deactivated. ' : '') + 'This cannot be undone.', danger: true, confirmLabel: 'Delete', onConfirm: () => onDeleteSpell(selected.id) })} />
        ) : (
          <div className="sp-pane"><div className="sp-empty" style={{ margin: 'auto' }}><span className="sp-empty__ic"><Icon name="wand" size={22} /></span><div className="sp-empty__h">Pick a spell</div><div className="sp-empty__p">Choose one from the spellbook, or create a new automation.</div></div></div>
        )}
        <button className="sp-mhd__x" style={{ position: 'absolute', top: 12, right: 12, zIndex: 5 }} onClick={() => guardThen(onClose)} title="Close"><Icon name="x" /></button>
      </div>
    </div>
  );
}

Object.assign(window, { SpellStudio });
