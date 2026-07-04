import React, { useEffect } from 'react';
import { useEnsembleStore } from '../../../../stores/useEnsembleStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { resolveSpellColorId } from '../../../../app/constants/spellColors';
import '../../../../styles-spell-active.css';

export interface EnsembleListProps {
  /** Select an ensemble to open its EnsembleSurface (wired by the shell). */
  onSelectEnsemble?: (ensembleId: string) => void;
}

/**
 * EnsembleList (S9) — project-wide list of active ensembles. States:
 * loading / error (retry) / empty / populated. Selecting one opens its surface.
 */
export const EnsembleList = React.memo(function EnsembleList({ onSelectEnsemble }: EnsembleListProps) {
  const ensembles = useEnsembleStore((s) => s.ensembles);
  const loading = useEnsembleStore((s) => s.loading);
  const error = useEnsembleStore((s) => s.error);
  const fetchEnsembles = useEnsembleStore((s) => s.fetchEnsembles);
  const sessions = useMaestroStore((s) => s.sessions);

  useEffect(() => { void fetchEnsembles(); }, [fetchEnsembles]);

  const active = ensembles.filter((e) => !e.disbandedAt);

  if (error) {
    return (
      <div className="spa-enslist spa-enslist--error" role="alert">
        <p>Couldn’t load ensembles.</p>
        <p className="spa-enslist__detail">{error}</p>
        <button type="button" onClick={() => void fetchEnsembles()}>Retry</button>
      </div>
    );
  }
  if (loading && active.length === 0) {
    return <div className="spa-enslist spa-enslist--loading" aria-busy="true"><p>Loading ensembles…</p></div>;
  }
  if (active.length === 0) {
    return (
      <div className="spa-enslist spa-enslist--empty">
        <p className="spa-enslist__empty-title">No ensembles</p>
        <p className="spa-enslist__detail">Cast a spell in Coordinate mode across ≥2 sessions to form one.</p>
      </div>
    );
  }

  return (
    <ul className="spa-enslist" aria-label="Ensembles">
      {active.map((e) => {
        const colorId = resolveSpellColorId(e.color);
        return (
          <li key={e.id}>
            <button
              type="button"
              className="spa-enslist__item"
              data-spell-color={colorId}
              onClick={() => onSelectEnsemble?.(e.id)}
            >
              <span className="spa-enslist__dot" aria-hidden />
              <span className="spa-enslist__body">
                <span className="spa-enslist__name">{e.name}</span>
                {e.objective && <span className="spa-enslist__objective">{e.objective}</span>}
              </span>
              <span className="spa-enslist__count">
                {e.memberSessionIds.length} · {e.memberSessionIds.map((sid) => sessions[sid]?.name ?? sid).slice(0, 3).join(', ')}
                {e.memberSessionIds.length > 3 ? '…' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
});
