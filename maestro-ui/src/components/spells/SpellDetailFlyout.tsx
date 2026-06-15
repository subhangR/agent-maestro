import React, { useEffect, useRef, useState } from 'react';
import { useSpellLibraryStore } from '../../stores/useSpellLibraryStore';
import { useSpellActivationStore } from '../../stores/useSpellActivationStore';
import type { Spell } from '../../app/types/maestro';

export interface SpellDetailFlyoutProps {
  spellId: string;
  /** flyout = inspect (non-modal, click-outside), modal = edit (CustomSpellEditor). */
  mode?: 'flyout' | 'modal';
  /** Hide cast/edit buttons (e.g. when used as a launcher preview). */
  embedded?: boolean;
  anchorTo?: 'workspace' | 'cast-sheet' | 'spellbook';
  onClose?: () => void;
  onEdit?: () => void;
  onCast?: (target?: string[]) => void;
  onDelete?: () => void;
}

/**
 * SpellDetailFlyout — non-modal 360px side flyout (03 §2).
 * When `mode === 'modal'`, wraps the CustomSpellEditor instead.
 */
export const SpellDetailFlyout = React.memo(function SpellDetailFlyout({
  spellId,
  mode = 'flyout',
  embedded = false,
  anchorTo = 'workspace',
  onClose,
  onEdit,
  onCast,
  onDelete,
}: SpellDetailFlyoutProps) {
  const spell = useSpellLibraryStore((s) => s.spellById(spellId));
  const casting = useSpellActivationStore((s) => s.casting);
  const ref = useRef<HTMLDivElement | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Click-outside dismiss (non-modal).
  useEffect(() => {
    if (embedded) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose?.();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [embedded, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  if (!spell) {
    return (
      <aside ref={ref} className="sp-detail" role="dialog" aria-modal={mode === 'modal'} aria-label="Spell details">
        <p>Spell not found.</p>
        {onClose && <button type="button" onClick={onClose}>Close</button>}
      </aside>
    );
  }

  return (
    <aside
      ref={ref}
      className={`sp-detail sp-detail--${mode} sp-detail--anchor-${anchorTo}`}
      role="dialog"
      aria-modal={mode === 'modal'}
      aria-label={`Spell details: ${spell.name}`}
      data-spell-color={spell.color}
    >
      <header className="sp-detail__header">
        <span className="sp-detail__icon" aria-hidden>{spell.icon ?? '✦'}</span>
        <h3 className="sp-detail__title">{spell.name}</h3>
        <button
          type="button"
          className="sp-detail__menu-btn"
          onClick={() => setShowMenu((v) => !v)}
          aria-expanded={showMenu}
          aria-label="More actions"
        >⋮</button>
        {onClose && (
          <button type="button" className="sp-detail__close" onClick={onClose} aria-label="Close">✕</button>
        )}
      </header>

      <p className="sp-detail__desc">{spell.description}</p>

      <dl className="sp-detail__props">
        <dt>Action</dt><dd>{spell.action}</dd>
        {spell.trigger && (
          <>
            <dt>Trigger</dt>
            <dd>{spell.trigger.hookEvent}{spell.trigger.matcher ? ` (${spell.trigger.matcher})` : ''}</dd>
          </>
        )}
        {spell.loopType && spell.loopType !== 'single-shot' && (
          <>
            <dt>Loop</dt><dd>{spell.loopType}</dd>
          </>
        )}
        {spell.maxIterations != null && (
          <>
            <dt>Max iterations</dt><dd>{spell.maxIterations}</dd>
          </>
        )}
        {spell.failMode && (
          <>
            <dt>Fail mode</dt><dd>{spell.failMode}</dd>
          </>
        )}
        <dt>Color</dt><dd><span className={`sp-detail__swatch sp-detail__swatch--${spell.color}`} aria-hidden /> {spell.color}</dd>
        {spell.skillRef && (
          <>
            <dt>Skill ref</dt><dd>{spell.skillRef}</dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{spell.isDefault ? 'default · seed' : 'custom'}</dd>
      </dl>

      {!embedded && (
        <div className="sp-detail__actions">
          {onCast && (
            <button
              type="button"
              className="sp-detail__cta"
              disabled={casting}
              onClick={() => onCast?.()}
            >Cast on session</button>
          )}
          {onEdit && !spell.isDefault && (
            <button type="button" onClick={onEdit}>Edit</button>
          )}
          {onDelete && !spell.isDefault && (
            <button type="button" className="sp-detail__delete" onClick={onDelete}>Delete</button>
          )}
        </div>
      )}

      {showMenu && (
        <div className="sp-detail__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setShowMenu(false); navigator.clipboard?.writeText(JSON.stringify(spell, null, 2)).catch(() => {}); }}>Export JSON</button>
          {onEdit && !spell.isDefault && (
            <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onEdit?.(); }}>Duplicate to edit</button>
          )}
          {onDelete && !spell.isDefault && (
            <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onDelete?.(); }}>Delete</button>
          )}
        </div>
      )}

      {!promptExpanded && spell.description.length > 240 && (
        <button type="button" className="sp-detail__expand" onClick={() => setPromptExpanded(true)}>
          Show more
        </button>
      )}
    </aside>
  );
});

/** Standalone shared body — useful for embedding inside the CustomSpellEditor. */
export function SpellDetailsView({ spell }: { spell: Spell }) {
  return (
    <SpellDetailFlyout spellId={spell.id} embedded />
  );
}
