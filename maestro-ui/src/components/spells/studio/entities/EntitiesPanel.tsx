import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { maestroClient } from '../../../../utils/MaestroClient';
import { useProjectStore } from '../../../../stores/useProjectStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import type {
  SpellEntityType, SpellEntity, SpellDefinition, CustomPrompt,
} from '../../../../app/types/maestro';
import {
  IconEntity, IconSend, IconPlus, IconEdit, IconTrash, IconWarn, IconBack,
  StudioState,
} from '../studioShared';

const ENTITY_TYPES: Array<{ key: SpellEntityType; label: string }> = [
  { key: 'task', label: 'Tasks' },
  { key: 'session', label: 'Sessions' },
  { key: 'doc', label: 'Docs' },
  { key: 'skill', label: 'Skills' },
  { key: 'team-member', label: 'Team' },
  { key: 'maestro', label: 'Maestro' },
  { key: 'custom-prompt', label: 'Custom prompts' },
];

/**
 * S10 — Casts / Entities & Custom Prompts (Mechanism B). One-shot invocations,
 * kept clearly separate from spell automations (Mechanism A). No persistence,
 * no rings.
 */
export function EntitiesPanel() {
  const [type, setType] = useState<SpellEntityType>('task');

  return (
    <div className="spst-main">
      <div className="spst-cast__section" style={{ borderBottom: '1px solid var(--spst-line)' }}>
        <div className="spst-row__sub" style={{ marginBottom: 8 }}>
          One-shot casts send a templated prompt to a session. Unlike spells, they don't
          persist or leave a ring — they run once.
        </div>
        <div className="spst-entity-types" style={{ padding: 0 }}>
          {ENTITY_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`spst-etype ${type === t.key ? 'spst-etype--active' : ''}`}
              onClick={() => setType(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {type === 'custom-prompt' ? <CustomPrompts /> : <EntityCaster type={type} />}
    </div>
  );
}

/* ── Entity → verb → target → send ─────────────────────────────────────────── */
function EntityCaster({ type }: { type: SpellEntityType }) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const sessionsMap = useMaestroStore((s) => s.sessions);

  const [entities, setEntities] = useState<SpellEntity[]>([]);
  const [defs, setDefs] = useState<SpellDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpellEntity | null>(null);
  const [verb, setVerb] = useState<string | null>(null);
  const [targetSessionId, setTargetSessionId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  const eligible = useMemo(() => {
    if (!activeProjectId) return [];
    return Object.values(sessionsMap)
      .filter((s) => s.projectId === activeProjectId && s.status !== 'completed' && s.status !== 'stopped' && s.status !== 'failed')
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  }, [sessionsMap, activeProjectId]);

  useEffect(() => {
    setSelected(null); setVerb(null); setReceipt(null); setError(null);
    if (!activeProjectId) { setEntities([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      maestroClient.listSpellEntities(type, activeProjectId),
      maestroClient.listSpellDefinitions(type).catch(() => [] as SpellDefinition[]),
    ])
      .then(([ents, ds]) => { if (!cancelled) { setEntities(ents); setDefs(ds); } })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Failed to load entities'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, activeProjectId]);

  useEffect(() => {
    if (!targetSessionId && eligible[0]) setTargetSessionId(eligible[0].id);
  }, [eligible, targetSessionId]);

  const verbsFor = useCallback((entity: SpellEntity): string[] => {
    if (entity.availableSpells?.length) return entity.availableSpells;
    return defs.map((d) => d.name);
  }, [defs]);

  const send = async () => {
    if (!selected || !activeProjectId || !targetSessionId) return;
    setSending(true); setError(null); setReceipt(null);
    try {
      const res = await maestroClient.invokeSpell({
        entityType: type,
        entityId: selected.id,
        spellName: verb ?? undefined,
        targetSessionId,
        projectId: activeProjectId,
        invokerSessionId: null,
      });
      const target = sessionsMap[targetSessionId]?.name ?? targetSessionId;
      setReceipt(`Sent “${res.spellName}” from ${selected.name} → ${target}`);
      setVerb(null);
    } catch (e: any) {
      setError(e?.message ?? 'Invoke failed');
    } finally {
      setSending(false);
    }
  };

  if (!activeProjectId) {
    return <div className="spst-scroll"><StudioState icon={<IconEntity />} title="No project open" text="Open a project to browse its entities." /></div>;
  }
  if (loading) {
    return <div className="spst-scroll"><StudioState icon={<IconEntity />} title="Loading…" /></div>;
  }
  if (error && entities.length === 0) {
    return <div className="spst-scroll"><StudioState icon={<IconWarn />} title="Couldn't load entities" text={error} /></div>;
  }

  // Detail: chosen entity → verb + target + send.
  if (selected) {
    const verbs = verbsFor(selected);
    return (
      <div className="spst-scroll">
        <div className="spst-cast__section">
          <div className="spst-cast__section-head">
            <button className="spst-btn spst-btn--ghost" onClick={() => setSelected(null)} type="button"><IconBack /></button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="spst-card__name">{selected.name}</div>
              {selected.description && <div className="spst-row__sub">{selected.description}</div>}
            </div>
          </div>
        </div>
        <div className="spst-cast__section">
          <div className="spst-cast__section-head"><span className="spst-eyebrow">Verb / template</span></div>
          <div className="spst-targets">
            {verbs.length === 0 && <span className="spst-row__sub">Default “send”.</span>}
            {verbs.map((v) => {
              const def = defs.find((d) => d.name === v);
              return (
                <button key={v} type="button"
                  className={`spst-target ${verb === v ? 'spst-target--selected' : ''}`}
                  onClick={() => setVerb(v)} title={def?.description}>
                  {def?.label ?? v}
                </button>
              );
            })}
          </div>
        </div>
        <div className="spst-cast__section">
          <div className="spst-cast__section-head"><span className="spst-eyebrow">Target session</span></div>
          {eligible.length === 0 ? (
            <div className="spst-row__sub">No eligible sessions in this project.</div>
          ) : (
            <select className="spst-input" value={targetSessionId} onChange={(e) => setTargetSessionId(e.target.value)} aria-label="Target session">
              {eligible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        {receipt && <div className="spst-confirm" style={{ borderColor: 'rgba(62,142,90,0.4)', background: 'var(--spst-run-soft)' }}><div className="spst-confirm__body"><div className="spst-confirm__text">{receipt}</div></div></div>}
        {error && <div className="spst-confirm"><IconWarn /><div className="spst-confirm__body"><div className="spst-confirm__text">{error}</div></div></div>}
        <div className="spst-cast__foot">
          <span className="spst-cast__hint">One-shot cast — runs once, no ring.</span>
          <button className="spst-btn spst-btn--primary" onClick={send} type="button" disabled={sending || !targetSessionId}>
            <IconSend /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    );
  }

  // List of entities.
  return (
    <div className="spst-scroll">
      {entities.length === 0 ? (
        <StudioState icon={<IconEntity />} title="Nothing to cast from" text={`No ${type} entities in this project yet.`} />
      ) : (
        <div className="spst-list">
          {entities.map((e) => (
            <button key={e.id} type="button" className="spst-row" onClick={() => setSelected(e)}>
              <span className="spst-swatch" aria-hidden>{e.icon || '◆'}</span>
              <span className="spst-row__body">
                <span className="spst-row__title">{e.name}</span>
                {e.description && <span className="spst-row__sub">{e.description}</span>}
              </span>
              <span className="spst-row__trail"><span className="spst-meta">{(e.availableSpells?.length ?? 0)} verbs</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Custom prompt CRUD ─────────────────────────────────────────────────────── */
function CustomPrompts() {
  const [prompts, setPrompts] = useState<CustomPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomPrompt | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    maestroClient.listCustomPrompts()
      .then(setPrompts)
      .catch((e) => setError(e?.message ?? 'Failed to load custom prompts'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (editing) {
    return <CustomPromptEditor
      prompt={editing === 'new' ? null : editing}
      onCancel={() => setEditing(null)}
      onSaved={() => { setEditing(null); load(); }}
    />;
  }

  return (
    <div className="spst-scroll">
      <div className="spst-cast__section" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="spst-btn spst-btn--primary" type="button" onClick={() => setEditing('new')}>
          <IconPlus /> New custom prompt
        </button>
      </div>
      {loading ? (
        <StudioState title="Loading…" />
      ) : error ? (
        <StudioState icon={<IconWarn />} title="Couldn't load" text={error}
          action={<button className="spst-btn" onClick={load} type="button">Retry</button>} />
      ) : prompts.length === 0 ? (
        <StudioState title="No custom prompts" text="Create a reusable one-shot prompt snippet." />
      ) : (
        <div className="spst-list">
          {prompts.map((p) => (
            <div key={p.id} className="spst-row">
              <span className="spst-swatch" aria-hidden>{p.icon || '✎'}</span>
              <span className="spst-row__body">
                <span className="spst-row__title">{p.name}</span>
                {p.description && <span className="spst-row__sub">{p.description}</span>}
              </span>
              <span className="spst-row__trail">
                <button className="spst-btn spst-btn--ghost" type="button" onClick={() => setEditing(p)} aria-label="Edit"><IconEdit /></button>
                <button className="spst-btn spst-btn--danger" type="button"
                  onClick={async () => { try { await maestroClient.deleteCustomPrompt(p.id); load(); } catch (e: any) { setError(e?.message ?? 'Delete failed'); } }}
                  aria-label="Delete"><IconTrash /></button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomPromptEditor({ prompt, onCancel, onSaved }: {
  prompt: CustomPrompt | null; onCancel: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(prompt?.name ?? '');
  const [description, setDescription] = useState(prompt?.description ?? '');
  const [icon, setIcon] = useState(prompt?.icon ?? '');
  const [content, setContent] = useState(prompt?.content ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || !content.trim()) { setError('Name and content are required.'); return; }
    setBusy(true); setError(null);
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined, icon: icon.trim() || undefined, content };
      if (prompt) await maestroClient.updateCustomPrompt(prompt.id, payload);
      else await maestroClient.createCustomPrompt(payload);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed'); setBusy(false);
    }
  };

  return (
    <div className="spst-scroll">
      <div className="spst-cast__section">
        <div className="spst-cast__section-head">
          <button className="spst-btn spst-btn--ghost" onClick={onCancel} type="button"><IconBack /></button>
          <span className="spst-eyebrow">{prompt ? 'Edit custom prompt' : 'New custom prompt'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="spst-input" style={{ maxWidth: 64 }} placeholder="✎" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icon" maxLength={4} />
          <input className="spst-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        </div>
        <input className="spst-input" style={{ marginBottom: 8 }} placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
        <textarea className="spst-input spst-textarea" placeholder="Prompt content…" value={content} onChange={(e) => setContent(e.target.value)} aria-label="Content" />
        {error && <div className="spst-confirm" style={{ margin: '8px 0 0' }}><IconWarn /><div className="spst-confirm__body"><div className="spst-confirm__text">{error}</div></div></div>}
      </div>
      <div className="spst-cast__foot">
        <span className="spst-cast__hint" />
        <button className="spst-btn spst-btn--ghost" onClick={onCancel} type="button" disabled={busy}>Cancel</button>
        <button className="spst-btn spst-btn--primary" onClick={save} type="button" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
