import React, { useState, useRef, useMemo, useCallback, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { MaestroTask, TaskStatus, TaskPriority, MaestroSessionStatus, DocEntry, WorkerStrategy, OrchestratorStrategy, AgentTool, LaunchConfig } from "../../app/types/maestro";
import { formatLaunchConfigLabel, getAgentToolForLaunchConfig, pickTopMember } from "../../app/constants/agentTools";
import { useTaskSessions } from "../../hooks/useTaskSessions";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useSpacesStore } from "../../stores/useSpacesStore";
import { useUIStore } from "../../stores/useUIStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { maestroClient } from "../../utils/MaestroClient";
import { isDiagramDoc } from "../../utils/docHelpers";
import { LaunchConfigDropdown } from "./LaunchConfigDropdown";
import { Icon, Glyph, Avatar, Avatars } from "./redesign/kit";

type TaskListItemProps = {
    task: MaestroTask;
    onSelect: () => void;
    onWorkOn: () => void;
    onWorkOnWithOverride?: (launchConfig: LaunchConfig) => void;
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
    const [launchOverride, setLaunchOverride] = useState<LaunchConfig | null>(null);
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
        const menuWidth = Math.min(540, window.innerWidth - 16);
        const menuHeight = Math.min(460, window.innerHeight - 16);
        const gap = 8;
        const rightSpace = window.innerWidth - rect.right;
        const leftSpace = rect.left;
        let left = rightSpace >= menuWidth + gap
            ? rect.right + gap
            : leftSpace >= menuWidth + gap
                ? rect.left - menuWidth - gap
                : Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
        const top = Math.min(Math.max(8, rect.top - 12), window.innerHeight - menuHeight - 8);
        return { top, left, openDirection: 'side' as const };
    }, []);

    const [launchDropdownPos, setLaunchDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openDirection: 'down' | 'up' | 'side' } | null>(null);

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
    const createWhiteboard = useSpacesStore(s => s.createWhiteboard);
    const setActiveId = useSessionStore(s => s.setActiveId);
    const setDocOverlay = useUIStore(s => s.setDocOverlay);
    const [isCreatingDiagram, setIsCreatingDiagram] = useState(false);
    const deleteTask = useMaestroStore(s => s.deleteTask);
    const updateTask = useMaestroStore(s => s.updateTask);

    const markdownDocs = useMemo(() => taskDocs.filter(d => !isDiagramDoc(d)), [taskDocs]);
    const diagramDocs = useMemo(() => taskDocs.filter(d => isDiagramDoc(d)), [taskDocs]);

    const handleCreateDiagram = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCreatingDiagram) return;
        setIsCreatingDiagram(true);
        try {
            const title = `Diagram ${new Date().toLocaleDateString()}`;
            const sessionId = task.sessionIds?.[0];
            if (!sessionId) return;
            const doc = await maestroClient.addTaskDoc(task.id, sessionId, title, '{}', 'diagram');
            setTaskDocs(prev => [...prev, doc]);
            setDocOverlay(doc);
        } catch {
            // best-effort
        } finally {
            setIsCreatingDiagram(false);
        }
    }, [isCreatingDiagram, task.id, task.projectId, task.sessionIds, setDocOverlay]);

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

    // Mirror the server: the "top" member (most-powerful model) is what launches,
    // not simply the first assigned. Keeps the badge consistent with the spawn.
    const assignedTeamMember = pickTopMember(assignedTeamMembers);
    const effectiveModel = launchOverride?.model || assignedTeamMember?.model || null;
    const effectiveModelLabel = launchOverride
        ? formatLaunchConfigLabel(launchOverride)
        : (effectiveModel || 'default');
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

    const isCancelled = task.status === 'cancelled';
    const isCompleted = task.status === 'completed';

    return (
        <div
            className={`pn-tt ${isCompleted ? 'pn-tt--completed' : ''} ${isSessionTask ? 'pn-tt--active' : ''}`}
            draggable
            onDragStart={handleDragStart}
        >
            {/* Single-line main row */}
            <div className="pn-tt__main">
                {/* Selection checkbox for execution mode */}
                {selectionMode && (
                    <label
                        className={`pn-tt__check ${isSelected ? 'pn-tt__check--on' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect?.()}
                            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                        />
                        {isSelected && <Icon name="check" size={10} sw={2.2} />}
                    </label>
                )}

                {/* Subtask arrow (leftmost) */}
                <button type="button"
                    className={`pn-tt__arrow ${hasChildren ? (isChildrenCollapsed ? '' : 'pn-tt__arrow--expanded') : 'pn-tt__arrow--empty'}`}
                    onClick={handleSubtaskAction}
                    title={hasChildren ? (isChildrenCollapsed ? `Expand ${subtaskCount} subtasks` : `Collapse subtasks`) : "Add subtask"}
                >
                    <Icon name="chevronR" />
                </button>
                {subtaskCount > 0 && (
                    <span className="pn-tt__arrowCount">{subtaskCount}</span>
                )}

                {/* Radio status button */}
                <button type="button"
                    className="pn-tt__status"
                    onClick={handleRadioStatusClick}
                    title={`${STATUS_LABELS[task.status]} — click to toggle complete`}
                >
                    <Glyph kind={task.status} size={16} />
                </button>

                {/* Title — clickable to open overlay */}
                <span
                    className={`pn-tt__title ${!task.title ? 'pn-tt__title--untitled' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                    }}
                    title={task.title || "Untitled"}
                    style={isCancelled ? { textDecoration: 'line-through', color: 'var(--pn-ink-3)' } : undefined}
                >
                    {task.title || "Untitled"}
                </span>

                {isSessionTask && (
                    <span className="pn-tt__activedot" title="Current session is on this task" />
                )}

                {/* Collapsed inline summary: priority, assignees, doc count */}
                <div className="pn-tt__inline">
                    <span className={`pn-tag pn-tag--${task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'med' : 'low'}`}>
                        {task.priority === 'medium' ? 'med' : task.priority}
                    </span>
                    {assignedTeamMembers.length > 0 && (
                        <span style={{ display: 'inline-flex' }} title={assignedTeamMembers.map(m => m.name).join(', ')}>
                            <Avatars list={assignedTeamMembers.map(m => ({ initial: m.avatar, name: m.name, color: 'var(--pn-ink)' }))} />
                        </span>
                    )}
                    {taskDocs.length > 0 && (
                        <span
                            className="pn-mini"
                            title={`${taskDocs.length} doc${taskDocs.length !== 1 ? 's' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMetaExpanded(true);
                            }}
                        >
                            <Icon name="doc" size={12} />
                            {taskDocs.length}
                        </span>
                    )}
                </div>

                {/* Right-side action buttons */}
                <div className="pn-tt__actions">
                    {/* Play button */}
                    <button type="button"
                        className="pn-tt__run"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (launchOverride) {
                                onWorkOnWithOverride?.(launchOverride);
                            } else {
                                onWorkOn();
                            }
                        }}
                        title={launchOverride ? `Run with ${formatLaunchConfigLabel(launchOverride)}` : "Run task"}
                    >
                        <Icon name="play" />
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
                                    className={`pn-tt__ind ${hasCompleted ? 'pn-tt__ind--completed' : hasFailed ? 'pn-tt__ind--failed' : 'pn-tt__ind--working'}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMetaExpanded(!isMetaExpanded);
                                    }}
                                    title={hasCompleted ? "Session completed task" : hasFailed ? "Session failed task" : "Session working on task"}
                                >
                                    <Glyph kind={hasCompleted ? 'completed' : hasFailed ? 'failed' : 'working'} size={14} />
                                </button>
                            );
                        }

                        return (
                            <button type="button"
                                className={`pn-tt__ind ${isMetaExpanded ? 'pn-tt__ind--open' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMetaExpanded(!isMetaExpanded);
                                }}
                                title={isMetaExpanded ? "Collapse details" : "Expand details"}
                            >
                                <Icon name="chevronD" />
                            </button>
                        );
                    })()}
                </div>
            </div>

            {/* Expanded meta panel */}
            {isMetaExpanded && (
                <div className="pn-tt__meta" onClick={(e) => e.stopPropagation()}>
                    {/* Row 1: Status + Priority + Agent + Model */}
                    <div className="pn-tt__metarow">
                        <div ref={statusDropdownRef} style={{ display: 'inline-flex' }}>
                            <button type="button"
                                ref={statusBtnRef}
                                className={`pn-badge pn-badge--btn pn-badge--status-${task.status}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isUpdatingStatus) setShowStatusDropdown(!showStatusDropdown);
                                }}
                                disabled={isUpdatingStatus}
                                title="Click to change status"
                            >
                                {isUpdatingStatus ? (
                                    <span className="pn-stat">⟳</span>
                                ) : (
                                    <>
                                        <Glyph kind={task.status} size={12} /> {STATUS_LABELS[task.status]}
                                        <Icon name="chevronD" size={9} className="pn-badge__caret" />
                                    </>
                                )}
                            </button>
                            {showStatusDropdown && !isUpdatingStatus && statusDropdownPos && createPortal(
                                <>
                                    <div className="pn-pop-ov" onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(false); }} />
                                    <div
                                        className="pn-pop"
                                        style={{
                                            ...(statusDropdownPos.openDirection === 'down' ? { top: statusDropdownPos.top } : { bottom: statusDropdownPos.bottom }),
                                            left: statusDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {statusOptions.map((status) => (
                                            <button type="button"
                                                key={status}
                                                className={`pn-opt ${status === task.status ? 'pn-opt--cur' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleInlineStatusChange(status); }}
                                            >
                                                <Glyph kind={status} size={14} />
                                                <span>{STATUS_LABELS[status]}</span>
                                                {status === task.status && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                                            </button>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <div ref={priorityDropdownRef} style={{ display: 'inline-flex' }}>
                            <button type="button"
                                ref={priorityBtnRef}
                                className={`pn-badge pn-badge--btn ${task.priority === 'high' ? 'pn-badge--prio-high' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isUpdatingPriority) setShowPriorityDropdown(!showPriorityDropdown);
                                }}
                                disabled={isUpdatingPriority}
                                title="Click to change priority"
                            >
                                {isUpdatingPriority ? (
                                    <span className="pn-stat">⟳</span>
                                ) : (
                                    <>
                                        {PRIORITY_LABELS[task.priority]}
                                        <Icon name="chevronD" size={9} className="pn-badge__caret" />
                                    </>
                                )}
                            </button>
                            {showPriorityDropdown && !isUpdatingPriority && priorityDropdownPos && createPortal(
                                <>
                                    <div className="pn-pop-ov" onClick={(e) => { e.stopPropagation(); setShowPriorityDropdown(false); }} />
                                    <div
                                        className="pn-pop"
                                        style={{
                                            ...(priorityDropdownPos.openDirection === 'down' ? { top: priorityDropdownPos.top } : { bottom: priorityDropdownPos.bottom }),
                                            left: priorityDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {priorityOptions.map((priority) => (
                                            <button type="button"
                                                key={priority}
                                                className={`pn-opt ${priority === task.priority ? 'pn-opt--cur' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleInlinePriorityChange(priority); }}
                                            >
                                                <span>{PRIORITY_LABELS[priority]}</span>
                                                {priority === task.priority && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                                            </button>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <div ref={teamMemberDropdownRef} style={{ display: 'inline-flex' }}>
                            <button type="button"
                                ref={teamMemberBtnRef}
                                className="pn-badge pn-badge--btn"
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
                                    <><Avatars list={assignedTeamMembers.map(m => ({ initial: m.avatar, name: m.name, color: 'var(--pn-ink)' }))} /> {assignedTeamMembers.length} members</>
                                ) : assignedTeamMember ? (
                                    <><Avatar a={{ initial: assignedTeamMember.avatar, name: assignedTeamMember.name, color: 'var(--pn-ink)' }} /> {assignedTeamMember.name}</>
                                ) : (
                                    <><Icon name="users" size={12} /> Assign</>
                                )}
                                <Icon name="chevronD" size={9} className="pn-badge__caret" />
                            </button>
                            {showTeamMemberDropdown && teamMemberDropdownPos && createPortal(
                                <>
                                    <div className="pn-pop-ov" onClick={(e) => { e.stopPropagation(); setShowTeamMemberDropdown(false); }} />
                                    <div
                                        className="pn-pop"
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
                                                    className={`pn-opt ${isSel ? 'pn-opt--cur' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); if (!isUpdatingTeamMember) handleInlineTeamMemberToggle(member.id); }}
                                                    disabled={isUpdatingTeamMember}
                                                >
                                                    <Avatar a={{ initial: member.avatar, name: member.name, color: 'var(--pn-ink)' }} />
                                                    <span>{member.name}</span>
                                                    {isSel && <Icon name="check" size={12} sw={2} className="pn-opt__chk" />}
                                                </button>
                                            );
                                        })}
                                        {onOpenCreateTeamMember && (
                                            <button type="button"
                                                className="pn-opt"
                                                onClick={(e) => { e.stopPropagation(); setShowTeamMemberDropdown(false); onOpenCreateTeamMember(); }}
                                            >
                                                <span className="pn-av"><Icon name="plus" size={12} /></span>
                                                <span>New Member</span>
                                            </button>
                                        )}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        <div ref={launchDropdownRef} style={{ display: 'inline-flex' }}>
                            <button type="button"
                                ref={launchBtnRef}
                                className={`pn-badge pn-badge--btn pn-badge--model ${launchOverride ? 'is-override' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const willOpen = !showLaunchDropdown;
                                    setShowLaunchDropdown(willOpen);
                                    if (willOpen) {
                                        setExpandedTool(getAgentToolForLaunchConfig(launchOverride || undefined) || 'claude-code');
                                    }
                                }}
                                title={effectiveModel ? `Model: ${effectiveModelLabel}` : 'No model set'}
                            >
                                {effectiveModelLabel}
                                <Icon name="chevronD" size={9} className="pn-badge__caret" />
                            </button>
                            {showLaunchDropdown && launchDropdownPos && createPortal(
                                <>
                                    <div className="pn-pop-ov" onClick={(e) => { e.stopPropagation(); setShowLaunchDropdown(false); }} />
                                    <div
                                        style={{
                                            position: 'fixed',
                                            zIndex: 81,
                                            background: 'var(--pn-card)',
                                            border: '1px solid var(--pn-line-2)',
                                            borderRadius: 'var(--pn-r-md)',
                                            boxShadow: 'var(--pn-sh-pop)',
                                            overflow: 'hidden',
                                            ...(launchDropdownPos.openDirection === 'side'
                                                ? { top: launchDropdownPos.top }
                                                : launchDropdownPos.openDirection === 'down'
                                                    ? { top: launchDropdownPos.top }
                                                    : { bottom: launchDropdownPos.bottom }),
                                            left: launchDropdownPos.left,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <LaunchConfigDropdown
                                            launchConfig={launchOverride}
                                            activeTool={expandedTool}
                                            onActiveToolChange={setExpandedTool}
                                            onLaunchConfigChange={setLaunchOverride}
                                            onClear={() => setLaunchOverride(null)}
                                        />
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>
                    </div>

                    {/* Row 2: dangerous + worktree toggles + time */}
                    <div className="pn-tt__metarow">
                        <button
                            type="button"
                            className={`pn-toggle ${task.dangerousMode ? 'pn-toggle--on-danger' : ''}`}
                            title={task.dangerousMode ? 'Dangerous mode ON — click to disable' : 'Enable dangerous mode (bypass permissions)'}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateTask(task.id, { dangerousMode: !task.dangerousMode });
                            }}
                        >
                            <Icon name="shield" size={13} /> {task.dangerousMode ? 'YOLO' : 'Safe'}
                        </button>

                        <button
                            type="button"
                            className={`pn-toggle ${task.useWorktree ? 'pn-toggle--on-wt' : ''}`}
                            title={task.useWorktree ? 'Git worktree ON — click to disable' : 'Enable git worktree isolation'}
                            onClick={(e) => {
                                e.stopPropagation();
                                updateTask(task.id, { useWorktree: !task.useWorktree });
                            }}
                        >
                            <Icon name="gitBranch" size={13} /> {task.useWorktree ? 'worktree' : 'in-place'}
                        </button>

                        <span className="pn-tt__time">{formatTimeAgo(task.updatedAt)}</span>
                    </div>

                    {/* Sessions row (only if has sessions) */}
                    {sessionCount > 0 && (
                        <div className="pn-tt__metarow">
                            {allSessions.slice(0, 3).map(session => {
                                const taskStatus = task.taskSessionStatuses?.[session.id];
                                const sessionIsTerminal = ['stopped', 'completed', 'failed'].includes(session.status);
                                const displayStatus = sessionIsTerminal ? session.status : (taskStatus || session.status);
                                const taskIsTerminal = task.status === 'completed' || task.status === 'cancelled';
                                const isWorking = !taskIsTerminal && displayStatus === 'working';
                                const sessionNeedsInput = !taskIsTerminal && session.needsInput?.active;
                                const chipVariant = sessionNeedsInput ? 'needsInput'
                                    : taskIsTerminal ? 'completed'
                                    : isWorking ? 'working'
                                    : displayStatus === 'failed' ? 'failed' : '';
                                return (
                                    <span
                                        key={session.id}
                                        className={`pn-actchip ${chipVariant ? `pn-actchip--${chipVariant}` : ''}`}
                                        title={`${session.name || session.id}: ${displayStatus}`}
                                    >
                                        {taskIsTerminal ? 'DONE' : sessionNeedsInput ? 'NEEDS INPUT' : taskStatus ? taskStatus.toUpperCase().replace('_', ' ') : (SESSION_STATUS_LABELS[session.status] || session.status || 'UNKNOWN').toUpperCase()}
                                    </span>
                                );
                            })}
                            {allSessions.length > 3 && (
                                <span className="pn-mini">+{allSessions.length - 3}</span>
                            )}
                        </div>
                    )}

                    {/* Docs row (only if task has markdown docs) */}
                    {markdownDocs.length > 0 && (
                        <div className="pn-tt__metarow">
                            {markdownDocs.map(doc => {
                                const ext = doc.filePath.split('.').pop()?.toLowerCase() || '';
                                const isMd = ['md', 'mdx', 'markdown'].includes(ext);
                                return (
                                    <button type="button"
                                        key={doc.id}
                                        className="pn-docpill"
                                        title={doc.filePath}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDocOverlay(doc);
                                        }}
                                    >
                                        <span className="pn-docpill__ic">{isMd ? 'M↓' : '{}'}</span>
                                        <span className="pn-docpill__t">{doc.title}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Diagrams row */}
                    {(diagramDocs.length > 0 || task.sessionIds?.length > 0) && (
                        <div className="pn-tt__metarow">
                            {diagramDocs.map(doc => (
                                <button type="button"
                                    key={doc.id}
                                    className="pn-docpill pn-docpill--diagram"
                                    title={doc.filePath}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDocOverlay(doc);
                                    }}
                                >
                                    <span className="pn-docpill__ic">⬡</span>
                                    <span className="pn-docpill__t">{doc.title}</span>
                                </button>
                            ))}
                            {task.sessionIds?.length > 0 && (
                                <button type="button"
                                    className="pn-docpill pn-docpill--add"
                                    disabled={isCreatingDiagram}
                                    title="Create diagram doc for this task"
                                    onClick={handleCreateDiagram}
                                >
                                    <Icon name="plus" size={11} />
                                    <span className="pn-docpill__t">{isCreatingDiagram ? '...' : 'Diagram'}</span>
                                </button>
                            )}
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
