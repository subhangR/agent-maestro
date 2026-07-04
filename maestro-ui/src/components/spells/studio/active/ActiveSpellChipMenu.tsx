import React, { useEffect, useRef } from 'react';

export interface ActiveSpellChipMenuProps {
  open: boolean;
  isLoop: boolean;
  enabled: boolean;
  busy?: boolean;
  onResetLoop?: () => void;
  onToggleEnabled: () => void;
  onDeactivate: () => void;
  onViewInSpellbook: () => void;
  onClose: () => void;
}

/**
 * Quick-menu for a single active spell chip (S5, FR-6.3/6.4/6.6). Opened by the
 * kebab or right-click. Dismisses on outside-click / Escape.
 */
export const ActiveSpellChipMenu = React.memo(function ActiveSpellChipMenu({
  open,
  isLoop,
  enabled,
  busy,
  onResetLoop,
  onToggleEnabled,
  onDeactivate,
  onViewInSpellbook,
  onClose,
}: ActiveSpellChipMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="spa-chip-menu" role="menu">
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => { onToggleEnabled(); onClose(); }}
      >
        {enabled ? 'Disable' : 'Enable'}
      </button>
      {isLoop && onResetLoop && (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => { onResetLoop(); onClose(); }}
        >
          Reset loop
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => { onViewInSpellbook(); onClose(); }}
      >
        View in Spellbook
      </button>
      <button
        type="button"
        role="menuitem"
        className="spa-chip-menu__danger"
        disabled={busy}
        onClick={() => { onDeactivate(); onClose(); }}
      >
        Deactivate
      </button>
    </div>
  );
});
