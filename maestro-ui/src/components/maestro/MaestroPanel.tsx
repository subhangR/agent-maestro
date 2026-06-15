import React, { useMemo, useEffect, useRef, useCallback } from "react";
import { MaestroTask, MaestroProject, TaskTreeNode, WorkerStrategy, OrchestratorStrategy, AgentTool, LaunchConfig, MemberLaunchOverride, AgentModeInput } from "../../app/types/maestro";
import { TaskListItem } from "./TaskListItem";
import { TaskFilters, SortByOption } from "./TaskFilters";
import { SortableTaskList } from "./SortableTaskList";
import { ListEndFooter } from "./ListEndFooter";
import { CreateTaskModal } from "./CreateTaskModal";
import { ExecutionBar } from "./ExecutionBar";
import { AddSubtaskInput } from "./AddSubtaskInput";
import { PanelIconBar, PrimaryTab, TaskSubTab, SkillSubTab, TeamSubTab } from "./PanelIconBar";
import { TaskTabContent } from "./TaskTabContent";
import { PanelErrorState, NoProjectState } from "./PanelErrorState";
import { maestroClient } from "../../utils/MaestroClient";
import { useTaskSearch } from "../../hooks/useTaskSearch";
import { useTasks } from "../../hooks/useTasks";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useShallow } from "zustand/react/shallow";
import { useSessionStore } from "../../stores/useSessionStore";
import { useTaskTree } from "../../hooks/useTaskTree";
import { useUIStore } from "../../stores/useUIStore";
import { Board } from "./MultiProjectBoard";
import { SkillsPanel } from "./SkillsPanel";
import { TaskListsPanel } from "./TaskListsPanel";
import { TaskGraphPanel } from "./task-graph/TaskGraphPanel";
import { useTaskLists } from "../../hooks/useTaskLists";
import { useTaskGraphStore } from "../../stores/useTaskGraphStore";
import { createLaunchConfig, DEFAULT_MODEL_BY_AGENT_TOOL } from "../../app/constants/agentTools";
import { Icon } from "./redesign/kit";

// Extracted hooks
import { useExecutionMode } from "../../hooks/useExecutionMode";
import { useTeamMemberActions } from "../../hooks/useTeamMemberActions";
import { useTeamActions } from "../../hooks/useTeamActions";

// Extracted panels
import { TeamMembersPanel } from "./panels/TeamMembersPanel";
import { TeamsPanel } from "./panels/TeamsPanel";
import { ModelProfilesPanel } from "./panels/ModelProfilesPanel";

// Phase 6: Module-scope noop callback
const NOOP = () => {};

// Phase 6: Extracted memoized TaskNodeRenderer
interface TaskNodeRendererProps {
    node: TaskTreeNode;
    depth: number;
    showPermanentDelete?: boolean;
    collapsedTasks: Set<string>;
    slidingOutTasks: Set<string>;
    addingSubtaskTo: string | null;
    executionMode: boolean;
    selectedForExecution: Set<string>;
    currentSessionTaskIds: Set<string>;
    projectId: string;
    onSelectTask: (taskId: string) => void;
    onWorkOnTask: (task: MaestroTask, launchConfig?: LaunchConfig) => void;
    onAssignTeamMember: (taskId: string, tmId: string) => void;
    onJumpToSession?: (sid: string) => void;
    onNavigateToTask: (taskId: string) => void;
    onToggleAddSubtask: (taskId: string, hasChildren: boolean) => void;
    onTogglePin: (taskId: string) => void;
    onToggleSelect: (taskId: string) => void;
    onInlineAddSubtask: (parentId: string, title: string) => Promise<void>;
}

