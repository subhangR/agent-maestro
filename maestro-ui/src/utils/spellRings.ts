/**
 * Concentric spell-ring helpers — see docs/spell-system-design/UI_SPEC.md §7
 * (CANONICAL Ring contract) and uispec/01-design-system.md §2 for the
 * full mechanism + composition rules.
 *
 * `spellRingAttrs(rings)` returns the inline `style` + data attrs to spread
 * onto a host element (`.pn-st`, `.pn-srail-s`, `.terminalContainer`).
 * `spellRingStyle()` is a style-only convenience for non-host callers.
 */

import type { CSSProperties } from 'react';
import type { SpellColorId } from '../app/constants/spellColors';

export const RING_CAP = 4;
const RING_W = 1; // px, stroke width per ring
const RING_GAP = 2; // px, gap between adjacent strokes (host CSS may override per host)

export interface RingSpec {
  /** Stable identity of the spell — used for the data-spell-ring-names attr. */
  spellName: string;
  /** UI palette id — drives the ring stroke. */
  colorId: SpellColorId;
  /** When set, signals an ensemble member; outermost ring uses the ensemble's color. */
  ensembleId?: string;
  /** REQUIRED when ensembleId is set: the ensemble's own palette color id. */
  ensembleColorId?: SpellColorId;
}

export interface SpellRingAttrs {
  style: CSSProperties;
  /** Count actually painted (1-RING_CAP); 0 means no `.spell-ring` class needed. */
  'data-spell-rings': number;
  /** CSV of visible names, with trailing "+N" when overflowing. */
  'data-spell-ring-names': string;
  /** Present only when rings.length > RING_CAP. */
  'data-spell-ring-overflow'?: number;
}

/**
 * Build the inline style + data attrs for a ringed host.
 *
 * Contract (frozen — UI_SPEC §7):
 *   - First RING_CAP (4) rings are painted, outside-in (index 0 = outermost).
 *   - Stroke color picks based on STACK DEPTH:
 *       depth === 1                  → `primary` (100%)
 *       depth   > 1 && ring K === 1  → `primary` (100%) — outermost reads full-strength
 *       depth   > 1 && ring K  >  1  → `border` (42%)
 *   - Ensemble members: the OUTERMOST ring resolves to ensembleColorId at full saturation.
 *   - Ring 4 KEEPS its own spell color even when rings.length > RING_CAP — the
 *     overflow signal is the "+N" pill, never a stripped identity.
 */
export function spellRingAttrs(rings: ReadonlyArray<RingSpec>): SpellRingAttrs {
  const visible = rings.slice(0, RING_CAP);
  const overflow = Math.max(0, rings.length - RING_CAP);
  const style: Record<string, string> = {};

  visible.forEach((r, i) => {
    const k = i + 1;
    // Cumulative width — ring K's `inset 0 0 0 width` paints out to `width` px;
    // adjacent layers compose so the visible band on ring K is K * (W) + (K-1) * GAP.
    // Concretely with W=1, GAP=2: widths are 1, 4, 7, 10 px. Host CSS may widen
    // via --spell-ring-K-w override.
    const width = k * (RING_W + RING_GAP) - RING_GAP;
    const isOutermost = k === 1;
    const effectiveColorId: SpellColorId =
      isOutermost && r.ensembleId ? (r.ensembleColorId ?? r.colorId) : r.colorId;
    const useFullAlpha = visible.length === 1 || isOutermost || Boolean(r.ensembleId);
    const stroke = useFullAlpha
      ? `var(--spell-${effectiveColorId}-primary)`
      : `var(--spell-${effectiveColorId}-border)`;
    style[`--spell-ring-${k}`] = stroke;
    style[`--spell-ring-${k}-rgb`] = `var(--spell-${effectiveColorId}-primary-rgb)`;
    style[`--spell-ring-${k}-w`] = `${width}px`;
  });

  const names = visible.map(r => r.spellName);
  const ringNames = overflow > 0 ? [...names, `+${overflow}`].join(',') : names.join(',');

  const attrs: SpellRingAttrs = {
    style: style as CSSProperties,
    'data-spell-rings': visible.length,
    'data-spell-ring-names': ringNames,
  };
  if (overflow > 0) attrs['data-spell-ring-overflow'] = overflow;
  return attrs;
}

/** Style-only convenience wrapper. */
export function spellRingStyle(rings: ReadonlyArray<RingSpec>): CSSProperties {
  return spellRingAttrs(rings).style;
}
