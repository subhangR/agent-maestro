import React from 'react';
import { resolveSpellColorId } from '../../app/constants/spellColors';
import type { Spell } from '../../app/types/maestro';

export interface SpellCardProps {
  spell: Spell;
  isFocused: boolean;
  isSelected: boolean;
  onFocus: () => void;
  onActivate: () => void;
  density?: 'comfortable' | 'compact';
}

/** SpellCard — color tile rail + glyph + name + description + chips (03 §1.7). */
export const SpellCard = React.memo(function SpellCard({
  spell,
  isFocused,
  isSelected,
  onFocus,
  onActivate,
  density = 'comfortable',
}: SpellCardProps) {
  const colorId = resolveSpellColorId(spell.color);
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      aria-label={`${spell.name} — ${spell.action}`}
      data-spell-id={spell.id}
      data-focused={isFocused || undefined}
      className={`sp-card ${density === 'compact' ? 'sp-card--compact' : ''}`}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={onActivate}
      style={{
        ['--sp-card-color' as any]: `var(--spell-${colorId}-primary)`,
        ['--sp-card-dim' as any]: `var(--spell-${colorId}-dim)`,
        ['--sp-card-border' as any]: `var(--spell-${colorId}-border)`,
      }}
    >
      <span className="sp-card__rail" aria-hidden />
      <span className="sp-card__icon" aria-hidden>{spell.icon ?? '✦'}</span>
      <span className="sp-card__body">
        <span className="sp-card__name">{spell.name}</span>
        <span className="sp-card__desc">{spell.description}</span>
        <span className="sp-card__chips">
          <span className="sp-card__chip">{spell.action}</span>
          {spell.loopType && spell.loopType !== 'single-shot' && (
            <span className="sp-card__chip">{spell.loopType}</span>
          )}
          {spell.trigger?.hookEvent && (
            <span className="sp-card__chip sp-card__chip--trigger">🪝 {spell.trigger.hookEvent}</span>
          )}
        </span>
      </span>
    </button>
  );
});
