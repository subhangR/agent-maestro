import { useMemo } from 'react';
import { useActiveSpellsForSession } from '../../../../stores/useActiveSpellsStore';
import { useEnsembleStore } from '../../../../stores/useEnsembleStore';
import {
  spellRingAttrs,
  spellRingAriaLabel,
  type SpellRingAttrs,
  type RingSpec,
} from '../../../../utils/spellRings';
import { resolveSpellColorId, type SpellColorId } from '../../../../app/constants/spellColors';

/**
 * Ring wiring for S5. Returns the inline style + data-attrs to spread onto any
 * ring host (session tile, rail item, terminal container) so it paints one
 * concentric ring per active spell, plus a ready-made aria-label so the ring
 * colour is never the *only* signal (FR-11.3). Reactive: re-renders when the
 * session's active spells or their ensemble colours change.
 */
export function useActiveSpellRingAttrs(
  sessionId: string | null | undefined,
  hostName = 'Session',
): SpellRingAttrs & { 'aria-label'?: string } {
  const actives = useActiveSpellsForSession(sessionId);
  const ensembles = useEnsembleStore((s) => s.ensembles);

  return useMemo(() => {
    const ensembleColorById = (id: string): SpellColorId | undefined => {
      const e = ensembles.find((x) => x.id === id);
      return e ? resolveSpellColorId(e.color) : undefined;
    };
    const specs: RingSpec[] = actives.map((s) => ({
      spellName: s.spellName,
      colorId: s.colorId,
      ensembleId: s.ensembleId,
      ensembleColorId: s.ensembleId ? ensembleColorById(s.ensembleId) : undefined,
    }));
    const attrs = spellRingAttrs(specs);
    const label = spellRingAriaLabel(hostName, actives);
    return label ? { ...attrs, 'aria-label': label } : attrs;
  }, [actives, ensembles, hostName]);
}
