/**
 * Cast-pulse JS class toggle for ringed hosts (01 §4.1).
 *
 * When a `spell:activated` event lands for a session, the ring host briefly
 * flashes `.spell-ring--just-cast` to confirm the cast. The pulse is gated by
 * `prefers-reduced-motion`. See `styles-spells.css` → `@keyframes spell-cast-pulse`.
 *
 * Mechanism: a tiny zustand store records the most-recent activation timestamp
 * per maestroSessionId. The hook below returns a boolean for whether the host
 * for `sessionId` is within the pulse window (~PULSE_MS). Hosts spread the
 * returned className onto the ring element.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';

const PULSE_MS = 700;

interface CastPulseState {
  lastCastAtBySessionId: Record<string, number>;
  markCast: (sessionId: string, at?: number) => void;
}

export const useSpellCastPulseStore = create<CastPulseState>((set) => ({
  lastCastAtBySessionId: {},
  markCast: (sessionId, at) => set((s) => ({
    lastCastAtBySessionId: { ...s.lastCastAtBySessionId, [sessionId]: at ?? Date.now() },
  })),
}));

/** Honour the OS reduced-motion preference; recompute when it changes. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Returns true while a spell-cast pulse should be applied to the ring host
 * for `sessionId`. Self-resets after PULSE_MS. No-op when reduced motion is on.
 */
export function useSpellCastPulse(sessionId: string | null | undefined): boolean {
  const lastCastAt = useSpellCastPulseStore((s) =>
    sessionId ? s.lastCastAtBySessionId[sessionId] : undefined,
  );
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!sessionId || !lastCastAt) return;
    if (prefersReducedMotion()) return;
    const elapsed = Date.now() - lastCastAt;
    if (elapsed >= PULSE_MS) return;
    setActive(true);
    const t = window.setTimeout(() => setActive(false), PULSE_MS - elapsed);
    return () => window.clearTimeout(t);
  }, [sessionId, lastCastAt]);

  return active;
}
