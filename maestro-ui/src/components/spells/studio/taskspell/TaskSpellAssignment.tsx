import React from 'react';
import { useMaestroStore } from '../../../../stores/useMaestroStore';
import { useSpellLibraryStore } from '../../../../stores/useSpellLibraryStore';
import { useSpellLauncherStore } from '../../../../stores/useSpellLauncherStore';
import { spellRuleSummary } from '../../../../utils/spellSummary';
import '../../../../styles-spell-active.css';

export interface TaskSpellAssignmentProps {
  taskId: string;
  editable: boolean;
}

/**
 * TaskSpellAssignment (S7) — a task's "spells on spawn" (FR-5.7). Lists the
 * spells attached to a task (rule summaries), lets the user remove them, and
 * opens the launcher in attach-mode to add more.
 */
export const TaskSpellAssignment = React.memo(function TaskSpellAssignment({
  taskId,
  editable,
}: TaskSpellAssignmentProps) {
  const task = useMaestroStore((s) => s.tasks[taskId]);
  const updateTask = useMaestroStore((s) => s.updateTask);
  const spellById = useSpellLibraryStore((s) => s.spellById);
  const openLauncher = useSpellLauncherStore((s) => s.openLauncher);

  if (!task) return null;

  const spellIds = task.spellIds ?? [];

  const handleRemove = async (spellId: string) => {
    const next = spellIds.filter((id) => id !== spellId);
    await updateTask(taskId, { spellIds: next } as any);
  };

  const handleAdd = () => {
    openLauncher({ source: 'task-tile', mode: 'attach', taskId, targetSessionIds: [] });
  };

  return (
    <section className="spa-taskspells">
      <header className="spa-taskspells__header">
        <h4 className="spa-taskspells__title">Spells on spawn</h4>
        <span className="spa-taskspells__hint">Auto-activate when a session spawns for this task.</span>
      </header>

      {spellIds.length === 0 ? (
        <p className="spa-taskspells__empty">No spells will run on spawn.</p>
      ) : (
        <ul className="spa-taskspells__list">
          {spellIds.map((id) => {
            const spell = spellById(id);
            return (
              <li key={id} className="spa-taskspells__item" data-spell-color={spell?.color}>
                <span className="spa-taskspells__icon" aria-hidden>{spell?.icon ?? '✦'}</span>
                <span className="spa-taskspells__body">
                  <span className="spa-taskspells__name">{spell?.name ?? id}</span>
                  {spell && <span className="spa-taskspells__summary">{spellRuleSummary(spell)}</span>}
                </span>
                {editable && (
                  <button
                    type="button"
                    className="spa-taskspells__remove"
                    onClick={() => void handleRemove(id)}
                    aria-label={`Remove ${spell?.name ?? id}`}
                  >✕</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <button type="button" className="spa-taskspells__add" onClick={handleAdd}>
          ＋ Add spell
        </button>
      )}
    </section>
  );
});
