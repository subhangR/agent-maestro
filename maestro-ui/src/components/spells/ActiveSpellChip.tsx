import React, { useState } from 'react';
import { useSpellLibraryStore } from '../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';
import { ActiveSpellChipMenu } from './ActiveSpellChipMenu';
import { loopRules, loopProgress } from '../../utils/spellSummary';
import type { ActiveSpellView } from '../../stores/useActiveSpellsStore';

export interface ActiveSpellChipProps {
  sessionId: string;
  active: ActiveSpellView;
  onViewInSpellbook: (sessionId: string) => void;
  onEditTrigger: (spellId: string) => void;
}

/** ActiveSpellChip — compact chip surface 1/2/3 (03 §3.6). */
export const ActiveSpellChip = React.memo(function ActiveSpellChip({
  sessionId,
  active,
  onViewInSpellbook,
  onEditTrigger,
}: ActiveSpellChipProps) {
  const spell = useSpellLibraryStore((s) => s.spellById(active.spellId));
  const removeActiveSpell = useSpellActivationStore((s) => s.removeActiveSpell);
  const resetIteration = useSpellActivationStore((s) => s.resetIteration);
  const openLauncher = useSpellLauncherStore((s) => s.openLauncher);
  const [menuOpen, setMenuOpen] = useState(false);

  const name = spell?.name ?? active.spellName;
  const isLoop = loopRules(spell).length > 0;
  const { current, max } = loopProgress(spell, active.ruleIterations);
  const iterText = isLoop && max > 0 ? `${current}/${max}` : '';

  return (
    <span
      className={`sp-chip ${active.enabled ? '' : 'sp-chip--paused'}`}
      data-spell-color={active.colorId}
      role="button"
      tabIndex={0}
      aria-label={`${name} — active. Press to toggle.`}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      onClick={() => onEditTrigger(active.spellId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEditTrigger(active.spellId);
        }
      }}
    >
      <span className="sp-chip__dot" aria-hidden />
      <span className="sp-chip__name">{name}</span>
      {iterText && <span className="sp-chip__iter">{iterText}</span>}
      {!active.enabled && <span className="sp-chip__paused" aria-hidden>⏸</span>}
      <button
        type="button"
        className="sp-chip__kebab"
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        aria-label="Chip menu"
      >⋮</button>
      <ActiveSpellChipMenu
        open={menuOpen}
        isLoop={Boolean(isLoop)}
        onResetLoop={isLoop ? () => void resetIteration(sessionId, active.spellId) : undefined}
        onDeactivate={() => void removeActiveSpell(sessionId, active.spellId)}
        onViewInSpellbook={() => onViewInSpellbook(sessionId)}
        onEditTrigger={() => {
          openLauncher({
            source: 'session-tile',
            targetSessionIds: [sessionId],
            preselectSpellId: active.spellId,
          });
        }}
        onClose={() => setMenuOpen(false)}
      />
    </span>
  );
});
