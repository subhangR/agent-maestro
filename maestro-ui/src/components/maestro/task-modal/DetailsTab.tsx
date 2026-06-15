import React from "react";
import { TaskPriority, MaestroTask } from "../../../app/types/maestro";
import { Icon } from "../redesign/kit";

const STATUS_LABELS: Record<string, string> = {
    todo: "Todo",
    in_progress: "In Progress",
    in_review: "In Review",
    completed: "Completed",
    cancelled: "Cancelled",
    blocked: "Blocked",
};

const PRIO_DOT: Record<TaskPriority, string> = {
    high: "var(--pn-block)",
    medium: "var(--pn-wait)",
    low: "var(--pn-idle)",
};

const PRIO_LABEL: Record<TaskPriority, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
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
    isEditMode: boolean;
    task?: MaestroTask;
};

export function DetailsTab({ priority, onPriorityChange, dueDate, onDueDateChange, useWorktree, onUseWorktreeChange, dangerousMode, onDangerousModeChange, isEditMode, task }: DetailsTabProps) {
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
                    <span className="pn-flabel">Isolation</span>
                    <button
                        type="button"
                        className={`pn-toggle ${useWorktree ? 'pn-toggle--on-wt' : ''}`}
                        onClick={() => onUseWorktreeChange(!useWorktree)}
                        style={{ height: 38 }}
                        title={useWorktree ? 'Session runs in an isolated git branch' : 'Session runs in-place'}
                    >
                        <Icon name="gitBranch" size={14} /> {useWorktree ? 'Git worktree' : 'In-place'}
                    </button>
                </div>

                <div className="pn-fld">
                    <span className="pn-flabel">Permissions</span>
                    <button
                        type="button"
                        className={`pn-toggle ${dangerousMode ? 'pn-toggle--on-danger' : ''}`}
                        onClick={() => onDangerousModeChange(!dangerousMode)}
                        style={{ height: 38 }}
                        title={dangerousMode ? 'Dangerous mode ON (bypass permissions)' : 'Enable dangerous mode (bypass permissions)'}
                    >
                        <Icon name="shield" size={14} /> {dangerousMode ? 'YOLO' : 'Safe'}
                    </button>
                </div>
            </div>

            {isEditMode && task && (
                <div className="pn-fhint" style={{ display: 'flex', gap: '16px' }}>
                    <span>status: {STATUS_LABELS[task.status] || task.status}</span>
                    <span>id: {task.id}</span>
                </div>
            )}
        </div>
    );
}
