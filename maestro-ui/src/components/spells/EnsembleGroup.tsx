import React, { useState } from 'react';
import { useEnsembleStore } from '../../stores/useEnsembleStore';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';
import { resolveSpellColorId } from '../../app/constants/spellColors';
import { EnsembleMessageComposer } from './EnsembleMessageComposer';
import type { CSSProperties } from 'react';

export type EnsembleRole = 'leader' | 'worker';

export interface EnsembleGroupProps {
  ensembleId: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Render a single member row — handed in so the canonical SessionListItem stays DRY. */
  renderMember: (sessionId: string, role: EnsembleRole) => React.ReactNode;
}

/** Compute the dashed-frame style from a SpellColorSlug (03 §5.4 spellEnsembleStyle). */
function ensembleFrameStyle(colorSlug: string): CSSProperties {
  const id = resolveSpellColorId(colorSlug);
  return {
    ['--ensemble-dim' as any]: `var(--spell-${id}-dim)`,
    ['--ensemble-border' as any]: `var(--spell-${id}-border)`,
    ['--ensemble-text' as any]: `var(--spell-${id}-text)`,
  };
}

/** EnsembleGroup — dashed-frame group with header + members (03 §5). */
export const EnsembleGroup = React.memo(function EnsembleGroup({
  ensembleId,
  expanded,
  onToggleExpanded,
  renderMember,
}: EnsembleGroupProps) {
  const ensemble = useEnsembleStore((s) => s.ensembleById(ensembleId));
  const renameEnsemble = useEnsembleStore((s) => s.rename);
  const updateObjective = useEnsembleStore((s) => s.updateObjective);
  const disband = useEnsembleStore((s) => s.disband);
  const removeMember = useEnsembleStore((s) => s.removeMember);
  const openLauncher = useSpellLauncherStore((s) => s.openLauncher);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingObjective, setEditingObjective] = useState(false);
  const [objectiveDraft, setObjectiveDraft] = useState('');
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [showComposer, setShowComposer] = useState(false);

  if (!ensemble) return null;

  const handleRename = async () => {
    if (!nameDraft.trim() || nameDraft.trim() === ensemble.name) {
      setEditingName(false);
      return;
    }
    try {
      await renameEnsemble(ensemble.id, nameDraft.trim());
    } finally {
      setEditingName(false);
    }
  };

  const handleObjectiveSave = async () => {
    if (objectiveDraft === ensemble.objective) {
      setEditingObjective(false);
      return;
    }
    try {
      await updateObjective(ensemble.id, objectiveDraft);
    } finally {
      setEditingObjective(false);
    }
  };

  return (
    <div
      className="pn-ensemble"
      style={ensembleFrameStyle(ensemble.color)}
      data-ensemble-id={ensemble.id}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <header className="pn-ensemble__header">
        <button
          type="button"
          className="pn-ensemble__toggle"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >{expanded ? '▾' : '▸'}</button>
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void handleRename()}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') setEditingName(false); }}
            maxLength={40}
            className="pn-ensemble__name-input"
          />
        ) : (
          <button
            type="button"
            className="pn-ensemble__name"
            onClick={() => { setNameDraft(ensemble.name); setEditingName(true); }}
            aria-label={`Rename ensemble ${ensemble.name}`}
          >{ensemble.name}</button>
        )}
        <span className="pn-ensemble__count">{ensemble.memberSessionIds.length} members</span>
        <button
          type="button"
          className="pn-ensemble__message"
          onClick={() => setShowComposer(true)}
          aria-label="Message ensemble"
        >✉</button>
        <button
          type="button"
          className="pn-ensemble__disband"
          onClick={() => setConfirmDisband(true)}
          aria-label="Disband ensemble"
        >Disband</button>
      </header>

      {expanded && (
        <>
          <div className="pn-ensemble__objective">
            {editingObjective ? (
              <textarea
                autoFocus
                value={objectiveDraft}
                onChange={(e) => setObjectiveDraft(e.target.value)}
                onBlur={() => void handleObjectiveSave()}
                rows={2}
              />
            ) : (
              <button
                type="button"
                className="pn-ensemble__objective-text"
                onClick={() => { setObjectiveDraft(ensemble.objective); setEditingObjective(true); }}
              >objective: {ensemble.objective || 'click to add'}</button>
            )}
          </div>

          <div className="pn-ensemble__members">
            {ensemble.memberSessionIds.map((sid) => {
              const role: EnsembleRole = ensemble.leaderSessionId === sid ? 'leader' : 'worker';
              return (
                <div key={sid} className="pn-ensemble__member">
                  {renderMember(sid, role)}
                  <button
                    type="button"
                    className="pn-ensemble__remove-member"
                    aria-label={`Remove ${sid}`}
                    onClick={() => void removeMember(ensemble.id, sid)}
                  >×</button>
                </div>
              );
            })}
          </div>

          <footer className="pn-ensemble__footer">
            <button
              type="button"
              onClick={() => openLauncher({
                source: 'ensemble',
                targetSessionIds: ensemble.memberSessionIds,
                preselectCastMode: 'coordinate',
              })}
            >✦ Cast another on this ensemble</button>
          </footer>
        </>
      )}

      {confirmDisband && (
        <div className="pn-ensemble__confirm" role="alertdialog" aria-label="Confirm disband">
          <p>Disband "{ensemble.name}"? Members keep other active spells; the coordinate spell deactivates.</p>
          <button type="button" onClick={() => setConfirmDisband(false)}>Cancel</button>
          <button
            type="button"
            className="pn-ensemble__confirm-primary"
            onClick={async () => {
              await disband(ensemble.id);
              setConfirmDisband(false);
            }}
          >Disband</button>
        </div>
      )}

      {showComposer && (
        <EnsembleMessageComposer
          ensembleId={ensemble.id}
          onClose={() => setShowComposer(false)}
        />
      )}
    </div>
  );
});