const TaskNodeRenderer = React.memo(function TaskNodeRenderer({
    node, depth, showPermanentDelete,
    collapsedTasks, slidingOutTasks, addingSubtaskTo,
    executionMode, selectedForExecution, currentSessionTaskIds, projectId,
    onSelectTask, onWorkOnTask, onAssignTeamMember, onJumpToSession,
    onNavigateToTask, onToggleAddSubtask, onTogglePin, onToggleSelect, onInlineAddSubtask,
}: TaskNodeRendererProps) {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedTasks.has(node.id);
    const isSlidingOut = slidingOutTasks.has(node.id);
    const isAddingSubtask = addingSubtaskTo === node.id;

    const taskItem = (
        <div className={isSlidingOut ? 'terminalTaskSlideOut' : ''}>
            <TaskListItem
                task={node}
                onSelect={() => onSelectTask(node.id)}
                onWorkOn={() => onWorkOnTask(node)}
                onWorkOnWithOverride={(launchConfig: LaunchConfig) => onWorkOnTask(node, launchConfig)}
                onAssignTeamMember={(tmId: string) => onAssignTeamMember(node.id, tmId)}
                onOpenCreateTeamMember={NOOP}
                onJumpToSession={(sid) => onJumpToSession?.(sid)}
                onNavigateToTask={onNavigateToTask}
                depth={depth}
                hasChildren={hasChildren}
                isChildrenCollapsed={isCollapsed}
                isAddingSubtask={isAddingSubtask}
                onToggleChildrenCollapse={() => onToggleAddSubtask(node.id, hasChildren)}
                onTogglePin={() => onTogglePin(node.id)}
                selectionMode={executionMode}
                isSelected={selectedForExecution.has(node.id)}
                onToggleSelect={() => onToggleSelect(node.id)}
                showPermanentDelete={showPermanentDelete}
                isSessionTask={currentSessionTaskIds.has(node.id)}
            />
        </div>
    );

    const subtaskInput = (isAddingSubtask || (hasChildren && !isCollapsed)) ? (
        <AddSubtaskInput parentTaskId={node.id} onAddSubtask={onInlineAddSubtask} depth={depth + 1} />
    ) : null;

    if (depth === 0 && (hasChildren || isAddingSubtask)) {
        return (
            <div key={node.id} className={isSlidingOut ? 'terminalTaskSlideOut' : undefined}>
                {taskItem}
                {(!isCollapsed || isAddingSubtask) && (
                    <div className="pn-kids">
                        {!isCollapsed && node.children.map(child => (
                            <TaskNodeRenderer
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                showPermanentDelete={showPermanentDelete}
                                collapsedTasks={collapsedTasks}
                                slidingOutTasks={slidingOutTasks}
                                addingSubtaskTo={addingSubtaskTo}
                                executionMode={executionMode}
                                selectedForExecution={selectedForExecution}
                                currentSessionTaskIds={currentSessionTaskIds}
                                projectId={projectId}
                                onSelectTask={onSelectTask}
                                onWorkOnTask={onWorkOnTask}
                                onAssignTeamMember={onAssignTeamMember}
                                onJumpToSession={onJumpToSession}
                                onNavigateToTask={onNavigateToTask}
                                onToggleAddSubtask={onToggleAddSubtask}
                                onTogglePin={onTogglePin}
                                onToggleSelect={onToggleSelect}
                                onInlineAddSubtask={onInlineAddSubtask}
                            />
                        ))}
                        {subtaskInput}
                    </div>
                )}
            </div>
        );
    }

    return (
        <React.Fragment key={node.id}>
            {taskItem}
            {((!isCollapsed && hasChildren) || subtaskInput) && (
                <div className="pn-kids">
                    {!isCollapsed && node.children.map(child => (
                        <TaskNodeRenderer
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            showPermanentDelete={showPermanentDelete}
                            collapsedTasks={collapsedTasks}
                            slidingOutTasks={slidingOutTasks}
                            addingSubtaskTo={addingSubtaskTo}
                            executionMode={executionMode}
                            selectedForExecution={selectedForExecution}
                            currentSessionTaskIds={currentSessionTaskIds}
                            projectId={projectId}
                            onSelectTask={onSelectTask}
                            onWorkOnTask={onWorkOnTask}
                            onAssignTeamMember={onAssignTeamMember}
                            onJumpToSession={onJumpToSession}
                            onNavigateToTask={onNavigateToTask}
                            onToggleAddSubtask={onToggleAddSubtask}
                            onTogglePin={onTogglePin}
                            onToggleSelect={onToggleSelect}
                            onInlineAddSubtask={onInlineAddSubtask}
                        />
                    ))}
                    {subtaskInput}
                </div>
            )}
        </React.Fragment>
    );
});

type MaestroPanelProps = {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    project: MaestroProject;
    onCreateMaestroSession: (input: { task?: MaestroTask; tasks?: MaestroTask[]; project: MaestroProject; skillIds?: string[]; strategy?: WorkerStrategy | OrchestratorStrategy; mode?: AgentModeInput; teamMemberIds?: string[]; teamMemberId?: string; delegateTeamMemberIds?: string[]; launchConfig?: LaunchConfig; memberOverrides?: Record<string, MemberLaunchOverride> }) => Promise<any>;
    onJumpToSession?: (maestroSessionId: string) => void;
    onAddTaskToSession?: (taskId: string) => void;
    forcedPrimaryTab?: PrimaryTab;
    forcedTeamSubTab?: TeamSubTab;
};

