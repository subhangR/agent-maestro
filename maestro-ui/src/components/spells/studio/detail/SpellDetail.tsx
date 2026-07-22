import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useActiveSpellsStore } from '../../../../stores/useActiveSpellsStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { maestroClient } from '../../../../utils/MaestroClient';
import {
  triggerSummary, actionSummary, isRiskySpell, syntheticHookPayload,
  HOOK_EVENT_DESCRIPTIONS, LOOP_TYPE_LABELS,
} from '../../../../utils/spellSummary';
import type { Spell, SpellRule, HookDispatchMatch } from '../../../../app/types/maestro';
import { ShareToSpaceModal } from '../../../share/ShareToSpaceModal';
import { buildSpellShareInput } from '../../../../hooks/useSpaceSharing';
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
  const sessionsMap = useMaestroStore((s) => s.sessions);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const activeSessionCount = useMemo(() => {
    let n = 0;
    for (const list of Object.values(byMaestroSessionId)) {
      if (list.some((a) => a.spellId === spellId)) n++;
    }
    return n;
  }, [byMaestroSessionId, spellId]);

  // C2 — pick the dry-run target: prefer a session this spell is active on
  // (the dispatcher only matches ACTIVE spells), else any live session so the
  // report can still say "would not fire" honestly.
  const testTarget = useMemo(() => {
    for (const [sid, list] of Object.entries(byMaestroSessionId)) {
      if (list.some((a) => a.spellId === spellId)) return { sessionId: sid, spellActive: true };
    }
    const live = Object.values(sessionsMap).find(
      (s) => s.status !== 'completed' && s.status !== 'stopped' && s.status !== 'failed',
    );
    return live ? { sessionId: live.id, spellActive: false } : null;
  }, [byMaestroSessionId, sessionsMap, spellId]);

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
          <button className="spst-btn" onClick={() => setShareOpen(true)} type="button">
            Share
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

        {shareOpen && createPortal(
          <ShareToSpaceModal
            payload={{ kind: 'spell', entityLabel: spell.name, data: buildSpellShareInput(spell) }}
            onClose={() => setShareOpen(false)}
          />,
          document.body,
        )}

        <div className="spst-scroll">
          <div className="spst-rules">
            {spell.rules.map((rule, i) => (
              <RuleView key={rule.id || i} rule={rule} index={i} spellId={spell.id} testTarget={testTarget} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TestTarget { sessionId: string; spellActive: boolean }

function RuleView({ rule, index, spellId, testTarget }: {
  rule: SpellRule;
  index: number;
  spellId: string;
  testTarget: TestTarget | null;
}) {
  const configRows = describeConfig(rule);
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<{ mine: HookDispatchMatch | null; others: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const canTestFire = rule.trigger.type === 'hook' && Boolean(testTarget);

  const handleTestFire = async () => {
    if (rule.trigger.type !== 'hook' || !testTarget) return;
    setTesting(true); setTestError(null); setReport(null);
    try {
      // Dry-run is side-effect-free (C2): full matching, zero execution.
      const result = await maestroClient.dispatchHookDryRun({
        sessionId: testTarget.sessionId,
        event: rule.trigger.hookEvent,
        payload: syntheticHookPayload(rule.trigger),
      });
      const matched = Array.isArray(result?.matched) ? result.matched : [];
      const mine = matched.find((m) => m.spellId === spellId && m.ruleId === rule.id) ?? null;
      const others = matched.filter((m) => !(m.spellId === spellId && m.ruleId === rule.id)).length;
      setReport({ mine, others });
    } catch (e: any) {
      setTestError(e?.message ?? 'Test fire failed');
    } finally {
      setTesting(false);
    }
  };

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
        <button
          className="spst-btn spst-btn--ghost spst-rule__testfire-btn"
          type="button"
          disabled={!canTestFire || testing}
          title={canTestFire
            ? 'Dry-run this rule against a live session — nothing executes'
            : 'Needs a live session to probe (spawn one first)'}
          onClick={handleTestFire}
        >
          {testing ? 'Testing…' : 'Test fire'}
        </button>
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
      {(report || testError) && (
        <div className="spst-rule__testfire" aria-live="polite">
          {testError ? (
            <span className="spst-rule__testfire-line spst-rule__testfire-line--warn">⚠ {testError}</span>
          ) : report?.mine ? (
            report.mine.wouldExecute ? (
              <span className="spst-rule__testfire-line spst-rule__testfire-line--ok">
                ✓ Would fire → {report.mine.action}
              </span>
            ) : (
              <span className="spst-rule__testfire-line spst-rule__testfire-line--warn">
                ◦ Matched but skipped{report.mine.skipReason ? ` — ${report.mine.skipReason}` : ''}
              </span>
            )
          ) : (
            <span className="spst-rule__testfire-line">
              ✕ Would not fire on the probed session
              {testTarget && !testTarget.spellActive ? ' — cast this spell on a session first for a true test' : ''}
            </span>
          )}
          {report && report.others > 0 && (
            <span className="spst-rule__testfire-line spst-rule__testfire-line--meta">
              {report.others} other rule{report.others === 1 ? '' : 's'} would also fire on this event.
            </span>
          )}
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
      rows.push(['notification', 'in-app (toast + history)']);
      if (a.message) rows.push(['message', a.message]);
      break;
  }
  return rows;
}
