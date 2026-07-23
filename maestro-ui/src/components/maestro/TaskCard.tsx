import React, { useCallback, useEffect, useRef } from "react";
import { MaestroTask } from "../../app/types/maestro";
import { Glyph } from "./redesign/kit";
import { getModelDisplayLabel } from "../../app/constants/agentTools";

// Priority dot colours (boards.jsx PRIO_DOT) — CSS vars, flip with theme.
const PRIO_DOT: Record<string, string> = {
    high: "var(--pn-block)",
    medium: "var(--pn-wait)",
    low: "var(--pn-idle)",
};
const PRIO_TAG: Record<string, string> = { high: "high", medium: "med", low: "low" };
const PRIO_LABEL: Record<string, string> = { high: "HIGH", medium: "MED", low: "LOW" };

type TaskCardProps = {
    task: MaestroTask;
    isDragging: boolean;
    onPointerDown: (e: React.PointerEvent, taskId: string) => void;
    onClick: (task: MaestroTask) => void;
    onWorkOn: (task: MaestroTask) => void;
    projectBadge?: { name: string; color: string };
};

export const TaskCard = React.memo(function TaskCard({
    task,
    isDragging,
    onPointerDown,
    onClick,
    onWorkOn,
    projectBadge,
}: TaskCardProps) {
    const wasDraggingRef = useRef(false);

    const subtaskCount = task.subtasks?.length ?? 0;
    const completedSubtasks = task.subtasks?.filter((s) => s.status === "completed").length ?? 0;
    const isActive = task.status === "in_progress";
    const isBlocked = task.status === "blocked";
    const isCancelled = task.status === "cancelled";
    const isDone = task.status === "completed";
    const isOverdue = !!(task.dueDate && task.status !== 'completed' && task.status !== 'cancelled' && new Date(task.dueDate + 'T00:00:00') < new Date(new Date().toDateString()));

    useEffect(() => {
        if (isDragging) {
            wasDraggingRef.current = true;
        }
    }, [isDragging]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        onPointerDown(e, task.id);
    }, [onPointerDown, task.id]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        onClick(task);
    }, [onClick, task]);

    const handleDragStart = useCallback((e: React.DragEvent) => {
        const content = task.initialPrompt || task.description || '';
        const text = `[Task: ${task.title}] ${content}`;
        e.dataTransfer.setData('application/maestro-task', JSON.stringify({
            title: task.title,
            description: task.description,
            initialPrompt: task.initialPrompt,
        }));
        e.dataTransfer.setData('text/plain', text);
        e.dataTransfer.effectAllowed = 'copy';
    }, [task.title, task.description, task.initialPrompt]);

    return (
        <div
            className={`pn-bcard ${isBlocked ? "pn-bcard--blocked" : ""} ${isDone ? "pn-bcard--done" : ""}`}
            draggable
            onDragStart={handleDragStart}
            onPointerDown={handlePointerDown}
            onClick={handleClick}
        >
            <div className="pn-bcard__top">
                <span
                    className="pn-bcard__pdot"
                    style={{ background: PRIO_DOT[task.priority] }}
                />
                <span className="pn-bcard__title">{task.title}</span>
                {isActive && (
                    <span className="pn-bcard__glyph pn-dot-wrap">
                        <span className="pn-dot pn-dot--run pn-dot--live" />
                    </span>
                )}
                {isBlocked && (
                    <span className="pn-bcard__glyph">
                        <Glyph kind="blocked" size={14} />
                    </span>
                )}
                {isDone && (
                    <span className="pn-bcard__glyph">
                        <Glyph kind="completed" size={14} />
                    </span>
                )}
            </div>
            {projectBadge && (
                <span
                    className="pn-bcard__pbadge"
                    style={{ color: projectBadge.color, borderColor: projectBadge.color }}
                >
                    {projectBadge.name}
                </span>
            )}
            <div className="pn-bcard__meta">
                <span className={`pn-tag pn-tag--${PRIO_TAG[task.priority]}`}>
                    {PRIO_LABEL[task.priority]}
                </span>
                {subtaskCount > 0 && (
                    <span className="pn-bcard__prog">
                        {completedSubtasks}/{subtaskCount}
                        <span className="pn-bcard__progbar">
                            <i style={{ width: `${(completedSubtasks / subtaskCount) * 100}%` }} />
                        </span>
                    </span>
                )}
                {task.launchConfig?.model && (
                    <span
                        className="pn-bcard__due"
                        title={`Runs with ${getModelDisplayLabel(String(task.launchConfig.model))}`}
                    >
                        {getModelDisplayLabel(String(task.launchConfig.model))}
                    </span>
                )}
                {task.dueDate && (
                    <span className={`pn-bcard__due ${isOverdue ? "pn-bcard__due--over" : ""}`}>
                        {isOverdue ? "Overdue" : `Due ${new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </span>
                )}
            </div>
            <div className="pn-bcard__foot">
                {task.sessionIds.length > 0 && (
                    <span className="pn-bcard__sessions">
                        <span className={`pn-dot ${isActive ? "pn-dot--run" : "pn-dot--idle"}`} />
                        {task.sessionIds.length} session{task.sessionIds.length !== 1 ? "s" : ""}
                    </span>
                )}
                {(task.status === "todo" || task.status === "blocked") && (
                    <button type="button"
                        className="pn-bcard__run"
                        onClick={(e) => {
                            e.stopPropagation();
                            onWorkOn(task);
                        }}
                        title="Start working on this task"
                    >
                        <span className="pn-prompt">$</span> work on
                    </button>
                )}
            </div>
        </div>
    );
});
