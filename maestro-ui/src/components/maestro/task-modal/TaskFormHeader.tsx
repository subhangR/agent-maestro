import React, { useRef, useEffect } from "react";
import { MaestroTask } from "../../../app/types/maestro";
import { useTaskBreadcrumb } from "../../../hooks/useTaskBreadcrumb";
import { Icon } from "../redesign/kit";
import { TASK_STATUS_LABELS as STATUS_LABELS } from "../../../app/constants/labels";

type TaskFormHeaderProps = {
    title: string;
    onTitleChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    isEditMode: boolean;
    task?: MaestroTask;
    isOverlay: boolean;
    onClose: () => void;
    parentId?: string;
    parentTitle?: string;
    projectName?: string;
    onNavigateToTask?: (taskId: string) => void;
    autoFocus?: boolean;
};

export function TaskFormHeader({
    title,
    onTitleChange,
    onKeyDown,
    isEditMode,
    task,
    isOverlay,
    onClose,
    parentId,
    parentTitle,
    projectName,
    onNavigateToTask,
    autoFocus,
}: TaskFormHeaderProps) {
    const titleInputRef = useRef<HTMLInputElement>(null);
    const breadcrumb = useTaskBreadcrumb(isEditMode ? task?.id ?? null : null);

    useEffect(() => {
        if (autoFocus && titleInputRef.current) {
            setTimeout(() => titleInputRef.current?.focus(), 100);
        }
    }, [autoFocus]);

    const crumbLeaf = isEditMode && task
        ? (STATUS_LABELS[task.status] || task.status)
        : (parentId ? 'New subtask' : 'New task');

    return (
        <div className="pn-mdl__hd">
            <div className="pn-mdl__hdmain">
                <div className="pn-mdl__crumb">
                    {isOverlay && (
                        <button type="button"
                            className="taskDetailOverlay__backBtn"
                            onClick={onClose}
                            title="Back to terminal"
                            style={{ flexShrink: 0 }}
                        >
                            <Icon name="chevronL" size={13} /> Back
                        </button>
                    )}
                    <Icon name="listChecks" />
                    {projectName && <b>{projectName}</b>}
                    <Icon name="chevronR" size={11} /> {crumbLeaf}
                </div>

                {/* Breadcrumb ancestors (edit mode) */}
                {isEditMode && breadcrumb.length > 1 && (
                    <div className="pn-fhint" style={{ marginBottom: '4px' }}>
                        {breadcrumb.slice(0, -1).map(t => (
                            <span
                                key={t.id}
                                style={{ cursor: 'pointer' }}
                                onClick={() => onNavigateToTask?.(t.id)}
                            >
                                {t.title} &rsaquo;{' '}
                            </span>
                        ))}
                    </div>
                )}

                {/* Subtitle for create-subtask mode */}
                {!isEditMode && parentId && parentTitle && (
                    <div className="pn-fhint" style={{ marginBottom: '4px' }}>
                        Subtask of: {parentTitle}
                    </div>
                )}

                <input
                    ref={titleInputRef}
                    type="text"
                    className="pn-mdl__titleinput"
                    placeholder={isEditMode ? "Untitled task" : "Untitled task"}
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            {!isOverlay && (
                <button type="button" className="pn-mdl__close" onClick={onClose}>
                    <Icon name="x" />
                </button>
            )}
        </div>
    );
}
