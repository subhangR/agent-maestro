import React from 'react';

export type CastMode = 'single' | 'broadcast' | 'coordinate';

export interface CastModeToggleProps {
  mode: CastMode;
  onChange: (mode: CastMode) => void;
  /** When true, only Single is allowed (single target). */
  disableMulti?: boolean;
  helper?: string;
}

/** CastModeToggle — segmented control for cast mode (03 §1.9). */
export const CastModeToggle = React.memo(function CastModeToggle({
  mode,
  onChange,
  disableMulti = false,
  helper,
}: CastModeToggleProps) {
  return (
    <div className="sp-cast-mode" role="radiogroup" aria-label="Cast mode">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'single'}
        className={`sp-cast-mode__btn ${mode === 'single' ? 'sp-cast-mode__btn--active' : ''}`}
        onClick={() => onChange('single')}
      >
        Single
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'broadcast'}
        disabled={disableMulti}
        className={`sp-cast-mode__btn ${mode === 'broadcast' ? 'sp-cast-mode__btn--active' : ''}`}
        onClick={() => onChange('broadcast')}
      >
        Broadcast
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'coordinate'}
        disabled={disableMulti}
        className={`sp-cast-mode__btn ${mode === 'coordinate' ? 'sp-cast-mode__btn--active' : ''}`}
        onClick={() => onChange('coordinate')}
      >
        Coordinate
      </button>
      {helper && <p className="sp-cast-mode__helper">{helper}</p>}
    </div>
  );
});
