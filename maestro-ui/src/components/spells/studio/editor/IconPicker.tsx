import React, { useState } from 'react';
import { ICON_PALETTE, SPELL_LIMITS } from './editorState';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}

/** Emoji icon picker — a curated palette plus a free-text escape hatch. */
export const IconPicker = React.memo(function IconPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="spe-icon">
      <button
        type="button"
        className="spe-icon__preview"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Choose icon"
        onClick={() => setOpen((o) => !o)}
      >
        {value.trim() || '✦'}
      </button>
      <input
        type="text"
        className="spe-icon__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={SPELL_LIMITS.icon}
        aria-label="Icon (emoji)"
        placeholder="✦"
      />
      {open && !disabled && (
        <div className="spe-icon__palette" role="listbox" aria-label="Icon palette">
          {ICON_PALETTE.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="option"
              aria-selected={value === emoji}
              className={`spe-icon__opt${value === emoji ? ' spe-icon__opt--active' : ''}`}
              onClick={() => { onChange(emoji); setOpen(false); }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
