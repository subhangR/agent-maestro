import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useActiveSpellsStore } from '../../../../stores/useActiveSpellsStore';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { SpellbookActiveRow } from './SpellbookActiveRow';
import '../../../../styles-spell-active.css';

export interface SpellbookDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Scroll to (and highlight) this session's group on open. */
  scrollToSessionId?: string;
  /** Jump to a session in the workspace — wired by the shell (A). */
  onJumpToSession?: (sessionId: string) => void;
}

/**
 * SpellbookDrawer (S6) — project-wide view of every active spell across all
 * sessions, grouped by session, with the same manage actions as S5 plus
 * jump-to-session. States: loading / error / empty / populated / disconnected.
 */
export const SpellbookDrawer = React.memo(function SpellbookDrawer({
  isOpen,
  onClose,
  scrollToSessionId,
  onJumpToSession,
}: SpellbookDrawerProps) {
  const byMaestroSessionId = useActiveSpellsStore((s) => s.byMaestroSessionId);
  const sessions = useMaestroStore((s) => s.sessions);
  const connected = useMaestroStore((s) => s.wsConnected);
  const libLoading = useSpellLibraryStore((s) => s.loading);
  const libError = useSpellLibraryStore((s) => s.error);
  const fetchSpells = useSpellLibraryStore((s) => s.fetchSpells);

  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && scrollToSessionId && targetRef.current) {
      targetRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isOpen, scrollToSessionId, byMaestroSessionId]);

  const groups = useMemo(() => {
    return Object.entries(byMaestroSessionId)
      .map(([sid, list]) => ({ sessionId: sid, session: sessions[sid] ?? null, spells: list }))
      .filter((g) => g.spells.length > 0)
      .sort((a, b) => (a.session?.name ?? a.sessionId).localeCompare(b.session?.name ?? b.sessionId));
  }, [byMaestroSessionId, sessions]);

  const totalActive = groups.reduce((n, g) => n + g.spells.length, 0);

  if (!isOpen) return null;

  const node = (
    <div className="spa-book__backdrop" onClick={onClose} role="presentation">
      <aside
        className="spa-book"
        role="dialog"
        aria-modal="false"
        aria-label="Spellbook — active spells across all sessions"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="spa-book__header">
          <h3 className="spa-book__title">Spellbook</h3>
          {totalActive > 0 && (
            <span className="spa-book__count">{totalActive} active · {groups.length} {groups.length === 1 ? 'session' : 'sessions'}</span>
          )}
          <button type="button" className="spa-book__close" onClick={onClose} aria-label="Close Spellbook">✕</button>
        </header>

        {!connected && (
          <div className="spa-book__banner spa-book__banner--warn" role="status">
            Live updates paused — reconnecting. State below may be stale.
          </div>
        )}

        <div className="spa-book__body">
          {libError ? (
            <div className="spa-book__state spa-book__state--error" role="alert">
              <p>Couldn’t load spell details.</p>
              <p className="spa-book__state-detail">{libError}</p>
              <button type="button" onClick={() => void fetchSpells()}>Retry</button>
            </div>
          ) : groups.length === 0 && libLoading ? (
            <div className="spa-book__state" aria-busy="true">
              <p>Loading…</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="spa-book__state spa-book__state--empty">
              <p className="spa-book__empty-title">No active spells</p>
              <p className="spa-book__state-detail">
                Nothing is running across your sessions right now. Cast a spell from the library or a
                session to see it here.
              </p>
            </div>
          ) : (
            groups.map((g) => {
              const isTarget = g.sessionId === scrollToSessionId;
              return (
                <section
                  key={g.sessionId}
                  ref={isTarget ? (el) => { targetRef.current = el; } : undefined}
                  className={`spa-book__group${isTarget ? ' spa-book__group--target' : ''}`}
                  aria-current={isTarget ? 'true' : undefined}
                >
                  <header className="spa-book__group-head">
                    <h4 className="spa-book__group-title">{g.session?.name ?? g.sessionId}</h4>
                    <span className="spa-book__group-count">{g.spells.length}</span>
                    {onJumpToSession && (
                      <button
                        type="button"
                        className="spa-book__jump"
                        onClick={() => onJumpToSession(g.sessionId)}
                        aria-label={`Jump to ${g.session?.name ?? g.sessionId}`}
                      >Open ↗</button>
                    )}
                  </header>
                  <div className="spa-book__rows">
                    {g.spells.map((a) => (
                      <SpellbookActiveRow key={a.spellId} sessionId={g.sessionId} active={a} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );

  return createPortal(node, document.body);
});
