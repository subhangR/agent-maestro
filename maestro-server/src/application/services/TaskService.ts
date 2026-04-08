import { Task, TaskStatus, CreateTaskPayload, UpdateTaskPayload } from '../../types';
import { ITaskRepository, TaskFilter } from '../../domain/repositories/ITaskRepository';
import { ITaskListRepository } from '../../domain/repositories/ITaskListRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ValidationError, NotFoundError } from '../../domain/common/Errors';

/**
 * Application service for task operations.
 * Manages task lifecycle, validation, and events.
 */
export class TaskService {
  constructor(
    private taskRepo: ITaskRepository,
    private projectRepo: IProjectRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator,
    private taskListRepo: ITaskListRepository
  ) {}

  /**
   * Create a new task.
   */
  async createTask(input: CreateTaskPayload): Promise<Task> {
    // Validation
    if (!input.projectId) {
      throw new ValidationError('Project ID is required');
    }
    // Verify project exists
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      throw new NotFoundError('Project', input.projectId);
    }

    // Verify parent task exists if specified
    if (input.parentId) {
      const parentTask = await this.taskRepo.findById(input.parentId);
      if (!parentTask) {
        throw new NotFoundError('Parent task', input.parentId);
      }
    }

    const task = await this.taskRepo.create({
      ...input,
      title: (input.title || '').trim()
    });

    await this.eventBus.emit('task:created', task);

