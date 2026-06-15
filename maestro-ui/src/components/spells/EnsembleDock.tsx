import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnsembleStore } from '../../stores/useEnsembleStore';
import { useMaestroStore } from '../../stores/useMaestroStore';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';
import { resolveSpellColorId } from '../../app/constants/spellColors';
import { EnsembleMessageComposer } from './EnsembleMessageComposer';

export interface EnsembleDockProps {
  ensembleId: string;
  onClose: () => void;
}

/** EnsembleDock — standalone floating dock variant (03 §5.2). */
export const EnsembleDock = React.memo(function EnsembleDock({ ensembleId, onClose }: EnsembleDockProps) {
  const ensemble = useEnsembleStore((s) => s.ensembleById(ensembleId));
  const disband = useEnsembleStore((s) => s.disband);
  const sessions = useMaestroStore((s) => s.sessions);
  const openLauncher = useSpellLauncherStore((s) => s.openLauncher);
  const [showComposer, setShowComposer] = useState(false);

  if (!ensemble) return null;
  const colorId = resolveSpellColorId(ensemble.color);

  const node = (
    <div
      className="sp-ensemble-dock"
      role="dialog"
      aria-modal="false"
      aria-label={`Ensemble ${ensemble.name}`}
      style={{
        ['--ensemble-border' as any]: `var(--spell-${colorId}-border)`,
        ['--ensemble-dim' as any]: `var(--spell-${colorId}-dim)`,
      }}
    >
      <header className="sp-ensemble-dock__header">
        <h4>{ensemble.name}</h4>
        <span className="sp-ensemble-dock__objective">{ensemble.objective}</span>
        <button type="button" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <ul className="sp-ensemble-dock__members">
        {ensemble.memberSessionIds.map((sid) => {
          const session = sessions[sid];
          const isLeader = ensemble.leaderSessionId === sid;
          return (
            <li key={sid} className="sp-ensemble-dock__member">
              <span className="sp-ensemble-dock__member-name">{session?.name ?? sid}</span>
              {isLeader && <span className="sp-ensemble-dock__leader">leader</span>}
            </li>
          );
        })}
      </ul>
      <div className="sp-ensemble-dock__actions">
        <button type="button" onClick={() => setShowComposer(true)}>✉ Message ensemble</button>
        <button
          type="button"
          onClick={() => openLauncher({
            source: 'ensemble',
            targetSessionIds: ensemble.memberSessionIds,
            preselectCastMode: 'coordinate',
          })}
        >✦ Cast another</button>
        <button
          type="button"
          className="sp-ensemble-dock__disband"
          onClick={async () => { await disband(ensemble.id); onClose(); }}
        >Disband</button>
      </div>
      {showComposer && (
        <EnsembleMessageComposer
          ensembleId={ensemble.id}
          onClose={() => setShowComposer(false)}
        />
      )}
    </div>
  );

  return createPortal(node, document.body);
});
