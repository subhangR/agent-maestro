import React from "react";
import { MaestroTask } from "../../../app/types/maestro";
import { useSubtaskProgress } from "../../../hooks/useSubtaskProgress";
import { useTaskSessions } from "../../../hooks/useTaskSessions";
import { Icon } from "../redesign/kit";

type TaskTabBarProps = {
    activeTab: string | null;
    onToggleTab: (tab: string) => void;
    onCloseTab: () => void;
    isEditMode: boolean;
    taskId?: string;
    selectedSkillsCount: number;
    selectedRefTasksCount: number;
    taskDocsCount: number;
};

export function TaskTabBar({
    activeTab,
    onToggleTab,
    onCloseTab,
    isEditMode,
    taskId,
    selectedSkillsCount,
    selectedRefTasksCount,
    taskDocsCount,
}: TaskTabBarProps) {
    const subtaskProgress = useSubtaskProgress(isEditMode ? taskId ?? null : null);
    const { sessions } = useTaskSessions(isEditMode ? taskId ?? null : null);

    return (
        <div className="pn-mtabs" style={{ marginTop: 'auto' }}>
            {isEditMode && (
                <button
                    type="button"
                    className={`pn-mtab ${activeTab === 'subtasks' ? 'pn-mtab--active' : ''}`}
                    onClick={() => onToggleTab('subtasks')}
                >
                    <Icon name="listChecks" /> Subtasks
                    {subtaskProgress.total > 0 && (
                        <span className="pn-mtab__n">
                            {subtaskProgress.completed}/{subtaskProgress.total}
                        </span>
                    )}
                </button>
            )}
            <button
                type="button"
                className={`pn-mtab ${activeTab === 'skills' ? 'pn-mtab--active' : ''}`}
                onClick={() => onToggleTab('skills')}
            >
                <Icon name="sparkles" /> Skills
                {selectedSkillsCount > 0 && (
                    <span className="pn-mtab__n">{selectedSkillsCount}</span>
                )}
            </button>
            {isEditMode && sessions.length > 0 && (
                <button
                    type="button"
                    className={`pn-mtab ${activeTab === 'sessions' ? 'pn-mtab--active' : ''}`}
                    onClick={() => onToggleTab('sessions')}
                >
                    <Icon name="terminal" /> Sessions
                    <span className="pn-mtab__n">{sessions.length}</span>
                </button>
            )}
            {isEditMode && sessions.length > 0 && (
                <button
                    type="button"
                    className={`pn-mtab ${activeTab === 'tokens' ? 'pn-mtab--active' : ''}`}
                    onClick={() => onToggleTab('tokens')}
                >
                    <Icon name="hash" /> Tokens
                </button>
            )}
            <button
                type="button"
                className={`pn-mtab ${activeTab === 'ref-docs' ? 'pn-mtab--active' : ''}`}
                onClick={() => onToggleTab('ref-docs')}
            >
                <Icon name="at" /> Ref Tasks
                {selectedRefTasksCount > 0 && (
                    <span className="pn-mtab__n">{selectedRefTasksCount}</span>
                )}
            </button>
            {isEditMode && (
                <button
                    type="button"
                    className={`pn-mtab ${activeTab === 'gen-docs' ? 'pn-mtab--active' : ''}`}
                    onClick={() => onToggleTab('gen-docs')}
                >
                    <Icon name="doc" /> Gen Docs
                    {taskDocsCount > 0 && (
                        <span className="pn-mtab__n">{taskDocsCount}</span>
                    )}
                </button>
            )}
            {isEditMode && (
                <button
                    type="button"
                    className={`pn-mtab ${activeTab === 'timeline' ? 'pn-mtab--active' : ''}`}
                    onClick={() => onToggleTab('timeline')}
                >
                    <Icon name="clock" /> Timeline
                </button>
            )}
            <button
                type="button"
                className={`pn-mtab ${activeTab === 'details' ? 'pn-mtab--active' : ''}`}
                onClick={() => onToggleTab('details')}
            >
                <Icon name="sliders" /> Details
            </button>
            {activeTab && (
                <button
                    type="button"
                    className="pn-mtab"
                    style={{ marginLeft: 'auto' }}
                    onClick={onCloseTab}
                    title="Collapse tab panel"
                >
                    <Icon name="x" />
                </button>
            )}
        </div>
    );
}
