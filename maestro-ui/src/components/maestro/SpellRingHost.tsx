import React, { useMemo } from 'react';
import { spellRingAttrs, type RingSpec } from '../../utils/spellRings';

/**
 * Generic wrapper that renders concentric spell rings on its host element.
 * Spreads `spellRingAttrs(rings)` onto the host (style + data attrs), composes
 * `.spell-ring` with any existing className, and mounts the `+N` overflow pill
 * when more spells are active than RING_CAP.
 *
 * Use `<SpellRingHost as="button" rings={...} className="pn-srail-s">…</SpellRingHost>`
 * to host on a non-div element (button, span, etc.). Default is `<div>`.
 *
 * Source of truth: docs/spell-system-design/UI_SPEC.md §7.
 */
export interface SpellRingHostProps extends React.HTMLAttributes<HTMLElement> {
  rings: ReadonlyArray<RingSpec>;
  /** Underlying tag — defaults to 'div'. Use 'button' for the spaces rail. */
  as?: keyof React.JSX.IntrinsicElements;
  /**
   * Optional click handler for the +N overflow pill. Receives the overflow
   * count. When omitted the pill is non-interactive (no popover).
   */
  onOverflowClick?: (overflow: number) => void;
  /** Optional aria label for the overflow pill (defaults to "Show N more spells"). */
  overflowAriaLabel?: string;
  children?: React.ReactNode;
}

export const SpellRingHost = React.forwardRef<HTMLElement, SpellRingHostProps>(function SpellRingHost(
  { rings, as = 'div', className, style, children, onOverflowClick, overflowAriaLabel, ...rest },
  ref,
) {
  const attrs = useMemo(() => spellRingAttrs(rings), [rings]);
  const hasRings = attrs['data-spell-rings'] > 0;
  const overflow = attrs['data-spell-ring-overflow'] ?? 0;

  const mergedClassName = hasRings
    ? (className ? `${className} spell-ring` : 'spell-ring')
    : className;
  const mergedStyle: React.CSSProperties = { ...attrs.style, ...style };

  // When there are no rings we still mount the host element with the original
  // props so this wrapper is a no-op visual passthrough. The data-* attrs are
  // omitted to keep the DOM clean for downstream e2e selectors.
  const dataAttrs: Record<string, string | number> = {};
  if (hasRings) {
    dataAttrs['data-spell-rings'] = attrs['data-spell-rings'];
    dataAttrs['data-spell-ring-names'] = attrs['data-spell-ring-names'];
    if (overflow > 0) dataAttrs['data-spell-ring-overflow'] = overflow;
  }

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref as React.Ref<any>}
      className={mergedClassName}
      style={mergedStyle}
      {...dataAttrs}
      {...rest}
    >
      {children}
      {overflow > 0 && (
        <button
          type="button"
          className="spell-ring__overflow"
          aria-label={overflowAriaLabel ?? `Show ${overflow} more spells`}
          onClick={onOverflowClick ? (e) => { e.stopPropagation(); onOverflowClick(overflow); } : undefined}
          tabIndex={onOverflowClick ? 0 : -1}
        >
          +{overflow}
        </button>
      )}
    </Tag>
  );
});
