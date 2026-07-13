import React from 'react';
import type { SpellColorSlug } from '../../../../app/types/maestro';
import { SPELL_COLOR_SWATCHES } from './editorState';

interface Props {
  value: SpellColorSlug;
  onChange: (c: SpellColorSlug) => void;
  disabled?: boolean;
}

/** The 9-slug identity color picker (doc 02 §Colors). */
export const ColorSwatchPicker = React.memo(function ColorSwatchPicker({
  value, onChange, disabled,
}: Props) {
  return (
    <div className="spe-swatches" role="radiogroup" aria-label="Spell color">
      {SPELL_COLOR_SWATCHES.map(({ slug, hex, label }) => {
        const active = value === slug;
        return (
          <button
            key={slug}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            disabled={disabled}
            className={`spe-swatch${active ? ' spe-swatch--active' : ''}`}
            style={{ ['--spe-swatch-color' as string]: hex }}
            onClick={() => onChange(slug)}
          >
            {active && <span className="spe-swatch__tick" aria-hidden>✓</span>}
          </button>
        );
      })}
    </div>
  );
});
