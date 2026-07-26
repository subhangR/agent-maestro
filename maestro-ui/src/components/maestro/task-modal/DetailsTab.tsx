import React from "react";
import { TaskPriority, MaestroTask } from "../../../app/types/maestro";
import { TaskSpellAssignment } from "../../spells/TaskSpellAssignment";
import {
    TASK_STATUS_LABELS as STATUS_LABELS,
    TASK_PRIORITY_LABELS as PRIO_LABEL,
} from "../../../app/constants/labels";
import { useAdvancedMode } from "../../../hooks/useAdvancedMode";

const PRIO_DOT: Record<TaskPriority, string> = {
    high: "var(--pn-block)",
    medium: "var(--pn-wait)",
    low: "var(--pn-idle)",
};

// Model, permissions and isolation are configured once in the modal footer's
// "Options" (a single authority). This tab holds only task metadata.
type DetailsTabProps = {
    priority: TaskPriority;
    onPriorityChange: (priority: TaskPriority) => void;
    dueDate: string;
    onDueDateChange: (date: string) => void;
    isEditMode: boolean;
    task?: MaestroTask;
};

export function DetailsTab({ priority, onPriorityChange, dueDate, onDueDateChange, isEditMode, task }: DetailsTabProps) {
    const advancedMode = useAdvancedMode();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pn-fld">
                <span className="pn-flabel">Priority</span>
                <div className="pn-prio-pills">
                    {(["high", "medium", "low"] as TaskPriority[]).map((p) => (
                        <button
                            key={p}
                            type="button"
                            className={`pn-prio-pill ${priority === p ? "pn-prio-pill--active" : ""}`}
                            onClick={() => onPriorityChange(p)}
                        >
                            <span className="pn-pdot" style={{ background: PRIO_DOT[p] }}></span>
                            {PRIO_LABEL[p]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="pn-fld" style={{ maxWidth: 280 }}>
                <span className="pn-flabel">Due date</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => onDueDateChange(e.target.value)}
                        className="pn-input"
                        style={{ width: 'auto', flex: 1 }}
                    />
                    {dueDate && (
                        <button
                            type="button"
                            className="pn-mchip"
                            onClick={() => onDueDateChange("")}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {isEditMode && task && (
                <TaskSpellAssignment taskId={task.id} editable />
            )}

            {isEditMode && task && advancedMode && (
                <div className="pn-fhint" style={{ display: 'flex', gap: '16px' }}>
                    <span>status: {STATUS_LABELS[task.status] || task.status}</span>
                    <span>id: {task.id}</span>
                </div>
            )}
        </div>
    );
}
