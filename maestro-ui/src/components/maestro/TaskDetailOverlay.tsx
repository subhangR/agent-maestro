import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useUIStore } from "../../stores/useUIStore";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { MaestroTask, AgentTool, ModelType } from "../../app/types/maestro";
import { CreateTaskModal } from "./CreateTaskModal";
import { createMaestroSession } from "../../services/maestroService";

export function TaskDetailOverlay() {
    const overlay = useUIStore((s) => s.taskDetailOverlay);
    const setOverlay = useUIStore((s) => s.setTaskDetailOverlay);

    const tasks = useMaestroStore((s) => s.tasks);
    const updateTask = useMaestroStore((s) => s.updateTask);
    const createTask = useMaestroStore((s) => s.createTask);
    const deleteTask = useMaestroStore((s) => s.deleteTask);
    const projects = useProjectStore((s) => s.projects);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);

    // Close on Escape
    useEffect(() => {
        if (!overlay) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setOverlay(null);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [overlay, setOverlay]);

    // Only show overlay for the currently active project
    if (!overlay || overlay.projectId !== activeProjectId) return null;

    const task = tasks[overlay.taskId];
    const project = projects.find((p) => p.id === overlay.projectId);

    if (!task || !project) return null;

    const handleClose = () => setOverlay(null);

    const handleUpdateTask = async (taskId: string, updates: Partial<MaestroTask>) => {
        await updateTask(taskId, updates);
    };

    const handleAddSubtask = async (title: string) => {
        await createTask({
            projectId: overlay.projectId,
            parentId: task.id,
            title,
            description: "",
            priority: "medium",
        });
    };

    const handleToggleSubtask = async (subtaskId: string) => {
        const subtask = tasks[subtaskId];
        if (!subtask) return;
        const newStatus = subtask.status === "completed" ? "todo" : "completed";
        await updateTask(subtaskId, { status: newStatus });
    };

    const handleDeleteSubtask = async (subtaskId: string) => {
        await deleteTask(subtaskId);
    };

    const handleWorkOn = async () => {
        // Read from store.getState() at call time so we always use the task
        // that was just saved by the Run button's flush, not the render-time closure.
        const latestTask = useMaestroStore.getState().tasks[overlay!.taskId] ?? task;
        await createMaestroSession({
            task: latestTask,
            project,
            mode: "worker",
            strategy: "simple",
            ...(latestTask.memberOverrides ? { memberOverrides: latestTask.memberOverrides } : {}),
        });
    };

    const handleNavigateToTask = (taskId: string) => {
        setOverlay({ taskId, projectId: overlay.projectId });
    };

    const handleWorkOnSubtask = async (subtask: MaestroTask) => {
        await createMaestroSession({
            task: subtask,
            project,
            mode: "worker",
            strategy: "simple",
            ...(subtask.memberOverrides ? { memberOverrides: subtask.memberOverrides } : {}),
        });
    };

    return (
        <div className="taskDetailOverlay">
            <CreateTaskModal
                isOpen={true}
                mode="edit"
                task={task}
                onClose={handleClose}
                onCreate={() => {}}
                project={project}
                variant="overlay"
                onUpdateTask={handleUpdateTask}
                onAddSubtask={handleAddSubtask}
                onToggleSubtask={handleToggleSubtask}
                onDeleteSubtask={handleDeleteSubtask}
                onWorkOn={handleWorkOn}
                onNavigateToTask={handleNavigateToTask}
                onWorkOnSubtask={handleWorkOnSubtask}
            />
        </div>
    );
}
