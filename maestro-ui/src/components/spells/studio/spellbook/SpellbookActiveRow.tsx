import React, { useState } from 'react';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../../../stores/useSpellActivationStore';
import { useActiveSpellsStore, type ActiveSpellView } from '../../../../stores/useActiveSpellsStore';
import { loopRules, spellRuleSummary, loopProgress } from '../../../../utils/spellSummary';

export interface SpellbookActiveRowProps {
  sessionId: string;
  active: ActiveSpellView;
}

/**
 * SpellbookActiveRow (S6) — one active spell inside the Spellbook, with the full
 * manage surface: enable/disable, reset-loop (real endpoint), deactivate, and a
 * live loop-progress readout.
 */
export const SpellbookActiveRow = React.memo(function SpellbookActiveRow({
  sessionId,
  active,
}: SpellbookActiveRowProps) {
  const spell = useSpellLibraryStore((s) => s.spellById(active.spellId));
  const setSpellEnabled = useSpellActivationStore((s) => s.setSpellEnabled);
  const removeActiveSpell = useSpellActivationStore((s) => s.removeActiveSpell);
  const resetLoop = useActiveSpellsStore((s) => s.resetLoop);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = spell?.name ?? active.spellName;
  const isLoop = loopRules(spell).length > 0;
  const { current, max } = loopProgress(spell, active.ruleIterations);
  const summary = spell ? spellRuleSummary(spell) : '';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`spa-row${active.enabled ? '' : ' spa-row--paused'}`} data-spell-color={active.colorId}>
      <span className="spa-row__dot" aria-hidden />
      <div className="spa-row__main">
        <span className="spa-row__name">{name}</span>
        {summary && <span className="spa-row__desc">{summary}</span>}
        {error && <span className="spa-row__error" role="alert">{error}</span>}
      </div>

      {isLoop && max > 0 && (
        <span className="spa-row__iter" aria-label={`Loop iteration ${current} of ${max}`}>
          <span className="spa-row__beads" aria-hidden>
            {Array.from({ length: Math.min(max, 12) }, (_, i) => (
              <span key={i} className={`spa-row__bead${i < current ? ' spa-row__bead--on' : ''}`} />
            ))}
          </span>
          <span className="spa-row__iter-text">{current}/{max}</span>
        </span>
      )}

      <label className="spa-row__switch" title={active.enabled ? 'Disable' : 'Enable'}>
        <input
          type="checkbox"
          checked={active.enabled}
          disabled={busy}
          onChange={(e) => void run(() => setSpellEnabled(sessionId, active.spellId, e.target.checked))}
          aria-label={`${active.enabled ? 'Disable' : 'Enable'} ${name}`}
        />
        <span className="spa-row__switch-track" aria-hidden />
      </label>

      {isLoop && (
        <button
          type="button"
          className="spa-row__reset"
          disabled={busy}
          onClick={() => void run(() => resetLoop({ maestroSessionId: sessionId, spellId: active.spellId }))}
          aria-label={`Reset loop for ${name}`}
        >↻</button>
      )}
      <button
        type="button"
        className="spa-row__remove"
        disabled={busy}
        onClick={() => void run(() => removeActiveSpell(sessionId, active.spellId))}
        aria-label={`Deactivate ${name}`}
      >✕</button>
    </div>
  );
});