    return task;
  }

  /**
   * Get a task by ID.
   */
  async getTask(id: string): Promise<Task> {
    const task = await this.taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }
    return task;
  }

  /**
   * List tasks with optional filtering.
   */
  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    return this.taskRepo.findAll(filter);
  }

  /**
   * List tasks for a project.
   */
  async listTasksByProject(projectId: string): Promise<Task[]> {
    return this.taskRepo.findByProjectId(projectId);
  }

  /**
   * List child tasks of a parent.
   */
  async listChildTasks(parentId: string | null): Promise<Task[]> {
    return this.taskRepo.findByParentId(parentId);
  }

  /**
   * Update a task.
   *
   * IMPORTANT: When updateSource === 'session', agents/sessions can only update:
   * - sessionStatus (their working status on this task)
   * They CANNOT update user-controlled fields like status, priority, title, etc.
   * NOTE: Timeline is now on Session, not Task - use SessionService.addTimelineEvent()
   */
  async updateTask(id: string, updates: UpdateTaskPayload): Promise<Task> {
    // Fetch old task state for comparison — snapshot values before mutation
    const oldTask = await this.taskRepo.findById(id);
    const oldStatus = oldTask?.status;
    const oldTaskSessionStatuses = oldTask?.taskSessionStatuses ? { ...oldTask.taskSessionStatuses } : {};

    // ENFORCEMENT: Sessions can only update taskSessionStatuses, not user status
    if (updates.updateSource === 'session') {
      const sessionAllowedUpdates: UpdateTaskPayload = {};

      // Map sessionStatus + sessionId -> taskSessionStatuses[sessionId] (backward compat)
      if (updates.sessionStatus !== undefined && updates.sessionId) {
        const existingTask = await this.taskRepo.findById(id);
        const existing = existingTask?.taskSessionStatuses || {};
        sessionAllowedUpdates.taskSessionStatuses = {
          ...existing,
          [updates.sessionId]: updates.sessionStatus,
        };
      }

      const task = await this.taskRepo.update(id, sessionAllowedUpdates);
      await this.eventBus.emit('task:updated', task);

      // Emit notification events for taskSessionStatuses changes (using snapshot)
      if (oldTask && sessionAllowedUpdates.taskSessionStatuses) {
        await this.emitTaskSessionStatusNotifications(oldStatus!, oldTaskSessionStatuses, task);
      }

      return task;
    }

    // User updates - allow all fields (but remove internal tracking fields)
    const { updateSource, sessionId, sessionStatus: _ss, ...userUpdates } = updates;
    const task = await this.taskRepo.update(id, userUpdates);

    await this.eventBus.emit('task:updated', task);

    // Emit notification events for task status transitions (using snapshot)
    if (oldTask) {
      await this.emitTaskStatusNotifications(oldStatus!, task);
      await this.emitTaskSessionStatusNotifications(oldStatus!, oldTaskSessionStatuses, task);
    }

    return task;
  }

  /**
   * Emit notification events for task-level status transitions.
   */
  private async emitTaskStatusNotifications(oldStatus: string, newTask: Task): Promise<void> {
    if (oldStatus === newTask.status) return;

    if (newTask.status === 'completed') {
      await this.eventBus.emit('notify:task_completed', { taskId: newTask.id, title: newTask.title });
    } else if (newTask.status === 'cancelled') {
      await this.eventBus.emit('notify:task_failed', { taskId: newTask.id, title: newTask.title });
    } else if (newTask.status === 'in_review') {
      await this.eventBus.emit('notify:task_in_review', { taskId: newTask.id, title: newTask.title });
    } else if (newTask.status === 'blocked') {
      await this.eventBus.emit('notify:task_blocked', { taskId: newTask.id, title: newTask.title });
    }
  }

  /**
   * Emit notification events for taskSessionStatuses changes.
   * Uses snapshotted oldStatuses to avoid mutation bugs (repo returns mutable references).
   */
  private async emitTaskSessionStatusNotifications(oldTaskStatus: string, oldStatuses: Record<string, string>, newTask: Task): Promise<void> {
    const newStatuses = newTask.taskSessionStatuses || {};

    for (const sessionId of Object.keys(newStatuses)) {
      const oldStatus = oldStatuses[sessionId];
      const newStatus = newStatuses[sessionId];

      if (oldStatus === newStatus) continue;

      if (newStatus === 'completed') {
        await this.eventBus.emit('notify:task_session_completed', { taskId: newTask.id, sessionId, title: newTask.title });
      } else if (newStatus === 'failed') {
        await this.eventBus.emit('notify:task_session_failed', { taskId: newTask.id, sessionId, title: newTask.title });
      }
    }
  }

  /**
   * Delete a task and all its descendants (cascade delete).
   */
  async deleteTask(id: string): Promise<void> {
    const task = await this.taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    // Recursively collect all descendant task IDs
    const descendantIds = await this.collectDescendantIds(id);

    // Delete descendants bottom-up (children first)
    for (const descendantId of descendantIds.reverse()) {
      await this.taskRepo.delete(descendantId);
      await this.taskListRepo.removeTaskReferences(descendantId);
      await this.eventBus.emit('task:deleted', { id: descendantId });
    }

    // Delete the task itself
    await this.taskRepo.delete(id);
    await this.taskListRepo.removeTaskReferences(id);
    await this.eventBus.emit('task:deleted', { id });
  }

  /**
   * Recursively collect all descendant task IDs.
   */
  private async collectDescendantIds(parentId: string): Promise<string[]> {
    const children = await this.taskRepo.findByParentId(parentId);
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      const grandchildren = await this.collectDescendantIds(child.id);
      ids.push(...grandchildren);
    }
    return ids;
  }

  /**
   * Associate a session with a task.
   */
  async addSessionToTask(taskId: string, sessionId: string): Promise<void> {
    await this.taskRepo.addSession(taskId, sessionId);

    await this.eventBus.emit('task:session_added', { taskId, sessionId });
  }

  /**
   * Remove a session association from a task.
   */
  async removeSessionFromTask(taskId: string, sessionId: string): Promise<void> {
    await this.taskRepo.removeSession(taskId, sessionId);

    await this.eventBus.emit('task:session_removed', { taskId, sessionId });
  }

  /**
   * Get task count.
   */
  async getTaskCount(): Promise<number> {
    return this.taskRepo.count();
  }
}
