import React, { useState } from 'react';
import { useEnsembleStore } from '../../../../stores/useEnsembleStore';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { resolveSpellColorId } from '../../../../app/constants/spellColors';
import type { CSSProperties } from 'react';
import { EnsembleMessageComposer } from './EnsembleMessageComposer';
import { AddMemberPicker } from './AddMemberPicker';
import '../../../../styles-spell-active.css';

export interface EnsembleSurfaceProps {
  ensembleId: string;
  onClose?: () => void;
}

function frameStyle(colorSlug: string): CSSProperties {
  const id = resolveSpellColorId(colorSlug);
  return {
    ['--ens-primary' as any]: `var(--spell-${id}-primary)`,
    ['--ens-border' as any]: `var(--spell-${id}-border)`,
    ['--ens-dim' as any]: `var(--spell-${id}-dim)`,
    ['--ens-text' as any]: `var(--spell-${id}-text)`,
  };
}

/**
 * EnsembleSurface (S9) — view/manage one ensemble: members + leader + objective,
 * message-all, add/remove member, set leader, disband (FR-10.2). A dashed,
 * colour-framed group so member sessions read as one unit (FR-10.3).
 */
export const EnsembleSurface = React.memo(function EnsembleSurface({
  ensembleId,
  onClose,
}: EnsembleSurfaceProps) {
  const ensemble = useEnsembleStore((s) => s.ensembleById(ensembleId));
  const sessions = useMaestroStore((s) => s.sessions);
  const rename = useEnsembleStore((s) => s.rename);
  const updateObjective = useEnsembleStore((s) => s.updateObjective);
  const setLeader = useEnsembleStore((s) => s.setLeader);
  const addMember = useEnsembleStore((s) => s.addMember);
  const removeMember = useEnsembleStore((s) => s.removeMember);
  const disband = useEnsembleStore((s) => s.disband);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingObjective, setEditingObjective] = useState(false);
  const [objectiveDraft, setObjectiveDraft] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ensemble) return null;

  const wrap = (p: Promise<unknown>) => {
    setError(null);
    void p.catch((e: any) => setError(e?.message ?? 'Action failed'));
  };

  const handleRename = async () => {
    const v = nameDraft.trim();
    if (!v || v === ensemble.name) { setEditingName(false); return; }
    try { await rename(ensemble.id, v); } catch (e: any) { setError(e?.message ?? 'Rename failed'); }
    finally { setEditingName(false); }
  };

  const handleObjective = async () => {
    if (objectiveDraft === ensemble.objective) { setEditingObjective(false); return; }
    try { await updateObjective(ensemble.id, objectiveDraft); } catch (e: any) { setError(e?.message ?? 'Update failed'); }
    finally { setEditingObjective(false); }
  };

  return (
    <section className="spa-ens" style={frameStyle(ensemble.color)} data-ensemble-id={ensemble.id} aria-label={`Ensemble ${ensemble.name}`}>
      <header className="spa-ens__head">
        {editingName ? (
          <input
            autoFocus
            className="spa-ens__name-input"
            value={nameDraft}
            maxLength={40}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void handleRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRename();
              if (e.key === 'Escape') setEditingName(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="spa-ens__name"
            onClick={() => { setNameDraft(ensemble.name); setEditingName(true); }}
            aria-label={`Rename ensemble ${ensemble.name}`}
          >{ensemble.name}</button>
        )}
        <span className="spa-ens__count">{ensemble.memberSessionIds.length} members</span>
        <button type="button" className="spa-ens__msg" onClick={() => setShowComposer(true)} aria-label="Message all members">✉ Message all</button>
        {onClose && <button type="button" className="spa-ens__close" onClick={onClose} aria-label="Close">✕</button>}
      </header>

      <div className="spa-ens__objective">
        {editingObjective ? (
          <textarea
            autoFocus
            value={objectiveDraft}
            rows={2}
            onChange={(e) => setObjectiveDraft(e.target.value)}
            onBlur={() => void handleObjective()}
            aria-label="Ensemble objective"
          />
        ) : (
          <button
            type="button"
            className="spa-ens__objective-text"
            onClick={() => { setObjectiveDraft(ensemble.objective); setEditingObjective(true); }}
          >
            <span className="spa-ens__objective-label">Objective</span>
            {ensemble.objective || 'Click to add an objective'}
          </button>
        )}
      </div>

      {error && <p className="spa-ens__error" role="alert">{error}</p>}

      <ul className="spa-ens__members">
        {ensemble.memberSessionIds.map((sid) => {
          const session = sessions[sid];
          const isLeader = ensemble.leaderSessionId === sid;
          return (
            <li key={sid} className={`spa-ens__member${isLeader ? ' spa-ens__member--leader' : ''}`}>
              <span className="spa-ens__member-name">{session?.name ?? sid}</span>
              {isLeader ? (
                <span className="spa-ens__leader-badge">leader</span>
              ) : (
                <button
                  type="button"
                  className="spa-ens__make-leader"
                  onClick={() => wrap(setLeader(ensemble.id, sid))}
                  aria-label={`Make ${session?.name ?? sid} the leader`}
                >Make leader</button>
              )}
              <button
                type="button"
                className="spa-ens__member-remove"
                onClick={() => wrap(removeMember(ensemble.id, sid))}
                aria-label={`Remove ${session?.name ?? sid}`}
              >✕</button>
            </li>
          );
        })}
      </ul>

      <footer className="spa-ens__footer">
        <div className="spa-ens__add-wrap">
          <button type="button" className="spa-ens__add" onClick={() => setShowPicker((v) => !v)} aria-expanded={showPicker}>
            ＋ Add member
          </button>
          {showPicker && (
            <AddMemberPicker
              memberSessionIds={ensemble.memberSessionIds}
              onPick={(sid) => wrap(addMember(ensemble.id, sid))}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
        <button type="button" className="spa-ens__disband" onClick={() => setConfirmDisband(true)}>Disband</button>
      </footer>

      {confirmDisband && (
        <div className="spa-ens__confirm" role="alertdialog" aria-label="Confirm disband">
          <p>Disband “{ensemble.name}”? Members keep their other active spells; the coordinate spell deactivates.</p>
          <div className="spa-ens__confirm-actions">
            <button type="button" onClick={() => setConfirmDisband(false)}>Cancel</button>
            <button
              type="button"
              className="spa-ens__confirm-primary"
              onClick={async () => {
                try { await disband(ensemble.id); setConfirmDisband(false); onClose?.(); }
                catch (e: any) { setError(e?.message ?? 'Disband failed'); setConfirmDisband(false); }
              }}
            >Disband</button>
          </div>
        </div>
      )}

      {showComposer && (
        <EnsembleMessageComposer ensembleId={ensemble.id} onClose={() => setShowComposer(false)} />
      )}
    </section>
  );
});