export const MaestroPanel = React.memo(function MaestroPanel({
    isOpen,
    onClose,
    projectId,
    project,
    onCreateMaestroSession,
    onJumpToSession,
    onAddTaskToSession,
    forcedPrimaryTab,
    forcedTeamSubTab,
}: MaestroPanelProps) {

    // ==================== CORE DATA ====================

    const { tasks, loading, error: fetchError } = useTasks(projectId);
    const {
        createTask,
        updateTask,
        deleteTask,
        removeTaskFromSession,
        taskOrdering,
        fetchTaskOrdering,
        saveTaskOrdering,
        createTeam,
        sessions: maestroSessions,
    } = useMaestroStore(
        useShallow(s => ({
            createTask: s.createTask,
            updateTask: s.updateTask,
            deleteTask: s.deleteTask,
            removeTaskFromSession: s.removeTaskFromSession,
            taskOrdering: s.taskOrdering,
            fetchTaskOrdering: s.fetchTaskOrdering,
            saveTaskOrdering: s.saveTaskOrdering,
            createTeam: s.createTeam,
            sessions: s.sessions,
        }))
    );

    const { taskLists: taskListArray } = useTaskLists(projectId);
    const graphCount = Object.values(useTaskGraphStore.getState().graphs).filter(g => g.projectId === projectId).length;

    // Session task highlighting
    const activeTerminalId = useSessionStore(s => s.activeId);
    const terminalSessions = useSessionStore(s => s.sessions);

    const currentSessionTaskIds = useMemo(() => {
        const terminal = terminalSessions.find(s => s.id === activeTerminalId);
        if (!terminal?.maestroSessionId) return new Set<string>();
        const maestroSession = maestroSessions[terminal.maestroSessionId];
        return new Set(maestroSession?.taskIds || []);
    }, [activeTerminalId, terminalSessions, maestroSessions]);

    // ==================== UI STATE ====================

    const [internalPrimaryTab, setInternalPrimaryTab] = React.useState<PrimaryTab>("tasks");
    const [taskSubTab, setTaskSubTab] = React.useState<TaskSubTab>("current");
    const [skillSubTab, setSkillSubTab] = React.useState<SkillSubTab>("browse");
    const [internalTeamSubTab, setInternalTeamSubTab] = React.useState<TeamSubTab>("members");
    const primaryTab = forcedPrimaryTab ?? internalPrimaryTab;
    const setPrimaryTab = forcedPrimaryTab ? () => {} : setInternalPrimaryTab;
    const teamSubTab = forcedTeamSubTab ?? internalTeamSubTab;
    const setTeamSubTab = forcedTeamSubTab ? () => {} : setInternalTeamSubTab;

    const [componentError, setComponentError] = React.useState<Error | null>(null);
    const [statusFilter, setStatusFilter] = React.useState<MaestroTask["status"][]>([]);
    const [priorityFilter, setPriorityFilter] = React.useState<MaestroTask["priority"][]>([]);
    const [sortBy, setSortBy] = React.useState<SortByOption>("custom");
    const [overdueFilter, setOverdueFilter] = React.useState(false);
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [subtaskParentId, setSubtaskParentId] = React.useState<string | null>(null);
    const [collapsedTasks, setCollapsedTasks] = React.useState<Set<string>>(new Set());
    const [addingSubtaskTo, setAddingSubtaskTo] = React.useState<string | null>(null);
    const [slidingOutTasks, setSlidingOutTasks] = React.useState<Set<string>>(new Set());
    const [showBoard, setShowBoard] = React.useState(false);
    const [taskListCreateSignal, setTaskListCreateSignal] = React.useState(0);
    const [graphCreateSignal, setGraphCreateSignal] = React.useState(0);
    const [teamMemberCreateSignal, setTeamMemberCreateSignal] = React.useState(0);
    const [modelProfileCreateSignal, setModelProfileCreateSignal] = React.useState(0);
    const modelProfileCount = useMaestroStore((s) => Object.keys(s.modelProfiles).length);
    const [searchQuery, setSearchQuery] = React.useState("");

    // ==================== EXTRACTED HOOKS ====================

    const normalizedTasks = useMemo(() => {
        return tasks.map(task => ({
            ...task,
            subtasks: task.subtasks || [],
            lastUpdate: task.lastUpdate || null,
            completedAt: task.completedAt || null,
        }));
    }, [tasks]);

    const regularTasks = normalizedTasks;

    const { teamMembers, teamMembersMap, teamMembersLoading, handleArchive: handleArchiveTeamMember, handleUnarchive: handleUnarchiveTeamMember, handleDelete: handleDeleteTeamMember, handleRun: handleRunTeamMember, handleTeamStandup } = useTeamMemberActions(projectId, project, onCreateMaestroSession, createTask, (msg) => setError(msg));

    const { teams, activeTeams, topLevelTeams, handleRun: handleRunTeam } = useTeamActions(projectId, project, teamMembersMap, onCreateMaestroSession, createTask, (msg) => setError(msg));

    const execution = useExecutionMode(projectId, project, normalizedTasks, regularTasks, onCreateMaestroSession, createTeam, (msg) => setError(msg));

    // ==================== TASK TREE & SEARCH ====================

    const { roots } = useTaskTree(regularTasks);
    const searchMatchIds = useTaskSearch(regularTasks, searchQuery);

    const filterBySearch = useCallback((nodes: TaskTreeNode[]): TaskTreeNode[] => {
        if (!searchMatchIds) return nodes;
        const matches = (node: TaskTreeNode): boolean => {
            if (searchMatchIds.has(node.id)) return true;
            return node.children.some(child => matches(child));
        };
        return nodes.filter(node => matches(node));
    }, [searchMatchIds]);

    // ==================== EFFECTS ====================

    useEffect(() => {
        if (projectId) fetchTaskOrdering(projectId);
    }, [projectId, fetchTaskOrdering]);

    const createTaskRequested = useUIStore(s => s.createTaskRequested);
    useEffect(() => {
        if (createTaskRequested) {
            setShowCreateModal(true);
            useUIStore.getState().setCreateTaskRequested(false);
        }
    }, [createTaskRequested]);

    const showBoardRequested = useUIStore(s => s.showBoardRequested);
    useEffect(() => {
        if (showBoardRequested) {
            setShowBoard(true);
            useUIStore.getState().setShowBoardRequested(false);
        }
    }, [showBoardRequested]);

    // Slide-out animation for completed tasks
    const prevTaskStatusesRef = useRef<Map<string, string>>(new Map());
    const slideOutTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    useEffect(() => {
        const newlyCompleted: string[] = [];
        normalizedTasks.forEach(task => {
            const prevStatus = prevTaskStatusesRef.current.get(task.id);
            if (prevStatus && prevStatus !== 'completed' && prevStatus !== 'archived' &&
                (task.status === 'completed' || task.status === 'archived')) {
                newlyCompleted.push(task.id);
            }
        });
        const newStatuses = new Map<string, string>();
        normalizedTasks.forEach(task => newStatuses.set(task.id, task.status));
        prevTaskStatusesRef.current = newStatuses;

        if (newlyCompleted.length > 0) {
            setSlidingOutTasks(prev => {
                const next = new Set(prev);
                newlyCompleted.forEach(id => next.add(id));
                return next;
            });
            newlyCompleted.forEach(id => {
                // Clear any existing timer for this task
                const existing = slideOutTimersRef.current.get(id);
                if (existing) clearTimeout(existing);
                // Set a per-task timer that won't be cancelled by other task updates
                const timer = setTimeout(() => {
                    setSlidingOutTasks(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                    slideOutTimersRef.current.delete(id);
                }, 500);
                slideOutTimersRef.current.set(id, timer);
            });
        }
    }, [normalizedTasks]);
    // Cleanup all per-task timers on unmount
    useEffect(() => {
        return () => {
            slideOutTimersRef.current.forEach(timer => clearTimeout(timer));
            slideOutTimersRef.current.clear();
        };
    }, []);

    // Initialize collapsed state
    const hasInitializedCollapsedRef = useRef(false);
    useEffect(() => {
        hasInitializedCollapsedRef.current = false;
        setCollapsedTasks(new Set());
    }, [projectId]);
    useEffect(() => {
        if (!hasInitializedCollapsedRef.current && regularTasks.length > 0) {
            const parentIds = new Set<string>(
                regularTasks.filter(task => task.parentId).map(task => task.parentId as string)
            );
            if (parentIds.size > 0) {
                hasInitializedCollapsedRef.current = true;
                setCollapsedTasks(parentIds);
            }
        }
    }, [regularTasks]);

    // ==================== TASK HANDLERS (useCallback for stable refs) ====================

    const handleTaskReorder = useCallback((orderedIds: string[]) => {
        saveTaskOrdering(projectId, orderedIds);
    }, [projectId, saveTaskOrdering]);

    const handleUpdateTask = useCallback(async (taskId: string, updates: Partial<MaestroTask>) => {
        try { await updateTask(taskId, updates); } catch { setError("Failed to update task"); }
    }, [updateTask]);

    const handleDeleteTask = useCallback(async (taskId: string) => {
        try { await deleteTask(taskId); } catch { setError("Failed to delete task"); }
    }, [deleteTask]);

    const handleWorkOnTask = useCallback(async (task: MaestroTask, launchConfig?: LaunchConfig) => {
        const effectiveIds = task.teamMemberIds && task.teamMemberIds.length > 0
            ? task.teamMemberIds
            : task.teamMemberId ? [task.teamMemberId] : [];
        const teamMemberId = effectiveIds.length === 1 ? effectiveIds[0] : undefined;
        const teamMemberIds = effectiveIds.length > 1 ? effectiveIds : undefined;
        const member = teamMemberId ? teamMembersMap[teamMemberId] : null;
        const mode = member?.mode || 'worker';
        const effectiveLaunchConfig = task.dangerousMode
            ? {
                ...(launchConfig || createLaunchConfig(
                    member?.agentTool || 'claude-code',
                    member?.model || DEFAULT_MODEL_BY_AGENT_TOOL[member?.agentTool || 'claude-code'],
                )),
                accessMode: 'fullAccess' as const,
            }
            : launchConfig;

        try {
            await onCreateMaestroSession({
                task, project, mode, teamMemberId, teamMemberIds,
                ...(effectiveLaunchConfig ? { launchConfig: effectiveLaunchConfig } : {}),
                ...(task.memberOverrides ? { memberOverrides: task.memberOverrides } : {}),
                ...(task.useWorktree ? { useWorktree: true } : {}),
            });
        } catch (err: any) {
            setError(`Failed to open terminal: ${err.message}`);
        }
    }, [teamMembersMap, onCreateMaestroSession, project]);

    const handleCreateTask = useCallback(async (taskData: any) => {
        try {
            const newTask = await createTask({
                projectId,
                title: taskData.title,
                description: taskData.description,
                priority: taskData.priority,
                skillIds: taskData.skillIds,
                referenceTaskIds: taskData.referenceTaskIds,
                parentId: taskData.parentId,
                teamMemberId: taskData.teamMemberId,
                teamMemberIds: taskData.teamMemberIds,
                memberOverrides: taskData.memberOverrides,
                useWorktree: taskData.useWorktree,
            });
            if (taskData._stagedFiles?.length > 0) {
                for (const file of taskData._stagedFiles) {
                    try {
                        await maestroClient.uploadTaskImage(newTask.id, file);
                    } catch (uploadErr) {
                        console.error(`Failed to upload task image "${file.name}":`, uploadErr);
                    }
                }
            }
            if (taskData.startImmediately) {
                if (taskData.memberOverrides && !newTask.memberOverrides) {
                    newTask.memberOverrides = taskData.memberOverrides;
                }
                await handleWorkOnTask(newTask);
            }
        } catch (err: any) {
            setError("Failed to create task");
        }
    }, [createTask, projectId, handleWorkOnTask]);

    const handleStartTask = useCallback(async (taskId: string) => {
        const task = useMaestroStore.getState().tasks[taskId];
        if (task) await handleWorkOnTask(task);
    }, [handleWorkOnTask]);

    const handleAssignTeamMember = useCallback(async (taskId: string, teamMemberId: string) => {
        try { await updateTask(taskId, { teamMemberId, teamMemberIds: [teamMemberId] }); } catch { setError("Failed to assign team member"); }
    }, [updateTask]);

    const handleAddSubtask = useCallback((parentId: string) => {
        setSubtaskParentId(parentId);
        setShowCreateModal(true);
    }, []);

    const handleInlineAddSubtask = useCallback(async (parentId: string, title: string) => {
        try {
            await createTask({ projectId, parentId, title, description: "", priority: "medium" });
            setCollapsedTasks(prev => { const next = new Set(prev); next.delete(parentId); return next; });
        } catch (err: any) {
            setError("Failed to create subtask");
            throw err;
        }
    }, [createTask, projectId]);

    const handleToggleCollapse = useCallback((taskId: string) => {
        setCollapsedTasks(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    }, []);

    const handleToggleAddSubtask = useCallback((taskId: string, hasChildren: boolean) => {
        if (hasChildren) handleToggleCollapse(taskId);
        else setAddingSubtaskTo(prev => prev === taskId ? null : taskId);
    }, [handleToggleCollapse]);

    const handleToggleSubtask = useCallback(async (_taskId: string, subtaskId: string) => {
        try {
            const subtask = normalizedTasks.find(t => t.id === subtaskId);
            if (!subtask) return;
            await updateTask(subtaskId, { status: subtask.status === 'completed' ? 'todo' : 'completed' });
        } catch { setError("Failed to toggle subtask"); }
    }, [normalizedTasks, updateTask]);

    const handleDeleteSubtask = useCallback(async (_taskId: string, subtaskId: string) => {
        try { await deleteTask(subtaskId); } catch { setError("Failed to delete subtask"); }
    }, [deleteTask]);

    const handleTogglePin = useCallback(async (taskId: string) => {
        try {
            const task = normalizedTasks.find(t => t.id === taskId);
            if (task) await updateTask(taskId, { pinned: !task.pinned });
        } catch { setError("Failed to toggle pin"); }
    }, [normalizedTasks, updateTask]);

    // ==================== DERIVED DATA (useMemo) ====================

    const customOrder = useMemo(() => taskOrdering[projectId] || [], [taskOrdering, projectId]);

    const activeRoots = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        return filterBySearch(roots
            .filter(n => n.status !== 'completed' && n.status !== 'archived')
            .filter(n => statusFilter.length === 0 || statusFilter.includes(n.status))
            .filter(n => priorityFilter.length === 0 || priorityFilter.includes(n.priority))
            .filter(n => !overdueFilter || (n.dueDate && n.status !== 'completed' && n.status !== 'cancelled' && n.dueDate < todayStr))
            .sort((a, b) => {
                if (sortBy === "custom") {
                    const aIdx = customOrder.indexOf(a.id);
                    const bIdx = customOrder.indexOf(b.id);
                    if (aIdx === -1 && bIdx === -1) return b.updatedAt - a.updatedAt;
                    if (aIdx === -1) return 1;
                    if (bIdx === -1) return -1;
                    return aIdx - bIdx;
                }
                if (sortBy === "priority") {
                    const priorityOrder = { high: 0, medium: 1, low: 2 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                }
                if (sortBy === "dueDate") {
                    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                    if (a.dueDate) return -1;
                    if (b.dueDate) return 1;
                    return b.updatedAt - a.updatedAt;
                }
                return b[sortBy] - a[sortBy];
            }));
    }, [roots, statusFilter, priorityFilter, overdueFilter, sortBy, customOrder, filterBySearch]);

    const completedRoots = useMemo(() => filterBySearch(roots.filter(n => n.status === 'completed').sort((a, b) => (b.completedAt || b.updatedAt) - (a.completedAt || a.updatedAt))), [roots, filterBySearch]);
    const pinnedRoots = useMemo(() => filterBySearch(roots.filter(n => n.pinned).sort((a, b) => b.updatedAt - a.updatedAt)), [roots, filterBySearch]);
    const archivedRoots = useMemo(() => filterBySearch(roots.filter(n => n.status === 'archived').sort((a, b) => b.updatedAt - a.updatedAt)), [roots, filterBySearch]);

    const subtaskParentTitle = useMemo(() => subtaskParentId ? normalizedTasks.find(t => t.id === subtaskParentId)?.title : undefined, [subtaskParentId, normalizedTasks]);

    // ==================== STABLE CALLBACKS FOR TaskNodeRenderer ====================

    const handleSelectTask = useCallback((taskId: string) => {
        useUIStore.getState().setTaskDetailOverlay({ taskId, projectId });
    }, [projectId]);

    const handleNavigateToTask = useCallback((taskId: string) => {
        useUIStore.getState().setTaskDetailOverlay({ taskId, projectId });
    }, [projectId]);

    const renderTaskNode = useCallback((node: TaskTreeNode, depth: number = 0, options?: { showPermanentDelete?: boolean }): React.ReactNode => {
        return (
            <TaskNodeRenderer
                key={node.id}
                node={node}
                depth={depth}
                showPermanentDelete={options?.showPermanentDelete}
                collapsedTasks={collapsedTasks}
                slidingOutTasks={slidingOutTasks}
                addingSubtaskTo={addingSubtaskTo}
                executionMode={execution.executionMode}
                selectedForExecution={execution.selectedForExecution}
                currentSessionTaskIds={currentSessionTaskIds}
                projectId={projectId}
                onSelectTask={handleSelectTask}
                onWorkOnTask={handleWorkOnTask}
                onAssignTeamMember={handleAssignTeamMember}
                onJumpToSession={onJumpToSession}
                onNavigateToTask={handleNavigateToTask}
                onToggleAddSubtask={handleToggleAddSubtask}
                onTogglePin={handleTogglePin}
                onToggleSelect={execution.handleToggleTaskSelection}
                onInlineAddSubtask={handleInlineAddSubtask}
            />
        );
    }, [collapsedTasks, slidingOutTasks, addingSubtaskTo, execution.executionMode, execution.selectedForExecution, execution.handleToggleTaskSelection, currentSessionTaskIds, projectId, handleSelectTask, handleWorkOnTask, handleAssignTeamMember, onJumpToSession, handleNavigateToTask, handleToggleAddSubtask, handleTogglePin, handleInlineAddSubtask]);

    // ==================== EARLY RETURNS ====================

    if (componentError) {
        return <PanelErrorState error={componentError} onRetry={() => setComponentError(null)} onClose={onClose} />;
    }
    if (!isOpen) return null;
    if (!projectId) return <NoProjectState onClose={onClose} />;

    // ==================== RENDER ====================

    return (
        <>
            <div
                className="pn-mp"
                style={{ width: '100%', height: '100%', ...(execution.executionMode ? { boxShadow: 'inset 0 0 0 2px var(--pn-brand)' } : {}) }}
            >
                    {/* pn-head — project name + standup/more */}
                    <div className="pn-head">
                        <span className="pn-proj">{project.name}<Icon name="chevronD" size={13} /></span>
                        <span className="pn-head-spacer" />
                        <button type="button" className="pn-ib" title="Team standup" onClick={handleTeamStandup}><Icon name="more" /></button>
                    </div>

                    {/* nav: pn-subbar in rail-driven (forced) context; PanelIconBar standalone (right-panel) context. Exactly one renders. */}
                    {forcedPrimaryTab ? (
                    <>
                    {primaryTab === "tasks" && (
                        <div className="pn-subbar">
                            <button type="button" className="pn-btn pn-btn--primary" style={{ height: 30 }} onClick={() => setShowCreateModal(true)}><Icon name="plus" size={14} /> New task</button>
                            <span className="pn-head-spacer" />
                            <button type="button" className={`pn-subtab ${taskSubTab === "current" ? "pn-subtab--active" : ""}`} onClick={() => setTaskSubTab("current")} title="Current"><Icon name="listChecks" /> {activeRoots.length}</button>
                            <button type="button" className={`pn-subtab ${taskSubTab === "pinned" ? "pn-subtab--active" : ""}`} onClick={() => setTaskSubTab("pinned")} title="Pinned"><Icon name="pin" /> {pinnedRoots.length}</button>
                            <button type="button" className={`pn-subtab ${taskSubTab === "completed" ? "pn-subtab--active" : ""}`} onClick={() => setTaskSubTab("completed")} title="Completed"><Icon name="check" /> {completedRoots.length}</button>
                            <button type="button" className={`pn-subtab ${taskSubTab === "archived" ? "pn-subtab--active" : ""}`} onClick={() => setTaskSubTab("archived")} title="Archived"><Icon name="archive" /> {archivedRoots.length}</button>
                        </div>
                    )}
                    {primaryTab === "lists" && (
                        <div className="pn-subbar">
                            <button type="button" className="pn-btn pn-btn--primary" style={{ height: 30 }} onClick={() => setTaskListCreateSignal(prev => prev + 1)}><Icon name="plus" size={14} /> New list</button>
                            <span className="pn-head-spacer" />
                            <span className="pn-meta">Lists · {taskListArray.length}</span>
                        </div>
                    )}
                    {primaryTab === "team" && teamSubTab === "members" && (
                        <div className="pn-subbar">
                            <button type="button" className="pn-btn pn-btn--primary" style={{ height: 30 }} onClick={() => setTeamMemberCreateSignal(prev => prev + 1)}><Icon name="plus" size={14} /> New member</button>
                            <button type="button" className="pn-btn" style={{ height: 30 }} onClick={handleTeamStandup} title="Run a team standup to audit and optimize the roster">Standup</button>
                            <span className="pn-head-spacer" />
                            <span className="pn-meta">Members · {teamMembers.filter(t => t.status !== 'archived').length}</span>
                        </div>
                    )}
                    {primaryTab === "team" && teamSubTab === "teams" && (
                        <div className="pn-subbar">
                            <span className="pn-head-spacer" />
                            <span className="pn-meta">Teams · {activeTeams.length}</span>
                        </div>
                    )}
                    {primaryTab === "profiles" && (
                        <div className="pn-subbar">
                            <button type="button" className="pn-btn pn-btn--primary" style={{ height: 30 }} onClick={() => { setPrimaryTab("profiles"); setModelProfileCreateSignal(prev => prev + 1); }}><Icon name="plus" size={14} /> New profile</button>
                            <span className="pn-head-spacer" />
                            <span className="pn-meta">Profiles · {modelProfileCount}</span>
                        </div>
                    )}
                    {primaryTab === "graphs" && (
                        <div className="pn-subbar">
                            <button type="button" className="pn-btn pn-btn--primary" style={{ height: 30 }} onClick={() => { setPrimaryTab("graphs"); setGraphCreateSignal(prev => prev + 1); }}><Icon name="plus" size={14} /> New graph</button>
                            <span className="pn-head-spacer" />
                            <span className="pn-meta">Graphs · {graphCount}</span>
                        </div>
                    )}
                    </>
                    ) : (
                        <PanelIconBar
                            primaryTab={primaryTab}
                            onPrimaryTabChange={setPrimaryTab}
                            taskSubTab={taskSubTab}
                            onTaskSubTabChange={setTaskSubTab}
                            skillSubTab={skillSubTab}
                            onSkillSubTabChange={setSkillSubTab}
                            teamSubTab={teamSubTab}
                            onTeamSubTabChange={setTeamSubTab}
                            activeCount={activeRoots.length}
                            pinnedCount={pinnedRoots.length}
                            completedCount={completedRoots.length}
                            archivedCount={archivedRoots.length}
                            teamMembers={teamMembers}
                            loading={loading}
                            projectId={projectId}
                            onNewTask={() => setShowCreateModal(true)}
                            onNewTaskList={() => setTaskListCreateSignal(prev => prev + 1)}
                            onNewTeamMember={() => setTeamMemberCreateSignal(prev => prev + 1)}
                            onNewTeam={() => {}}
                            onNewGraph={() => { setPrimaryTab("graphs"); setGraphCreateSignal(prev => prev + 1); }}
                            onNewModelProfile={() => { setPrimaryTab("profiles"); setModelProfileCreateSignal(prev => prev + 1); }}
                            onTeamStandup={handleTeamStandup}
                            teamCount={activeTeams.length}
                            taskListCount={taskListArray.length}
                            graphCount={graphCount}
                            modelProfileCount={modelProfileCount}
                        />
                    )}

                    {primaryTab === "tasks" && (
                        <div className="pn-search">
                            <Icon name="search" />
                            <input type="text" placeholder="Search tasks" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            {searchQuery
                                ? <button type="button" className="pn-ib" style={{ width: 22, height: 22 }} title="Clear" onClick={() => setSearchQuery("")}><Icon name="x" size={13} /></button>
                                : <span className="pn-kbd">⌘K</span>}
                        </div>
                    )}

                    {(error || fetchError) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 14px 8px', padding: '7px 10px', background: 'var(--pn-block-soft)', border: '1px solid var(--pn-block)', borderRadius: 'var(--pn-r-sm)' }}>
                            <Icon name="info" size={14} style={{ color: 'var(--pn-block)', flex: '0 0 auto' }} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--pn-ink-2)' }}>{error || fetchError}</span>
                            <button type="button" className="pn-ib" style={{ width: 20, height: 20 }} title="Dismiss" onClick={() => setError(null)}><Icon name="x" size={12} /></button>
                        </div>
                    )}

                    {/* Tasks Tab */}
                    {primaryTab === "tasks" && (
                        <>
                            {taskSubTab === "current" && (
                                <>
                                    <TaskFilters statusFilter={statusFilter} priorityFilter={priorityFilter} sortBy={sortBy} overdueFilter={overdueFilter} onStatusFilterChange={setStatusFilter} onPriorityFilterChange={setPriorityFilter} onSortChange={setSortBy} onOverdueFilterChange={setOverdueFilter} />
                                    <ExecutionBar
                                        isActive={execution.executionMode}
                                        activeMode={execution.activeBarMode}
                                        onActivate={() => { execution.setExecutionMode(true); execution.setActiveBarMode('execute'); }}
                                        onActivateOrchestrate={() => { execution.setExecutionMode(true); execution.setActiveBarMode('orchestrate'); }}
                                        onCancel={execution.handleCancelExecution}
                                        onExecute={execution.handleBatchExecute}
                                        onOrchestrate={execution.handleBatchOrchestrate}
                                        selectedCount={execution.selectedForExecution.size}
                                        projectId={projectId}
                                        teamMembers={teamMembers}
                                        onSaveAsTeam={execution.handleSaveAsTeam}
                                    />
                                </>
                            )}
                            <div className="pn-scroll">
                                {taskSubTab === "current" && (
                                    sortBy === "custom" ? (
                                        loading ? (
                                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--pn-ink-3)', fontFamily: 'var(--pn-mono)', fontSize: 12 }}>Loading tasks…</div>
                                        ) : activeRoots.length === 0 ? (
                                            <TaskTabContent loading={false} emptyMessage="NO TASKS IN QUEUE" emptySubMessage="$ maestro new task" roots={[]} renderTaskNode={renderTaskNode} showNewTaskButton onNewTask={() => setShowCreateModal(true)} />
                                        ) : (
                                            <SortableTaskList roots={activeRoots} renderTaskNode={renderTaskNode} onReorder={handleTaskReorder} />
                                        )
                                    ) : (
                                        <TaskTabContent loading={loading} emptyMessage="NO TASKS IN QUEUE" emptySubMessage="$ maestro new task" roots={activeRoots} renderTaskNode={renderTaskNode} showNewTaskButton onNewTask={() => setShowCreateModal(true)} sectionLabel="Current" />
                                    )
                                )}
                                {taskSubTab === "pinned" && <TaskTabContent loading={loading} emptyMessage="NO PINNED TASKS" emptySubMessage="Pin tasks you run frequently" roots={pinnedRoots} renderTaskNode={renderTaskNode} sectionLabel="Pinned" />}
                                {taskSubTab === "completed" && <TaskTabContent loading={loading} emptyMessage="NO COMPLETED TASKS YET" emptySubMessage="Tasks will appear here when" roots={completedRoots} renderTaskNode={renderTaskNode} listClassName="terminalTaskListCompleted" sectionLabel="Completed" />}
                                {taskSubTab === "archived" && <TaskTabContent loading={loading} emptyMessage="NO ARCHIVED TASKS" emptySubMessage="Archived tasks will appear here" roots={archivedRoots} renderTaskNode={renderTaskNode} listClassName="terminalTaskListArchived" showPermanentDelete sectionLabel="Archived" />}
                                {((taskSubTab === "current" && activeRoots.length > 0) ||
                                  (taskSubTab === "pinned" && pinnedRoots.length > 0) ||
                                  (taskSubTab === "completed" && completedRoots.length > 0) ||
                                  (taskSubTab === "archived" && archivedRoots.length > 0)) && <ListEndFooter />}
                            </div>
                            <div className="pn-fade" />
                        </>
                    )}

                    {/* Skills Tab */}
                    {primaryTab === "skills" && <SkillsPanel project={project} />}

                    {/* Lists Tab */}
                    {primaryTab === "lists" && <TaskListsPanel projectId={projectId} createListSignal={taskListCreateSignal} />}

                    {/* Graphs Tab */}
                    {primaryTab === "graphs" && <TaskGraphPanel projectId={projectId} createGraphSignal={graphCreateSignal} />}

                    {/* Team Tab */}
                    {primaryTab === "team" && (
                        <>
                            {teamSubTab === "members" && (
                                <TeamMembersPanel
                                    projectId={projectId}
                                    teamMembers={teamMembers}
                                    teamMembersLoading={teamMembersLoading}
                                    onEdit={() => {}}
                                    onArchive={handleArchiveTeamMember}
                                    onUnarchive={handleUnarchiveTeamMember}
                                    onDelete={handleDeleteTeamMember}
                                    onRun={handleRunTeamMember}
                                    createSignal={teamMemberCreateSignal}
                                />
                            )}
                            {teamSubTab === "teams" && (
                                <TeamsPanel
                                    projectId={projectId}
                                    teams={teams}
                                    topLevelTeams={topLevelTeams}
                                    onEdit={() => {}}
                                    onRun={handleRunTeam}
                                />
                            )}
                        </>
                    )}

                    {primaryTab === "profiles" && (
                        <ModelProfilesPanel createSignal={modelProfileCreateSignal} />
                    )}
                </div>

            <CreateTaskModal
                isOpen={showCreateModal}
                onClose={() => { setShowCreateModal(false); setSubtaskParentId(null); }}
                onCreate={handleCreateTask}
                onStartTask={handleStartTask}
                project={project}
                parentId={subtaskParentId ?? undefined}
                parentTitle={subtaskParentTitle}
            />

            {showBoard && (
                <Board
                    focusProjectId={projectId}
                    onClose={() => setShowBoard(false)}
                    onSelectTask={(taskId, _projectId) => useUIStore.getState().setTaskDetailOverlay({ taskId, projectId })}
                    onUpdateTaskStatus={(taskId, status) => { void handleUpdateTask(taskId, { status }); }}
                    onWorkOnTask={(task, _project) => handleWorkOnTask(task)}
                    onCreateMaestroSession={onCreateMaestroSession}
                />
            )}
        </>
    );
});
