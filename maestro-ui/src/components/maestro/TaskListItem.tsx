import React, { useState, useRef, useMemo, useCallback, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { MaestroTask, TaskStatus, TaskPriority, MaestroSessionStatus, DocEntry, WorkerStrategy, OrchestratorStrategy, AgentTool, ModelType, ClaudeModel, CodexModel } from "../../app/types/maestro";
import { useTaskSessions } from "../../hooks/useTaskSessions";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useSpacesStore } from "../../stores/useSpacesStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { maestroClient } from "../../utils/MaestroClient";

type TaskListItemProps = {
    task: MaestroTask;
    onSelect: () => void;
    onWorkOn: () => void;
    onWorkOnWithOverride?: (agentTool: AgentTool, model: ModelType) => void;
    onWorkOnWithTeamMember?: (teamMemberId: string, strategy?: WorkerStrategy | OrchestratorStrategy) => void;
    onAssignTeamMember?: (teamMemberId: string) => void;
    onOpenCreateTeamMember?: () => void;
    onJumpToSession: (maestroSessionId: string) => void;
    onNavigateToTask?: (taskId: string) => void;
    depth?: number;
    hasChildren?: boolean;
    isChildrenCollapsed?: boolean;
    isAddingSubtask?: boolean;
    onToggleChildrenCollapse?: () => void;
    onTogglePin?: () => void;
    selectionMode?: boolean;
    isSelected?: boolean;
    onToggleSelect?: () => void;
    showPermanentDelete?: boolean;
    isSessionTask?: boolean;
};

// Terminal-style status symbols
const STATUS_SYMBOLS: Record<TaskStatus, string> = {
    todo: "○",
    in_progress: "◉",
    in_review: "◎",
    completed: "✓",
    cancelled: "⊘",
    blocked: "✗",
    archived: "▫",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
    todo: "Todo",
    in_progress: "In Progress",
    in_review: "In Review",
    completed: "Completed",
    cancelled: "Cancelled",
    blocked: "Blocked",
    archived: "Archived",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
    low: "LOW",
    medium: "MED",
    high: "HIGH",
};

// Session status labels and symbols
const SESSION_STATUS_LABELS: Record<MaestroSessionStatus, string> = {
    spawning: "Spawning",
    idle: "Idle",
    working: "Working",
    completed: "Done",
    failed: "Failed",
    stopped: "Stopped",
};

