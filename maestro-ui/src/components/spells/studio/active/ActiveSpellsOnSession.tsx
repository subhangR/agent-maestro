import React from 'react';
import { useActiveSpellsForSession } from '../../../../stores/useActiveSpellsStore';
import { useSpellbookStore } from '../../../../stores/useSpellbookStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { ActiveSpellChip } from './ActiveSpellChip';
import '../../../../styles-spell-active.css';

export interface ActiveSpellsOnSessionProps {
  sessionId: string;
  /**
   * Layout variant:
   * - `strip` (default): inline horizontal chip strip (header / tile footer),
   *   overflow collapses to a "+N" pill that opens the Spellbook scoped here.
   * - `popover`: compact vertical list (ring popover) — every chip shown.
   * - `detail`: full list for a session-detail panel — every chip shown.
   */
  anchor?: 'strip' | 'popover' | 'detail';
  /** Show the "＋ Cast" affordance (default true for strip/detail). */
  showCast?: boolean;
  /** Invoked to open A's cast launcher for this session. */
  onCast?: (sessionId: string) => void;
}

/** How many chips a `strip` shows before collapsing the rest into "+N". */
const STRIP_CAP = 4;

/**
 * ActiveSpellsOnSession (S5) — the at-a-glance + on-demand list of spells live
 * on one session, with per-spell manage actions. Real-time via the active-spells
 * store; degrades to a stale-safe view when the WebSocket is down (never lies
 * about liveness — FR-11.2, 03 §B "disconnected").
 */
export const ActiveSpellsOnSession = React.memo(function ActiveSpellsOnSession({
  sessionId,
  anchor = 'strip',
  showCast,
  onCast,
}: ActiveSpellsOnSessionProps) {
  const actives = useActiveSpellsForSession(sessionId);
  const connected = useMaestroStore((s) => s.wsConnected);
  const openSpellbook = useSpellbookStore((s) => s.openSpellbook);

  const stale = !connected;
  const wantCast = showCast ?? anchor !== 'popover';
  const viewInSpellbook = (sid: string) => openSpellbook({ scrollToSessionId: sid });

  const castButton = wantCast && onCast ? (
    <button
      type="button"
      className="spa-strip__cast"
      onClick={() => onCast(sessionId)}
      aria-label="Cast a spell on this session"
    >
      <span aria-hidden>✦</span> Cast
    </button>
  ) : null;

  // Empty — offer a first-cast affordance in strip/detail; nothing in popover.
  if (actives.length === 0) {
    if (!castButton) return null;
    return (
      <div className={`spa-strip spa-strip--${anchor} spa-strip--empty`}>
        {stale && <StaleBadge />}
        {castButton}
      </div>
    );
  }

  const collapse = anchor === 'strip' && actives.length > STRIP_CAP;
  const shown = collapse ? actives.slice(0, STRIP_CAP) : actives;
  const overflow = collapse ? actives.length - STRIP_CAP : 0;

  return (
    <div
      className={`spa-strip spa-strip--${anchor}${stale ? ' spa-strip--stale' : ''}`}
      role="group"
      aria-label={`${actives.length} active ${actives.length === 1 ? 'spell' : 'spells'} on this session`}
    >
      {stale && <StaleBadge />}
      {shown.map((a) => (
        <ActiveSpellChip
          key={`${sessionId}:${a.spellId}`}
          sessionId={sessionId}
          active={a}
          stale={stale}
          onViewInSpellbook={viewInSpellbook}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          className="spa-strip__overflow"
          onClick={() => openSpellbook({ scrollToSessionId: sessionId })}
          aria-label={`${overflow} more active ${overflow === 1 ? 'spell' : 'spells'} — open Spellbook`}
        >
          +{overflow}
        </button>
      )}
      {castButton}
    </div>
  );
});

/** Small, honest "reconnecting" marker so the strip never implies fresh state. */
function StaleBadge() {
  return (
    <span className="spa-strip__stale" role="status" aria-live="polite" title="Live updates paused — reconnecting">
      <span className="spa-strip__stale-dot" aria-hidden />
      stale
    </span>
  );
}
