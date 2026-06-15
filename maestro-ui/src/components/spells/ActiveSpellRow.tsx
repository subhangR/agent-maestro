import React from 'react';
import { useSpellLibraryStore } from '../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';
import type { ActiveSpellView } from '../../stores/useActiveSpellsStore';

export interface ActiveSpellRowProps {
  sessionId: string;
  active: ActiveSpellView;
}

/** ActiveSpellRow — expanded row used in SpellbookDrawer (03 §3.6). */
export const ActiveSpellRow = React.memo(function ActiveSpellRow({
  sessionId,
  active,
}: ActiveSpellRowProps) {
  const spell = useSpellLibraryStore((s) => s.spellById(active.spellId));
  const setSpellEnabled = useSpellActivationStore((s) => s.setSpellEnabled);
  const removeActiveSpell = useSpellActivationStore((s) => s.removeActiveSpell);
  const resetIteration = useSpellActivationStore((s) => s.resetIteration);

  const name = spell?.name ?? active.spellName;
  const isLoop = spell?.action === 'continue-loop';
  const max = spell?.maxIterations ?? 0;

  return (
    <div className="sp-row" data-spell-color={active.colorId}>
      <span className="sp-row__dot" aria-hidden />
      <span className="sp-row__name">{name}</span>
      {spell?.description && (
        <span className="sp-row__desc">{spell.description}</span>
      )}
      {isLoop && max > 0 && (
        <span className="sp-row__beads" aria-label={`Iteration ${active.iteration} of ${max}`}>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className={`sp-row__bead ${i < active.iteration ? 'sp-row__bead--on' : ''}`} aria-hidden />
          ))}
        </span>
      )}
      <label className="sp-row__switch">
        <input
          type="checkbox"
          checked={active.enabled}
          onChange={(e) => void setSpellEnabled(sessionId, active.spellId, e.target.checked)}
          aria-label={`Toggle ${name}`}
        />
        <span aria-hidden>{active.enabled ? 'on' : 'off'}</span>
      </label>
      {isLoop && (
        <button
          type="button"
          className="sp-row__reset"
          onClick={() => void resetIteration(sessionId, active.spellId)}
          aria-label="Reset loop"
        >↻</button>
      )}
      <button
        type="button"
        className="sp-row__remove"
        onClick={() => void removeActiveSpell(sessionId, active.spellId)}
        aria-label={`Deactivate ${name}`}
      >×</button>
    </div>
  );
});