const AGENT_TOOLS: { id: AgentTool; label: string; symbol: string; models: { id: ModelType; label: string }[] }[] = [
    {
        id: 'claude-code',
        label: 'Claude Code',
        symbol: '◈',
        models: [
            { id: 'haiku' as ClaudeModel, label: 'Haiku' },
            { id: 'sonnet' as ClaudeModel, label: 'Sonnet' },
            { id: 'sonnet[1m]' as ClaudeModel, label: 'Sonnet [1M]' },
            { id: 'opus' as ClaudeModel, label: 'Opus' },
            { id: 'opus[1m]' as ClaudeModel, label: 'Opus [1M]' },
        ],
    },
    {
        id: 'codex',
        label: 'Codex',
        symbol: '◇',
        models: [
            { id: 'gpt-5.2-codex' as CodexModel, label: 'GPT 5.2' },
            { id: 'gpt-5.3-codex' as CodexModel, label: 'GPT 5.3' },
        ],
    },
];

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export const TaskListItem = React.memo(function TaskListItem({
    task,
    onSelect,
    onWorkOn,
    onWorkOnWithOverride,
    onWorkOnWithTeamMember,
    onAssignTeamMember,
    onOpenCreateTeamMember,
    onJumpToSession,
    onNavigateToTask,
    depth = 0,
    hasChildren = false,
    isChildrenCollapsed = false,
    isAddingSubtask = false,
    onToggleChildrenCollapse,
    onTogglePin,
    selectionMode = false,
    isSelected = false,
    onToggleSelect,
    showPermanentDelete = false,
    isSessionTask = false,
}: TaskListItemProps) {
    const [isMetaExpanded, setIsMetaExpanded] = useState(false);
    const [taskDocs, setTaskDocs] = useState<DocEntry[]>(task.docs ?? []);
    const [docsLoaded, setDocsLoaded] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
    const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);
    const [showTeamMemberDropdown, setShowTeamMemberDropdown] = useState(false);
    const [isUpdatingTeamMember, setIsUpdatingTeamMember] = useState(false);
    const [showLaunchDropdown, setShowLaunchDropdown] = useState(false);
    const [expandedTool, setExpandedTool] = useState<AgentTool | null>(null);
    const [launchOverride, setLaunchOverride] = useState<{ agentTool: AgentTool; model: ModelType } | null>(null);
    const statusDropdownRef = useRef<HTMLDivElement>(null);
    const priorityDropdownRef = useRef<HTMLDivElement>(null);
    const teamMemberDropdownRef = useRef<HTMLDivElement>(null);
    const launchDropdownRef = useRef<HTMLDivElement>(null);
    const statusBtnRef = useRef<HTMLButtonElement>(null);
    const priorityBtnRef = useRef<HTMLButtonElement>(null);
    const teamMemberBtnRef = useRef<HTMLButtonElement>(null);
    const launchBtnRef = useRef<HTMLButtonElement>(null);
    const [statusDropdownPos, setStatusDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openDirection: 'down' | 'up' } | null>(null);
    const [priorityDropdownPos, setPriorityDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openDirection: 'down' | 'up' } | null>(null);
    const [teamMemberDropdownPos, setTeamMemberDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openDirection: 'down' | 'up' } | null>(null);

    const computeDropdownPos = useCallback((btnRef: React.RefObject<HTMLButtonElement | null>, estimatedHeight = 250) => {
        const btn = btnRef.current;
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        if (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove) {
            return { top: rect.bottom + 4, left: rect.left, openDirection: 'down' as const };
        } else {
            return { bottom: (window.innerHeight - rect.top) + 4, left: rect.left, openDirection: 'up' as const };
        }
    }, []);

    useLayoutEffect(() => {
        if (showStatusDropdown) {
            setStatusDropdownPos(computeDropdownPos(statusBtnRef));
        }
    }, [showStatusDropdown, computeDropdownPos]);

    useLayoutEffect(() => {
        if (showPriorityDropdown) {
            setPriorityDropdownPos(computeDropdownPos(priorityBtnRef));
        }
    }, [showPriorityDropdown, computeDropdownPos]);

    useLayoutEffect(() => {
        if (showTeamMemberDropdown) {
            setTeamMemberDropdownPos(computeDropdownPos(teamMemberBtnRef));
        }
    }, [showTeamMemberDropdown, computeDropdownPos]);

    const computeLaunchDropdownPos = useCallback(() => {
        const btn = launchBtnRef.current;
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Use left positioning (clamped so the dropdown doesn't overflow the viewport)
        const dropdownWidth = 180;
        let left = rect.left;
        if (left + dropdownWidth > window.innerWidth - 8) {
            left = window.innerWidth - dropdownWidth - 8;
        }

        if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
            return { top: rect.bottom + 4, left, openDirection: 'down' as const };
        } else {
            return { bottom: (window.innerHeight - rect.top) + 4, left, openDirection: 'up' as const };
        }
    }, []);

    const [launchDropdownPos, setLaunchDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openDirection: 'down' | 'up' } | null>(null);

    useLayoutEffect(() => {
        if (showLaunchDropdown) {
            setLaunchDropdownPos(computeLaunchDropdownPos());
        }
    }, [showLaunchDropdown, computeLaunchDropdownPos]);

    // Fetch task docs lazily when the meta panel is first expanded
    useEffect(() => {
        if (!isMetaExpanded || docsLoaded) return;
        maestroClient.getTaskDocs(task.id)
            .then((docs) => { setTaskDocs(docs); setDocsLoaded(true); })
            .catch(() => setDocsLoaded(true));
    }, [isMetaExpanded, docsLoaded, task.id]);

    // Sync if task.docs arrives via store update
    useEffect(() => {
        if (task.docs) {
            setTaskDocs(task.docs);
        }
    }, [task.docs]);

    const { sessions: taskSessions, loading: loadingSessions } = useTaskSessions(task.id);
    const tasks = useMaestroStore(s => s.tasks);
    const teamMembersMap = useMaestroStore(s => s.teamMembers);
    const openDocument = useSpacesStore(s => s.openDocument);
    const setActiveId = useSessionStore(s => s.setActiveId);
    const deleteTask = useMaestroStore(s => s.deleteTask);
    const updateTask = useMaestroStore(s => s.updateTask);

    const teamMembers = useMemo(() => Object.values(teamMembersMap), [teamMembersMap]);

    // Resolve effective team member IDs (prefer array, fallback to singular)
    const effectiveTeamMemberIds = useMemo(() =>
        task.teamMemberIds && task.teamMemberIds.length > 0
            ? task.teamMemberIds
            : task.teamMemberId ? [task.teamMemberId] : [],
        [task.teamMemberIds, task.teamMemberId]
    );

    const assignedTeamMembers = useMemo(() =>
        effectiveTeamMemberIds.map(id => teamMembersMap[id]).filter(Boolean) as typeof teamMembers,
        [effectiveTeamMemberIds, teamMembersMap]
    );

    const assignedTeamMember = assignedTeamMembers.length > 0 ? assignedTeamMembers[0] : undefined;
    const effectiveModel = launchOverride?.model || assignedTeamMember?.model || null;
    const isSubtask = task.parentId !== null;

    // For subtasks, also fetch parent task sessions
    const parentTask = isSubtask && task.parentId ? tasks[task.parentId] : null;
    const { sessions: parentSessions, loading: loadingParentSessions } = useTaskSessions(parentTask?.id);

    const allSessions = useMemo(() => {
        const sessionMap = new Map<string, typeof taskSessions[0]>();
        taskSessions.forEach(session => sessionMap.set(session.id, session));
        if (isSubtask && parentSessions) {
            parentSessions.forEach(session => {
                if (!sessionMap.has(session.id)) {
                    sessionMap.set(session.id, session);
                }
            });
        }
        return Array.from(sessionMap.values());
    }, [taskSessions, parentSessions, isSubtask]);

    const sessionCount = allSessions.length;
    const subtaskCount = Object.values(tasks).filter(t => t.parentId === task.id).length;

    const totalDescendantCount = useMemo(() => {
        const countDescendants = (parentId: string): number => {
            const children = Object.values(tasks).filter(t => t.parentId === parentId);
            return children.reduce((sum, child) => sum + 1 + countDescendants(child.id), 0);
        };
        return countDescendants(task.id);
    }, [tasks, task.id]);

    const handleDeleteTask = async () => {
        setShowDeleteConfirm(true);
    };

    const confirmDeleteTask = async () => {
        setIsDeleting(true);
        try {
            await deleteTask(task.id);
            setShowDeleteConfirm(false);
        } catch (error) {
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRadioStatusClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const newStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
        try {
            await updateTask(task.id, { status: newStatus });
        } catch (error) {
            // silent
        }
    };

    const handleInlineStatusChange = async (newStatus: TaskStatus) => {
        if (newStatus === task.status) {
            setShowStatusDropdown(false);
            return;
        }
        setIsUpdatingStatus(true);
        try {
            await updateTask(task.id, { status: newStatus });
            setShowStatusDropdown(false);
        } catch (error) {
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const statusOptions: TaskStatus[] = ["todo", "in_progress", "in_review", "completed", "cancelled", "blocked", "archived"];
    const priorityOptions: TaskPriority[] = ["high", "medium", "low"];

    const handleInlinePriorityChange = async (newPriority: TaskPriority) => {
        if (newPriority === task.priority) {
            setShowPriorityDropdown(false);
            return;
        }
        setIsUpdatingPriority(true);
        try {
            await updateTask(task.id, { priority: newPriority });
            setShowPriorityDropdown(false);
        } catch (error) {
        } finally {
            setIsUpdatingPriority(false);
        }
    };

    const handleInlineTeamMemberToggle = async (teamMemberId: string) => {
        const currentIds = effectiveTeamMemberIds;
        const isAlreadySelected = currentIds.includes(teamMemberId);
        const newIds = isAlreadySelected
            ? currentIds.filter(id => id !== teamMemberId)
            : [...currentIds, teamMemberId];

        setIsUpdatingTeamMember(true);
        try {
            await updateTask(task.id, {
                teamMemberIds: newIds.length > 0 ? newIds : undefined,
                teamMemberId: newIds.length === 1 ? newIds[0] : undefined,
            });
            setLaunchOverride(null);
        } catch (error) {
        } finally {
            setIsUpdatingTeamMember(false);
        }
    };

    const handleSubtaskAction = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleChildrenCollapse?.();
    };

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
            className={`terminalTaskRow terminalTaskRow--${task.status} ${isSubtask ? 'terminalTaskRow--subtask' : ''} ${showStatusDropdown || showPriorityDropdown || showTeamMemberDropdown ? 'terminalTaskRow--dropdownOpen' : ''} ${selectionMode ? 'terminalTaskRow--selectable' : ''} ${isSessionTask ? 'terminalTaskRow--sessionActive' : ''}`}
            draggable
            onDragStart={handleDragStart}
        >
            {/* Single-line main row */}
            <div className="terminalTaskMain">
                {/* Selection checkbox for execution mode */}
                {selectionMode && (
                    <label className="terminalTaskCheckbox" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect?.()}
                        />
                        <span className={`terminalTaskCheckmark ${isSelected ? 'terminalTaskCheckmark--checked' : ''}`}>
                            {isSelected ? '✓' : ''}
                        </span>
                    </label>
                )}

                {/* Subtask arrow (leftmost) */}
                <button type="button"
                    className={`terminalTaskSubtaskArrow ${hasChildren ? (isChildrenCollapsed ? 'terminalTaskSubtaskArrow--collapsed' : 'terminalTaskSubtaskArrow--expanded') : (isAddingSubtask ? 'terminalTaskSubtaskArrow--adding' : 'terminalTaskSubtaskArrow--empty')}`}
                    onClick={handleSubtaskAction}
                    title={hasChildren ? (isChildrenCollapsed ? `Expand ${subtaskCount} subtasks` : `Collapse subtasks`) : "Add subtask"}
                >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M6 4l4 4-4 4" />
                    </svg>
                    {subtaskCount > 0 && (
                        <span className="terminalTaskSubtaskArrow__count">{subtaskCount}</span>
                    )}
                </button>

                {/* Radio status button */}
                <button type="button"
                    className={`terminalTaskRadioStatus terminalTaskRadioStatus--${task.status}`}
                    onClick={handleRadioStatusClick}
                    title={`${STATUS_LABELS[task.status]} — click to toggle complete`}
                >
                    {STATUS_SYMBOLS[task.status]}
                </button>

                {/* Title — clickable to open overlay */}
                <span
                    className="terminalTaskTitle terminalTaskTitle--clickable"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                    }}
                    title={task.title || "Untitled"}
                    style={!task.title ? { opacity: 0.5, fontStyle: 'italic' } : undefined}
                >
                    {task.title || "Untitled"}
                </span>

                {/* Doc count badge */}
                {taskDocs.length > 0 && (
                    <span
                        className="terminalTaskDocBadge"
                        title={`${taskDocs.length} doc${taskDocs.length !== 1 ? 's' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMetaExpanded(true);
                        }}
                    >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                            <path d="M10 2v4h4" />
                            <path d="M6 9h5M6 12h3" />
                        </svg>
                        {taskDocs.length}
                    </span>
                )}

                {/* Right-side action buttons */}
                <div className="terminalTaskActions">
                    {/* Play button */}
                    <button type="button"
                        className="terminalTaskPlayBtn"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (launchOverride) {
                                onWorkOnWithOverride?.(launchOverride.agentTool, launchOverride.model);
                            } else {
                                onWorkOn();
                            }
                        }}
                        title={launchOverride ? `Run with ${launchOverride.model}` : "Run task"}
                    >
                        ▶
                    </button>

                    {/* Session status indicator / Expand meta button */}
                    {(() => {
                        const statuses = Object.values(task.taskSessionStatuses || {});
                        const hasCompleted = statuses.includes('completed');
                        const hasFailed = statuses.includes('failed');
                        const hasWorking = statuses.includes('working');

                        if (hasCompleted || hasFailed || hasWorking) {
                            return (
                                <button type="button"
                                    className={`terminalTaskSessionIndicator ${hasCompleted ? 'terminalTaskSessionIndicator--completed' : hasFailed ? 'terminalTaskSessionIndicator--failed' : 'terminalTaskSessionIndicator--working'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMetaExpanded(!isMetaExpanded);
                                    }}
                                    title={hasCompleted ? "Session completed task" : hasFailed ? "Session failed task" : "Session working on task"}
                                >
                                    {hasCompleted ? '✓' : hasFailed ? '✗' : '◉'}
                                </button>
                            );
                        }

                        return (
                            <button type="button"
                                className={`terminalTaskExpandBtn ${isMetaExpanded ? 'terminalTaskExpandBtn--open' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMetaExpanded(!isMetaExpanded);
                                }}
                                title={isMetaExpanded ? "Collapse details" : "Expand details"}
                            >
                                ▾
                            </button>
                        );
                    })()}
                </div>
            </div>

            {/* Expanded meta panel */}
            {isMetaExpanded && (
                <div className="terminalTaskMetaExpanded" onClick={(e) => e.stopPropagation()}>
                    {/* Row 1: Status + Priority + Time */}
                    <div className="terminalTaskMetaRow">
                        <div className="terminalInlineStatusPicker" ref={statusDropdownRef}>
                            <button type="button"
                                ref={statusBtnRef}
                                className={`terminalMetaBadge terminalMetaBadge--status terminalMetaBadge--status-${task.status} terminalMetaBadge--clickable ${showStatusDropdown ? 'terminalMetaBadge--open' : ''} ${isUpdatingStatus ? 'terminalMetaBadge--updating' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isUpdatingStatus) setShowStatusDropdown(!showStatusDropdown);
                                }}
                                disabled={isUpdatingStatus}
                                title="Click to change status"
                            >
                                {isUpdatingStatus ? (
                                    <span className="terminalStatusSpinner">⟳</span>
                                ) : (
                                    <>
                                        {STATUS_SYMBOLS[task.status]} {STATUS_LABELS[task.status]}
                                        <span className="terminalMetaBadgeCaret">{showStatusDropdown ? '▴' : '▾'}</span>
                                    </>
                                )}
                            </button>
                            {showStatusDropdown && !isUpdatingStatus && statusDropdownPos && createPortal(
                                <>
                                    <div className="terminalInlineStatusOverlay" onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); }} />
                                    <div
                                        className={`terminalInlineStatusDropdown terminalInlineStatusDropdown--fixed ${statusDropdownPos.openDirection === 'up' ? 'terminalInlineDropdown--openUp' : ''}`}
                                        style={{
                                            ...(statusDropdownPos.openDirection === 'down' ? { top: statusDropdownPos.top } : { bottom: statusDropdownPos.bottom }),
                                            left: statusDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {statusOptions.map((status) => (
                                            <button type="button"
                                                key={status}
                                                className={`terminalInlineStatusOption terminalInlineStatusOption--${status} ${status === task.status ? 'terminalInlineStatusOption--current' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleInlineStatusChange(status); }}
                                            >
                                                <span className="terminalStatusSymbol">{STATUS_SYMBOLS[status]}</span>
                                                <span className="terminalStatusLabel">{STATUS_LABELS[status]}</span>
                                                {status === task.status && <span className="terminalStatusCheck">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <div className="terminalInlinePriorityPicker" ref={priorityDropdownRef}>
                            <button type="button"
                                ref={priorityBtnRef}
                                className={`terminalMetaBadge terminalMetaBadge--priority terminalMetaBadge--priority-${task.priority} terminalMetaBadge--clickable ${showPriorityDropdown ? 'terminalMetaBadge--open' : ''} ${isUpdatingPriority ? 'terminalMetaBadge--updating' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isUpdatingPriority) setShowPriorityDropdown(!showPriorityDropdown);
                                }}
                                disabled={isUpdatingPriority}
                                title="Click to change priority"
                            >
                                {isUpdatingPriority ? (
                                    <span className="terminalStatusSpinner">⟳</span>
                                ) : (
                                    <>
                                        {PRIORITY_LABELS[task.priority]}
                                        <span className="terminalMetaBadgeCaret">{showPriorityDropdown ? '▴' : '▾'}</span>
                                    </>
                                )}
                            </button>
                            {showPriorityDropdown && !isUpdatingPriority && priorityDropdownPos && createPortal(
                                <>
                                    <div className="terminalInlineStatusOverlay" onClick={(e) => { e.stopPropagation(); setShowPriorityDropdown(false); }} />
                                    <div
                                        className={`terminalInlinePriorityDropdown terminalInlinePriorityDropdown--fixed ${priorityDropdownPos.openDirection === 'up' ? 'terminalInlineDropdown--openUp' : ''}`}
                                        style={{
                                            ...(priorityDropdownPos.openDirection === 'down' ? { top: priorityDropdownPos.top } : { bottom: priorityDropdownPos.bottom }),
                                            left: priorityDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {priorityOptions.map((priority) => (
                                            <button type="button"
                                                key={priority}
                                                className={`terminalInlinePriorityOption terminalInlinePriorityOption--${priority} ${priority === task.priority ? 'terminalInlinePriorityOption--current' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleInlinePriorityChange(priority); }}
                                            >
                                                <span className="terminalPriorityLabel">{PRIORITY_LABELS[priority]}</span>
                                                {priority === task.priority && <span className="terminalStatusCheck">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <div className="terminalInlineTeamMemberPicker" ref={teamMemberDropdownRef}>
                            <button type="button"
                                ref={teamMemberBtnRef}
                                className={`terminalMetaBadge terminalMetaBadge--agent terminalMetaBadge--clickable ${showTeamMemberDropdown ? 'terminalMetaBadge--open' : ''} ${isUpdatingTeamMember ? 'terminalMetaBadge--updating' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowTeamMemberDropdown(!showTeamMemberDropdown);
                                }}
                                title={assignedTeamMembers.length > 0
                                    ? assignedTeamMembers.map(m => m.name).join(', ')
                                    : "Click to assign team members"
                                }
                            >
                                {assignedTeamMembers.length > 1 ? (
                                    <>{assignedTeamMembers.map(m => m.avatar).join('')} {assignedTeamMembers.length}</>
                                ) : assignedTeamMember ? (
                                    <>{assignedTeamMember.avatar} {assignedTeamMember.name}</>
                                ) : (
                                    <>👤 Assign</>
                                )}
                                <span className="terminalMetaBadgeCaret">{showTeamMemberDropdown ? '▴' : '▾'}</span>
                            </button>
                            {showTeamMemberDropdown && teamMemberDropdownPos && createPortal(
                                <>
                                    <div className="terminalInlineStatusOverlay" onClick={(e) => { e.stopPropagation(); setShowTeamMemberDropdown(false); }} />
                                    <div
                                        className={`terminalInlineTeamMemberDropdown terminalInlineTeamMemberDropdown--fixed ${teamMemberDropdownPos.openDirection === 'up' ? 'terminalInlineDropdown--openUp' : ''}`}
                                        style={{
                                            ...(teamMemberDropdownPos.openDirection === 'down' ? { top: teamMemberDropdownPos.top } : { bottom: teamMemberDropdownPos.bottom }),
                                            left: teamMemberDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {teamMembers.filter(m => m.status === 'active' && m.projectId === task.projectId).map((member) => {
                                            const isSel = effectiveTeamMemberIds.includes(member.id);
                                            return (
                                                <button type="button"
                                                    key={member.id}
                                                    className={`terminalInlineTeamMemberOption ${isSel ? 'terminalInlineTeamMemberOption--current' : ''} ${isUpdatingTeamMember ? 'terminalInlineTeamMemberOption--disabled' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); if (!isUpdatingTeamMember) handleInlineTeamMemberToggle(member.id); }}
                                                    disabled={isUpdatingTeamMember}
                                                >
                                                    <span className="terminalTeamMemberAvatar">{member.avatar}</span>
                                                    <span className="terminalTeamMemberLabel">{member.name}</span>
                                                    {isSel && <span className="terminalStatusCheck">✓</span>}
                                                </button>
                                            );
                                        })}
                                        {onOpenCreateTeamMember && (
                                            <button type="button"
                                                className="terminalInlineTeamMemberOption terminalInlineTeamMemberOption--create"
                                                onClick={(e) => { e.stopPropagation(); setShowTeamMemberDropdown(false); onOpenCreateTeamMember(); }}
                                            >
                                                <span className="terminalTeamMemberAvatar">+</span>
                                                <span className="terminalTeamMemberLabel">New Member</span>
                                            </button>
                                        )}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <div className="terminalSplitPlay terminalSplitPlay--meta" ref={launchDropdownRef}>
                            <button type="button"
                                ref={launchBtnRef}
                                className={`terminalMetaBadge terminalMetaBadge--model terminalMetaBadge--clickable ${launchOverride ? 'terminalMetaBadge--model-override' : ''} ${showLaunchDropdown ? 'terminalMetaBadge--open' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowLaunchDropdown(!showLaunchDropdown);
                                    setExpandedTool(null);
                                }}
                                title={effectiveModel ? `Model: ${effectiveModel}` : 'No model set'}
                            >
                                {effectiveModel || 'default'}
                                <span className="terminalMetaBadgeCaret">{showLaunchDropdown ? '▴' : '▾'}</span>
                            </button>
                            {showLaunchDropdown && launchDropdownPos && createPortal(
                                <>
                                    <div className="terminalInlineStatusOverlay" onClick={(e) => { e.stopPropagation(); setShowLaunchDropdown(false); }} />
                                    <div
                                        className={`terminalLaunchDropdown terminalLaunchDropdown--fixed ${launchDropdownPos.openDirection === 'up' ? 'terminalInlineDropdown--openUp' : ''}`}
                                        style={{
                                            ...(launchDropdownPos.openDirection === 'down' ? { top: launchDropdownPos.top } : { bottom: launchDropdownPos.bottom }),
                                            left: launchDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="terminalLaunchDropdown__header">Launch With</div>
                                        {AGENT_TOOLS.map((tool) => (
                                            <div key={tool.id} className="terminalLaunchDropdown__toolGroup">
                                                <button type="button"
                                                    className={`terminalLaunchDropdown__tool ${expandedTool === tool.id ? 'terminalLaunchDropdown__tool--expanded' : ''}`}
                                                    onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
                                                >
                                                    <span className="terminalLaunchDropdown__toolSymbol">{tool.symbol}</span>
                                                    <span className="terminalLaunchDropdown__toolLabel">{tool.label}</span>
                                                    <span className="terminalLaunchDropdown__toolCaret">{expandedTool === tool.id ? '▴' : '▸'}</span>
                                                </button>
                                                {expandedTool === tool.id && (
                                                    <div className="terminalLaunchDropdown__models">
                                                        {tool.models.map((model) => (
                                                            <button type="button"
                                                                key={model.id}
                                                                className={`terminalLaunchDropdown__model ${launchOverride?.model === model.id && launchOverride?.agentTool === tool.id ? 'terminalLaunchDropdown__model--selected' : ''}`}
                                                                onClick={() => {
                                                                    setShowLaunchDropdown(false);
                                                                    setLaunchOverride({ agentTool: tool.id, model: model.id });
                                                                }}
                                                            >
                                                                {model.label}
                                                                {launchOverride?.model === model.id && launchOverride?.agentTool === tool.id && (
                                                                    <span className="terminalStatusCheck"> ✓</span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <button
                            type="button"
                            className={`terminalDangerousToggle ${task.dangerousMode ? 'terminalDangerousToggle--on' : ''}`}
                            title={task.dangerousMode ? 'Dangerous mode ON — click to disable' : 'Enable dangerous mode (bypass permissions)'}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateTask(task.id, { dangerousMode: !task.dangerousMode });
                            }}
                        >
                            {task.dangerousMode ? '\u26A0 YOLO' : '\uD83D\uDEE1\uFE0F'}
                        </button>

                        <button
                            type="button"
                            className={`terminalWorktreeToggle ${task.useWorktree ? 'terminalWorktreeToggle--on' : ''}`}
                            title={task.useWorktree ? 'Git worktree ON — click to disable' : 'Enable git worktree isolation'}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateTask(task.id, { useWorktree: !task.useWorktree });
                            }}
                        >
                            {task.useWorktree ? '🌿 worktree' : '📁'}
                        </button>

                        <span className="terminalTaskMetaFill" />
                        <span className="terminalTimeAgo">{formatTimeAgo(task.updatedAt)}</span>
                    </div>

                    {/* Sessions row (only if has sessions) */}
                    {sessionCount > 0 && (
                        <div className="terminalTaskMetaRow">
                            <div className="terminalSessionStatuses">
                                {allSessions.slice(0, 3).map(session => {
                                    const taskStatus = task.taskSessionStatuses?.[session.id];
                                    const sessionIsTerminal = ['stopped', 'completed', 'failed'].includes(session.status);
                                    const displayStatus = sessionIsTerminal ? session.status : (taskStatus || session.status);
                                    const taskIsTerminal = task.status === 'completed' || task.status === 'cancelled';
                                    const isWorking = !taskIsTerminal && displayStatus === 'working';
                                    const sessionNeedsInput = !taskIsTerminal && session.needsInput?.active;
                                    return (
                                        <span
                                            key={session.id}
                                            className={`terminalSessionStatusChip terminalSessionStatusChip--${taskIsTerminal ? 'completed' : displayStatus} terminalSessionStatusChip--clickable ${isWorking && !sessionNeedsInput ? 'terminalSessionStatusChip--breathing' : ''} ${sessionNeedsInput ? 'terminalSessionStatusChip--needsInput' : ''}`}
                                            title={`${session.name || session.id}: ${displayStatus}`}
                                        >
                                            <span className="terminalSessionStatusLabel">
                                                {taskIsTerminal ? 'DONE' : sessionNeedsInput ? 'NEEDS INPUT' : taskStatus ? taskStatus.toUpperCase().replace('_', ' ') : (SESSION_STATUS_LABELS[session.status] || session.status || 'UNKNOWN').toUpperCase()}
                                            </span>
                                        </span>
                                    );
                                })}
                                {allSessions.length > 3 && (
                                    <span className="terminalSessionMore">+{allSessions.length - 3}</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Docs row (only if task has docs) */}
                    {taskDocs.length > 0 && (
                        <div className="terminalTaskMetaRow terminalTaskDocsRow">
                            <div className="terminalTaskDocsList">
                                {taskDocs.map(doc => {
                                    const ext = doc.filePath.split('.').pop()?.toLowerCase() || '';
                                    const isMarkdown = ['md', 'mdx', 'markdown'].includes(ext);
                                    return (
                                        <button type="button"
                                            key={doc.id}
                                            className="terminalTaskDocItem"
                                            title={doc.filePath}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const spaceId = openDocument(task.projectId, doc);
                                                setActiveId(spaceId);
                                            }}
                                        >
                                            <span className="terminalTaskDocItemIcon">
                                                {isMarkdown ? 'M↓' : '{ }'}
                                            </span>
                                            <span className="terminalTaskDocItemTitle">{doc.title}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showDeleteConfirm && createPortal(
                <ConfirmActionModal
                    isOpen={showDeleteConfirm}
                    title="[ DELETE TASK ]"
                    message={
                        totalDescendantCount > 0
                            ? <>Are you sure you want to delete <strong>"{task.title}"</strong>? This task has <strong>{totalDescendantCount} subtask{totalDescendantCount !== 1 ? 's' : ''}</strong> that will also be deleted.</>
                            : <>Are you sure you want to delete <strong>"{task.title}"</strong>?</>
                    }
                    confirmLabel={totalDescendantCount > 0 ? `Delete All (${totalDescendantCount + 1})` : "Delete"}
                    cancelLabel="Cancel"
                    confirmDanger
                    busy={isDeleting}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={confirmDeleteTask}
                />,
                document.body
            )}
        </div>
    );
});
