import React, { useMemo } from 'react';
import { useMaestroStore } from '../../stores/useMaestroStore';

export interface SessionTargetChipsProps {
  projectId: string | null;
  selectedIds: Set<string>;
  onToggle: (sessionId: string, shiftRange: boolean) => void;
  /** When true, clicking another chip replaces the selection (single-cast mode). */
  singleMode?: boolean;
  disabled?: boolean;
}

/** SessionTargetChips — multi-target selector chips (03 §1.8). */
export const SessionTargetChips = React.memo(function SessionTargetChips({
  projectId,
  selectedIds,
  onToggle,
  singleMode = false,
  disabled = false,
}: SessionTargetChipsProps) {
  const sessions = useMaestroStore((s) => s.sessions);

  const projectSessions = useMemo(() => {
    if (!projectId) return [];
    return Object.values(sessions)
      .filter((s) => s.projectId === projectId && s.status !== 'completed' && s.status !== 'stopped')
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
      .slice(0, 24);
  }, [sessions, projectId]);

  if (!projectId) {
    return <p className="sp-targets__empty">Pick a project to see sessions.</p>;
  }
  if (projectSessions.length === 0) {
    return <p className="sp-targets__empty">No active sessions in this project.</p>;
  }

  return (
    <div className="sp-targets" role="listbox" aria-label="Cast targets" aria-multiselectable={!singleMode}>
      {projectSessions.map((s, idx) => {
        const isSelected = selectedIds.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={disabled}
            className={`sp-target-chip ${isSelected ? 'sp-target-chip--selected' : ''}`}
            onClick={(e) => onToggle(s.id, e.shiftKey)}
            title={`${s.name} (${idx + 1})`}
          >
            <span className="sp-target-chip__index" aria-hidden>{idx + 1}</span>
            <span className="sp-target-chip__name">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
});
