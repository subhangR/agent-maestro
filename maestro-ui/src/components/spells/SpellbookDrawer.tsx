import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ActiveSpellsPanel } from './ActiveSpellsPanel';

export interface SpellbookDrawerProps {
  isOpen: boolean;
  scrollToSessionId?: string;
  onClose: () => void;
}

/** SpellbookDrawer — project-wide active spell manager (03 §3.5). */
export const SpellbookDrawer = React.memo(function SpellbookDrawer({
  isOpen,
  scrollToSessionId,
  onClose,
}: SpellbookDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const node = (
    <div className="sp-spellbook__backdrop" onClick={onClose} role="presentation">
      <aside
        className="sp-spellbook"
        role="dialog"
        aria-modal="false"
        aria-label="Spellbook"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-spellbook__header">
          <h3>Spellbook</h3>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <ActiveSpellsPanel anchor="spellbook" scrollToSessionId={scrollToSessionId} />
      </aside>
    </div>
  );

  return createPortal(node, document.body);
});
