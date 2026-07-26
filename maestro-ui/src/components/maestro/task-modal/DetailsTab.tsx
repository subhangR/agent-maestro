import React from "react";
import { TaskPriority, MaestroTask, LaunchConfig, TeamMember } from "../../../app/types/maestro";
import { Icon } from "../redesign/kit";
import { TaskSpellAssignment } from "../../spells/TaskSpellAssignment";
import { ModelPickerChip } from "./ModelPickerChip";
import {
    TASK_STATUS_LABELS as STATUS_LABELS,
    TASK_PRIORITY_LABELS as PRIO_LABEL,
    PERMISSION_CHIP_LABELS,
    ISOLATION_CHIP_LABELS,
} from "../../../app/constants/labels";

const PRIO_DOT: Record<TaskPriority, string> = {
    high: "var(--pn-block)",
    medium: "var(--pn-wait)",
    low: "var(--pn-idle)",
};

type DetailsTabProps = {
    priority: TaskPriority;
    onPriorityChange: (priority: TaskPriority) => void;
    dueDate: string;
    onDueDateChange: (date: string) => void;
    useWorktree: boolean;
    onUseWorktreeChange: (value: boolean) => void;
    dangerousMode: boolean;
    onDangerousModeChange: (value: boolean) => void;
    taskLaunchConfig: LaunchConfig | null;
    onTaskLaunchConfigChange: (config: LaunchConfig | null) => void;
    soleMember?: TeamMember;
    isEditMode: boolean;
    task?: MaestroTask;
};

export function DetailsTab({ priority, onPriorityChange, dueDate, onDueDateChange, useWorktree, onUseWorktreeChange, dangerousMode, onDangerousModeChange, taskLaunchConfig, onTaskLaunchConfigChange, soleMember, isEditMode, task }: DetailsTabProps) {
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

            <div className="pn-frow">
                <div className="pn-fld">
                    <span className="pn-flabel">Model</span>
                    <div style={{ display: 'flex', alignItems: 'center', height: 38 }}>
                        <ModelPickerChip
                            value={taskLaunchConfig}
                            onChange={onTaskLaunchConfigChange}
                            fallbackMember={soleMember}
                        />
                    </div>
                </div>

                <div className="pn-fld" style={{ flex: 1 }}>
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

                <div className="pn-fld">
                    <span className="pn-flabel">Where it works</span>
                    <button
                        type="button"
                        className={`pn-toggle ${useWorktree ? 'pn-toggle--on-wt' : ''}`}
                        onClick={() => onUseWorktreeChange(!useWorktree)}
                        style={{ height: 38 }}
                        title={useWorktree ? 'The agent works on a separate copy of your files' : 'The agent works directly on your files'}
                    >
                        <Icon name="gitBranch" size={14} /> {useWorktree ? ISOLATION_CHIP_LABELS.isolated : ISOLATION_CHIP_LABELS.inPlace}
                    </button>
                </div>

                <div className="pn-fld">
                    <span className="pn-flabel">Permissions</span>
                    <button
                        type="button"
                        className={`pn-toggle ${dangerousMode ? 'pn-toggle--on-danger' : ''}`}
                        onClick={() => onDangerousModeChange(!dangerousMode)}
                        style={{ height: 38 }}
                        title={dangerousMode ? 'Auto-approves every command — click to require approval' : 'Asks before running commands — click to auto-approve everything'}
                    >
                        <Icon name="shield" size={14} /> {dangerousMode ? PERMISSION_CHIP_LABELS.unrestricted : PERMISSION_CHIP_LABELS.safe}
                    </button>
                </div>
            </div>

            {isEditMode && task && (
                <TaskSpellAssignment taskId={task.id} editable />
            )}

            {isEditMode && task && (
                <div className="pn-fhint" style={{ display: 'flex', gap: '16px' }}>
                    <span>status: {STATUS_LABELS[task.status] || task.status}</span>
                    <span>id: {task.id}</span>
                </div>
            )}
        </div>
    );
}
