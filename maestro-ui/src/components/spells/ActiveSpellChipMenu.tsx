import React, { useEffect, useRef } from 'react';

export interface ActiveSpellChipMenuProps {
  open: boolean;
  isLoop: boolean;
  enabled: boolean;
  onToggle: () => void;
  onResetLoop?: () => void;
  onDeactivate: () => void;
  onViewInSpellbook: () => void;
  onEditTrigger: () => void;
  onClose: () => void;
}

/** Right-click / kebab quick-menu on any ActiveSpellChip (03 §3.4.1). */
export const ActiveSpellChipMenu = React.memo(function ActiveSpellChipMenu({
  open,
  isLoop,
  enabled,
  onToggle,
  onResetLoop,
  onDeactivate,
  onViewInSpellbook,
  onEditTrigger,
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
    <div ref={ref} className="sp-chip-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { onToggle(); onClose(); }}>
        {enabled ? 'Pause' : 'Resume'}
      </button>
      {isLoop && onResetLoop && (
        <button type="button" role="menuitem" onClick={() => { onResetLoop(); onClose(); }}>
          Reset loop
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => { onDeactivate(); onClose(); }}>
        Deactivate
      </button>
      <button type="button" role="menuitem" onClick={() => { onViewInSpellbook(); onClose(); }}>
        View in Spellbook
      </button>
      <button type="button" role="menuitem" onClick={() => { onEditTrigger(); onClose(); }}>
        Edit trigger
      </button>
    </div>
  );
});
