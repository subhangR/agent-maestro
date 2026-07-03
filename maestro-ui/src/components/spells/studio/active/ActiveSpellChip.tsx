import React, { useState } from 'react';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../../../stores/useSpellActivationStore';
import { useActiveSpellsStore, type ActiveSpellView } from '../../../../stores/useActiveSpellsStore';
import { loopRules, loopProgress } from '../../../../utils/spellSummary';
import { ActiveSpellChipMenu } from './ActiveSpellChipMenu';

export interface ActiveSpellChipProps {
  sessionId: string;
  active: ActiveSpellView;
  /** Live connection health — a stale (disconnected) chip is visually muted. */
  stale?: boolean;
  onViewInSpellbook: (sessionId: string) => void;
}

/**
 * ActiveSpellChip — one live spell on a session (S5). Shows name, color dot,
 * loop progress "x/y", paused badge when disabled; kebab/right-click opens the
 * manage menu (enable/disable, reset-loop via the REAL endpoint, deactivate).
 */
export const ActiveSpellChip = React.memo(function ActiveSpellChip({
  sessionId,
  active,
  stale,
  onViewInSpellbook,
}: ActiveSpellChipProps) {
  const spell = useSpellLibraryStore((s) => s.spellById(active.spellId));
  const removeActiveSpell = useSpellActivationStore((s) => s.removeActiveSpell);
  const setSpellEnabled = useSpellActivationStore((s) => s.setSpellEnabled);
  const resetLoop = useActiveSpellsStore((s) => s.resetLoop);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = spell?.name ?? active.spellName;
  const loops = loopRules(spell);
  const isLoop = loops.length > 0;
  const { current, max } = loopProgress(spell, active.ruleIterations);
  const iterText = isLoop && max > 0 ? `${current}/${max}` : '';

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
    <span
      className={`spa-chip${active.enabled ? '' : ' spa-chip--paused'}${stale ? ' spa-chip--stale' : ''}${busy ? ' spa-chip--busy' : ''}`}
      data-spell-color={active.colorId}
      title={error ?? undefined}
      aria-label={
        `${name} — ${active.enabled ? 'active' : 'disabled'}` +
        (iterText ? `, loop ${current} of ${max}` : '') +
        (stale ? ' (state may be stale — reconnecting)' : '')
      }
    >
      <span className="spa-chip__dot" aria-hidden />
      <span className="spa-chip__name">{name}</span>
      {iterText && (
        <span className="spa-chip__iter" aria-hidden>
          <span className="spa-chip__iter-icon">↻</span>{iterText}
        </span>
      )}
      {!active.enabled && <span className="spa-chip__paused" aria-hidden>paused</span>}
      <button
        type="button"
        className="spa-chip__kebab"
        aria-label={`Manage ${name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      >⋮</button>
      <ActiveSpellChipMenu
        open={menuOpen}
        isLoop={isLoop}
        enabled={active.enabled}
        busy={busy}
        onResetLoop={isLoop ? () => void run(() => resetLoop({ maestroSessionId: sessionId, spellId: active.spellId })) : undefined}
        onToggleEnabled={() => void run(() => setSpellEnabled(sessionId, active.spellId, !active.enabled))}
        onDeactivate={() => void run(() => removeActiveSpell(sessionId, active.spellId))}
        onViewInSpellbook={() => onViewInSpellbook(sessionId)}
        onClose={() => setMenuOpen(false)}
      />
    </span>
  );
});
