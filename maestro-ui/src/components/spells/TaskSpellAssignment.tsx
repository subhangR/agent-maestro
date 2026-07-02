import React from 'react';
import { useMaestroStore } from '../../stores/useMaestroStore';
import { useSpellLibraryStore } from '../../stores/useSpellLibraryStore';
import { useSpellLauncherStore } from '../../stores/useSpellLauncherStore';
import { spellRuleSummary } from '../../utils/spellSummary';

export interface TaskSpellAssignmentProps {
  taskId: string;
  editable: boolean;
}

/** TaskSpellAssignment — task-modal "Spells on spawn" section (03 §7). */
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
    openLauncher({
      source: 'task-tile',
      mode: 'attach',
      taskId,
      targetSessionIds: [],
    });
  };

  return (
    <section className="sp-task-spells">
      <header className="sp-task-spells__header">
        <h4>Spells on spawn</h4>
      </header>
      {spellIds.length === 0 && (
        <p className="sp-task-spells__empty">No spells will run on spawn.</p>
      )}
      <ul className="sp-task-spells__list">
        {spellIds.map((id) => {
          const spell = spellById(id);
          return (
            <li key={id} className="sp-task-spells__item" data-spell-color={spell?.color}>
              <span className="sp-task-spells__icon" aria-hidden>{spell?.icon ?? '✦'}</span>
              <span className="sp-task-spells__name">{spell?.name ?? id}</span>
              <span className="sp-task-spells__action">{spell ? spellRuleSummary(spell) : ''}</span>
              {editable && (
                <button
                  type="button"
                  onClick={() => void handleRemove(id)}
                  aria-label={`Remove ${spell?.name ?? id}`}
                  className="sp-task-spells__remove"
                >×</button>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <button type="button" className="sp-task-spells__add" onClick={handleAdd}>
          + Add spell
        </button>
      )}
    </section>
  );
});
