import { maestroClient } from "../utils/MaestroClient";

import { TerminalSession } from "../app/types/session";
import {
    MaestroProject,
    MaestroTask,
    AgentMode,
    AgentModeInput,
    WorkerStrategy,
    OrchestratorStrategy,
    LaunchConfig,
    MemberLaunchOverride,
    TaskList,
    CreateTaskListPayload,
    UpdateTaskListPayload,
    TaskListOrdering,
} from "../app/types/maestro";

export async function createMaestroSession(input: {
    task?: MaestroTask;              // Single task (backward compatible)
    tasks?: MaestroTask[];           // Multiple tasks (PHASE IV-A)
    project: MaestroProject;
    skillIds?: string[];      // Skill IDs to load
    mode?: AgentModeInput;            // 'worker', 'coordinator', etc. (accepts legacy 'execute'/'coordinate')
    strategy?: WorkerStrategy | OrchestratorStrategy;  // Strategy for this session
    teamMemberIds?: string[];        // Team member task IDs for coordinate mode
    teamMemberId?: string;           // Single team member assigned to this task
    delegateTeamMemberIds?: string[]; // Team member roster for coordinator delegation
    teamId?: string | null;          // Saved team this session belongs to (recursive team launch)
    launchConfig?: LaunchConfig;     // Canonical launch override for this run
    memberOverrides?: Record<string, MemberLaunchOverride>;  // Per-member launch overrides
    permissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
    delegatePermissionMode?: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
    useWorktree?: boolean;
  }): Promise<TerminalSession> {
    const { task, tasks, skillIds, project, mode, strategy, teamMemberIds, teamMemberId, delegateTeamMemberIds, teamId, launchConfig, memberOverrides, permissionMode, delegatePermissionMode, useWorktree } = input;

    // Normalize to array (support both single and multi-task)
    const taskList = tasks || (task ? [task] : []);
    if (taskList.length === 0) {
      throw new Error('At least one task is required');
    }

    // Normalize legacy mode values
    const normalizedMode = mode === 'execute' ? 'worker' : mode === 'coordinate' ? 'coordinator' : mode;
    const resolvedMode: AgentMode = normalizedMode || 'worker';

    // Use server spawn endpoint (Server-Generated Manifests architecture)
    const taskIds = taskList.map(t => t.id);

    // Determine skill based on mode
    const isCoord = resolvedMode === 'coordinator' || resolvedMode === 'coordinated-coordinator' || resolvedMode === 'coordinate' as any;
    const defaultSkill = isCoord ? 'maestro-orchestrator' : 'maestro-worker';

    const isCoordinatorMode = resolvedMode === 'coordinator' || resolvedMode === 'coordinated-coordinator' || (resolvedMode as string) === 'coordinate';

    // Resolve identities:
    // - Worker modes: teamMemberIds remains multi-self identity.
    // - Coordinator modes: teamMemberId is self, delegateTeamMemberIds is roster.
    const resolvedTeamMemberIds = !isCoordinatorMode && teamMemberIds && teamMemberIds.length > 0
      ? teamMemberIds
      : (!isCoordinatorMode && taskList[0].teamMemberIds && taskList[0].teamMemberIds.length > 0 ? taskList[0].teamMemberIds : undefined);
    const resolvedTeamMemberId = teamMemberId || taskList[0].teamMemberId;
    const resolvedDelegateTeamMemberIds = isCoordinatorMode
      ? (delegateTeamMemberIds && delegateTeamMemberIds.length > 0
          ? delegateTeamMemberIds
          : (teamMemberIds && teamMemberIds.length > 0 ? teamMemberIds : undefined))
      : undefined;
    // Saved team binding: explicit input wins, else inherit from the task.
    const resolvedTeamId = teamId ?? taskList[0].teamId ?? undefined;

    try {
      const response = await maestroClient.spawnSession({
        projectId: project.id,
        taskIds,
        mode: resolvedMode,
        spawnSource: 'ui',
        sessionName: taskList.length > 1
          ? `Multi-Task: ${taskList[0].title}`
          : taskList[0].title,
        skills: skillIds || [defaultSkill],
        ...(resolvedTeamMemberIds && resolvedTeamMemberIds.length > 0 ? { teamMemberIds: resolvedTeamMemberIds } : {}),
        ...(resolvedTeamMemberId ? { teamMemberId: resolvedTeamMemberId } : {}),
        ...(resolvedDelegateTeamMemberIds && resolvedDelegateTeamMemberIds.length > 0 ? { delegateTeamMemberIds: resolvedDelegateTeamMemberIds } : {}),
        ...(resolvedTeamId ? { teamId: resolvedTeamId } : {}),
        ...(launchConfig ? { launchConfig } : {}),
        ...(memberOverrides && Object.keys(memberOverrides).length > 0 ? { memberOverrides } : {}),
        ...(permissionMode ? { permissionMode } : {}),
        ...(delegatePermissionMode ? { delegatePermissionMode } : {}),
        ...(useWorktree ? { useWorktree: true } : {}),
        ...(strategy ? { strategy } : {}),
      });

      // Return a placeholder session - the actual UI session will be created
      // by MaestroContext when it receives the spawn_request WebSocket event
      return {
        id: 'pending',
        maestroSessionId: response.sessionId,
        projectId: project.id,
      } as TerminalSession;

    } catch (error: any) {
      throw new Error(`Failed to spawn session: ${error.message}`);
    }
  }

// ==================== TASK LISTS API ====================

export async function fetchTaskLists(projectId: string): Promise<TaskList[]> {
  return maestroClient.getTaskLists(projectId);
}

export async function fetchTaskList(id: string): Promise<TaskList> {
  return maestroClient.getTaskList(id);
}

export async function createTaskList(payload: CreateTaskListPayload): Promise<TaskList> {
  return maestroClient.createTaskList(payload);
}

export async function updateTaskList(id: string, updates: UpdateTaskListPayload): Promise<TaskList> {
  return maestroClient.updateTaskList(id, updates);
}

export async function deleteTaskList(id: string): Promise<{ success: boolean }> {
  return maestroClient.deleteTaskList(id);
}

export async function addTaskToList(listId: string, taskId: string): Promise<TaskList> {
  return maestroClient.addTaskToList(listId, taskId);
}

export async function removeTaskFromList(listId: string, taskId: string): Promise<TaskList> {
  return maestroClient.removeTaskFromList(listId, taskId);
}

export async function reorderTaskListTasks(listId: string, orderedTaskIds: string[]): Promise<TaskList> {
  return maestroClient.reorderTaskListTasks(listId, orderedTaskIds);
}

export async function fetchTaskListOrdering(projectId: string): Promise<TaskListOrdering> {
  return maestroClient.getTaskListOrdering(projectId);
}

export async function saveTaskListOrdering(projectId: string, orderedIds: string[]): Promise<TaskListOrdering> {
  return maestroClient.saveTaskListOrdering(projectId, orderedIds);
}

// ==================== MASTER PROJECT ====================

export async function setProjectMaster(projectId: string, isMaster: boolean): Promise<MaestroProject> {
  return maestroClient.setProjectMaster(projectId, isMaster);
}
