import React, { useMemo, useState } from 'react';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useActiveSpellsStore } from '../../../../stores/useActiveSpellsStore';
import {
  triggerSummary, actionSummary, isRiskySpell, HOOK_EVENT_DESCRIPTIONS, LOOP_TYPE_LABELS,
} from '../../../../utils/spellSummary';
import type { Spell, SpellRule } from '../../../../app/types/maestro';
import {
  spellColorVars, IconBack, IconCast, IconEdit, IconCopy, IconTrash, IconWarn, StudioState,
} from '../studioShared';

export interface SpellDetailProps {
  spellId: string;
  onBack: () => void;
  onCast: (spellId: string) => void;
  onEdit: (spell: Spell) => void;
  onDuplicate: (spell: Spell) => void;
  onDeleted: () => void;
}

/** S2 — Spell Detail. Every rule expanded, metadata, and lifecycle actions. */
export function SpellDetail({ spellId, onBack, onCast, onEdit, onDuplicate, onDeleted }: SpellDetailProps) {
  const spell = useSpellLibraryStore((s) => s.spells.find((x) => x.id === spellId));
  const deleteSpell = useSpellLibraryStore((s) => s.deleteSpell);
  const byMaestroSessionId = useActiveSpellsStore((s) => s.byMaestroSessionId);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSessionCount = useMemo(() => {
    let n = 0;
    for (const list of Object.values(byMaestroSessionId)) {
      if (list.some((a) => a.spellId === spellId)) n++;
    }
    return n;
  }, [byMaestroSessionId, spellId]);

  if (!spell) {
    return (
      <div className="spst-main">
        <StudioState icon={<IconWarn />} title="Spell not found" text="It may have been deleted."
          action={<button className="spst-btn" onClick={onBack} type="button">Back to library</button>} />
      </div>
    );
  }

  const seed = Boolean(spell.isDefault);
  const risky = isRiskySpell(spell);

  const handleDelete = async () => {
    setBusy(true); setError(null);
    try {
      await deleteSpell(spell.id);
      onDeleted();
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <div className="spst-main">
      <div className="spst-detail">
        <div className="spst-detail__actions" style={{ borderTop: 'none' }}>
          <button className="spst-btn spst-btn--ghost" onClick={onBack} type="button">
            <IconBack /> Library
          </button>
        </div>

        <div className="spst-detail__hero" style={spellColorVars(spell.color)}>
          <span className="spst-swatch spst-swatch--lg" aria-hidden>{spell.icon || '✦'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="spst-detail__title">{spell.name}</div>
            {spell.description && <div className="spst-detail__desc">{spell.description}</div>}
            <div className="spst-detail__badges">
              <span className={`spst-badge ${seed ? 'spst-badge--seed' : 'spst-badge--custom'}`}>
                {seed ? 'Seed · read-only' : 'Custom'}
              </span>
              {risky && <span className="spst-badge spst-badge--risk">Side effects</span>}
              {activeSessionCount > 0 && (
                <span className="spst-badge spst-badge--live">Active on {activeSessionCount} session{activeSessionCount === 1 ? '' : 's'}</span>
              )}
              <span className="spst-meta">
                {spell.rules.length} rule{spell.rules.length === 1 ? '' : 's'} · updated {new Date(spell.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="spst-detail__actions">
          <button className="spst-btn spst-btn--primary" onClick={() => onCast(spell.id)} type="button">
            <IconCast /> Cast
          </button>
          {seed ? (
            <button className="spst-btn" onClick={() => onDuplicate(spell)} type="button">
              <IconCopy /> Duplicate to edit
            </button>
          ) : (
            <>
              <button className="spst-btn" onClick={() => onEdit(spell)} type="button">
                <IconEdit /> Edit
              </button>
              <button className="spst-btn" onClick={() => onDuplicate(spell)} type="button">
                <IconCopy /> Duplicate
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {!seed && !confirmDelete && (
            <button className="spst-btn spst-btn--danger" onClick={() => setConfirmDelete(true)} type="button">
              <IconTrash /> Delete
            </button>
          )}
          {!seed && confirmDelete && (
            <>
              {activeSessionCount > 0 && (
                <span className="spst-meta" style={{ color: 'var(--spst-block)' }}>
                  Active on {activeSessionCount} — will keep running until deactivated.
                </span>
              )}
              <button className="spst-btn spst-btn--ghost" onClick={() => setConfirmDelete(false)} type="button" disabled={busy}>Cancel</button>
              <button className="spst-btn spst-btn--danger" onClick={handleDelete} type="button" disabled={busy}>
                {busy ? 'Deleting…' : 'Confirm delete'}
              </button>
            </>
          )}
        </div>

        {error && <div className="spst-confirm" style={{ marginTop: 8 }}><IconWarn /><div className="spst-confirm__body"><div className="spst-confirm__text">{error}</div></div></div>}

        <div className="spst-scroll">
          <div className="spst-rules">
            {spell.rules.map((rule, i) => <RuleView key={rule.id || i} rule={rule} index={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleView({ rule, index }: { rule: SpellRule; index: number }) {
  const configRows = describeConfig(rule);
  return (
    <div className={`spst-rule ${rule.enabled ? '' : 'spst-rule--disabled'}`}>
      <div className="spst-rule__head">
        <span className="spst-rule__num">{index + 1}</span>
        <span className="spst-rule__summary">
          {rule.label && <span className="spst-rule__label">{rule.label}: </span>}
          {triggerSummary(rule.trigger)} → {actionSummary(rule.action)}
        </span>
        <span className={`spst-badge ${rule.enabled ? 'spst-badge--live' : ''}`}>
          {rule.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      {configRows.length > 0 && (
        <div className="spst-rule__config">
          {configRows.map(([k, v]) => (
            <div className="spst-rule__config-row" key={k}>
              <span className="spst-rule__config-k">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Flatten a rule's trigger + action into displayable key/value config rows. */
function describeConfig(rule: SpellRule): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const t = rule.trigger;
  if (t.type === 'hook') {
    rows.push(['when', HOOK_EVENT_DESCRIPTIONS[t.hookEvent] ?? t.hookEvent]);
    rows.push(['matcher', t.matcher ? t.matcher : 'every occurrence']);
  } else {
    rows.push(['when', 'schedule (coming soon)']);
  }
  const a = rule.action;
  switch (a.type) {
    case 'inject-prompt':
    case 'feed-context':
      rows.push([a.type === 'inject-prompt' ? 'prompt' : 'context', a.prompt || '—']);
      break;
    case 'run-command':
      rows.push(['command', a.command || '—']);
      if (a.args?.length) rows.push(['args', a.args.join(' ')]);
      if (a.cwd) rows.push(['cwd', a.cwd]);
      rows.push(['feed output', a.feedOutput ? 'yes' : 'no']);
      break;
    case 'continue-loop':
      rows.push(['loop', LOOP_TYPE_LABELS[a.loopType ?? 'continue-until-done']]);
      rows.push(['max iterations', String(a.maxIterations ?? '∞')]);
      break;
    case 'notify-channel':
      rows.push(['channel', a.channel || 'default (best-effort)']);
      if (a.message) rows.push(['message', a.message]);
      break;
  }
  return rows;
}
