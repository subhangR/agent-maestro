import React, { useMemo } from 'react';
import { useActiveSpellsForSession } from '../../stores/useActiveSpellsStore';
import { useEnsembleStore } from '../../stores/useEnsembleStore';
import { spellRingAttrs, type RingSpec } from '../../utils/spellRings';
import { resolveSpellColorId } from '../../app/constants/spellColors';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';

export interface SpellRingHostProps {
  sessionId: string;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  interactive?: boolean;
  /** Called when the user clicks the "+N" overflow pill. Defaults to opening
   *  the Spellbook drawer scoped to this session (handled by the parent). */
  onOverflowClick?: () => void;
}

/**
 * SpellRingHost — React wrapper that subscribes to enabled active spells for a
 * session, resolves ensemble colors, and spreads the canonical
 * `spellRingAttrs()` payload onto its host element (03 §4.2 / UI_SPEC §7).
 */
export const SpellRingHost = React.memo(function SpellRingHost({
  sessionId,
  className,
  style,
  children,
  as: Tag = 'div' as any,
  interactive: _interactive = true,
  onOverflowClick,
}: SpellRingHostProps) {
  const actives = useActiveSpellsForSession(sessionId);
  const ensembles = useEnsembleStore((s) => s.ensembles);
  const openLauncher = useSpellLauncherStore((s) => s.openLauncher);

  const rings = useMemo<RingSpec[]>(() => {
    return actives
      .filter((a) => a.enabled)
      .map((a) => {
        const ensembleColor = a.ensembleId
          ? ensembles.find((e) => e.id === a.ensembleId)?.color
          : undefined;
        return {
          spellName: a.spellName,
          colorId: a.colorId,
          ensembleId: a.ensembleId,
          ensembleColorId: ensembleColor ? resolveSpellColorId(ensembleColor) : undefined,
        };
      });
  }, [actives, ensembles]);

  const attrs = spellRingAttrs(rings);
  const overflow = attrs['data-spell-ring-overflow'] ?? 0;
  const composedClassName = `${className} spell-ring`.trim();
  const composedStyle: React.CSSProperties = { ...attrs.style, ...style };

  const handleOverflow = () => {
    if (onOverflowClick) onOverflowClick();
    else openLauncher({ source: 'workspace', targetSessionIds: [sessionId] });
  };

  const hostProps: React.HTMLAttributes<HTMLElement> & Record<string, unknown> = {
    className: composedClassName,
    style: composedStyle,
    'data-spell-rings': attrs['data-spell-rings'],
    'data-spell-ring-names': attrs['data-spell-ring-names'],
  };
  if (overflow > 0) hostProps['data-spell-ring-overflow'] = overflow;

  return React.createElement(
    Tag as string,
    hostProps,
    children,
    overflow > 0 ? (
      <span
        key="overflow"
        className="spell-ring__overflow"
        onClick={(e) => { e.stopPropagation(); handleOverflow(); }}
        role="button"
        tabIndex={0}
        aria-label={`${overflow} more active spells`}
      >+{overflow}</span>
    ) : null,
  );
});
