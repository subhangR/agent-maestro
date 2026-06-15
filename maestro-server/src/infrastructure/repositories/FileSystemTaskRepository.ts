import * as fs from 'fs/promises';
import * as path from 'path';
import { Task, TaskStatus, CreateTaskPayload, UpdateTaskPayload } from '../../types';
import { ITaskRepository, TaskFilter } from '../../domain/repositories/ITaskRepository';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';
import { loadFilesParallel } from './utils/parallelFileLoader';
import { WriteBatcher } from './utils/writeBatcher';

/**
 * File system based implementation of ITaskRepository.
 * Stores tasks as JSON files organized by project.
 */
export class FileSystemTaskRepository implements ITaskRepository {
  private tasksDir: string;
  private tasks: Map<string, Task>;
  private initialized: boolean = false;

  // Phase 1: LRU eviction
  private readonly MAX_CACHED_TASKS = 5000;
  private readonly EVICTION_BATCH = 500;
  private taskAccessTime: Map<string, number> = new Map();
  private taskProjectIndex: Map<string, string> = new Map(); // taskId → projectId (never evicted)

  // Phase 2: Secondary indexes
  private projectIndex: Map<string, Set<string>> = new Map();
  private statusIndex: Map<string, Set<string>> = new Map();
  private parentIndex: Map<string, Set<string>> = new Map();
  private sessionIndex: Map<string, Set<string>> = new Map();

  // Phase 3: Write optimization
  private createdDirs: Set<string> = new Set();
  private writeBatcher: WriteBatcher;

  constructor(
    private dataDir: string,
    private idGenerator: IIdGenerator,
    private logger: ILogger
  ) {
    this.tasksDir = path.join(dataDir, 'tasks');
    this.tasks = new Map();
    this.writeBatcher = new WriteBatcher({ flushIntervalMs: 500 });
  }

  // --- Secondary index helpers ---

  private addToIndex(index: Map<string, Set<string>>, key: string, taskId: string): void {
    if (!index.has(key)) index.set(key, new Set());
    index.get(key)!.add(taskId);
  }

  private removeFromIndex(index: Map<string, Set<string>>, key: string, taskId: string): void {
    index.get(key)?.delete(taskId);
    if (index.get(key)?.size === 0) index.delete(key);
  }

  private indexTask(task: Task): void {
    this.addToIndex(this.projectIndex, task.projectId, task.id);
    this.addToIndex(this.statusIndex, task.status, task.id);
    if (task.parentId) this.addToIndex(this.parentIndex, task.parentId, task.id);
    for (const sid of task.sessionIds ?? []) {
      this.addToIndex(this.sessionIndex, sid, task.id);
    }
  }

  private unindexTask(task: Task): void {
    this.removeFromIndex(this.projectIndex, task.projectId, task.id);
    this.removeFromIndex(this.statusIndex, task.status, task.id);
    if (task.parentId) this.removeFromIndex(this.parentIndex, task.parentId, task.id);
    for (const sid of task.sessionIds ?? []) {
      this.removeFromIndex(this.sessionIndex, sid, task.id);
    }
  }

  // --- LRU eviction ---

  private evictIfNeeded(): void {
    if (this.tasks.size <= this.MAX_CACHED_TASKS) return;

    // Collect completed/cancelled tasks sorted by access time
    const evictable: { id: string; accessTime: number }[] = [];
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'cancelled') {
        evictable.push({ id, accessTime: this.taskAccessTime.get(id) ?? 0 });
      }
    }

    evictable.sort((a, b) => a.accessTime - b.accessTime);

    const toEvict = evictable.slice(0, this.EVICTION_BATCH);
    for (const { id } of toEvict) {
      const task = this.tasks.get(id);
      if (task) {
        this.unindexTask(task);
        this.tasks.delete(id);
        this.taskAccessTime.delete(id);
      }
      // taskProjectIndex is never evicted — needed for lazy reload
    }
  }

  private async ensureDir(dirPath: string): Promise<void> {
    if (this.createdDirs.has(dirPath)) return;
    await fs.mkdir(dirPath, { recursive: true });
    this.createdDirs.add(dirPath);
  }

  /**
   * Initialize the repository by loading existing data.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.ensureDir(this.tasksDir);

      const entries = await fs.readdir(this.tasksDir, { withFileTypes: true });

      // Collect all file paths first
      const filePaths: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectTasksDir = path.join(this.tasksDir, entry.name);
          this.createdDirs.add(projectTasksDir);
          const taskFiles = await fs.readdir(projectTasksDir);
          for (const file of taskFiles.filter(f => f.endsWith('.json'))) {
            filePaths.push(path.join(projectTasksDir, file));
          }
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          filePaths.push(path.join(this.tasksDir, entry.name));
        }
      }

      // Load all files in parallel
      const { successes, failures } = await loadFilesParallel(
        filePaths,
        async (filePath) => {
          const data = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(data) as Task;
        },
        { concurrency: 50 }
      );

      for (const failure of failures) {
        this.logger.warn(`Failed to load task file: ${failure.path}`, { error: failure.error.message });
      }

      const now = Date.now();
      for (const task of successes) {
        // Initialize fields if missing
        if (!task.sessionIds) task.sessionIds = [];
        if (!task.skillIds) task.skillIds = [];
        if (!task.agentIds) task.agentIds = [];
        if (!task.referenceTaskIds) task.referenceTaskIds = [];

        // Migrate legacy sessionStatus -> taskSessionStatuses
        if ((task as any).sessionStatus && !task.taskSessionStatuses) {
          if (task.sessionIds.length > 0) {
            task.taskSessionStatuses = { [task.sessionIds[0]]: (task as any).sessionStatus };
          }
          delete (task as any).sessionStatus;
        }
        if (!task.taskSessionStatuses) task.taskSessionStatuses = {};
        if (task.dueDate === undefined) task.dueDate = null;

        // Always populate taskProjectIndex (never evicted)
        this.taskProjectIndex.set(task.id, task.projectId);

        this.tasks.set(task.id, task);
        this.taskAccessTime.set(task.id, now);
        this.indexTask(task);
      }

      // Evict old completed tasks if we loaded too many
      this.evictIfNeeded();

      this.logger.info(`Loaded ${this.tasks.size} tasks (${successes.length} total on disk)`);
      this.initialized = true;
    } catch (err) {
      this.logger.error('Failed to initialize task repository:', err as Error);
      throw err;
    }
  }

  /**
   * Lazy-load a single task from disk (for cache misses after eviction).
   */
  private async loadTaskFromDisk(taskId: string): Promise<Task | null> {
    const projectId = this.taskProjectIndex.get(taskId);
    if (!projectId) return null;

    try {
      const filePath = path.join(this.tasksDir, projectId, `${taskId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const task = JSON.parse(data) as Task;

      if (!task.sessionIds) task.sessionIds = [];
      if (!task.skillIds) task.skillIds = [];
      if (!task.agentIds) task.agentIds = [];
      if (!task.referenceTaskIds) task.referenceTaskIds = [];
      if (!task.taskSessionStatuses) task.taskSessionStatuses = {};
      if (task.dueDate === undefined) task.dueDate = null;

      // Re-add to cache
      this.tasks.set(task.id, task);
      this.taskAccessTime.set(task.id, Date.now());
      this.indexTask(task);

      this.evictIfNeeded();

      return task;
    } catch {
      return null;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async saveTask(task: Task): Promise<void> {
    const projectTasksDir = path.join(this.tasksDir, task.projectId);
    await this.ensureDir(projectTasksDir);
    const filePath = path.join(projectTasksDir, `${task.id}.json`);
    this.writeBatcher.markDirty(task.id, filePath, JSON.stringify(task));
  }

  private async deleteTaskFile(task: Task): Promise<void> {
    // Flush any pending write for this task first
    await this.writeBatcher.flush();
    const filePath = path.join(this.tasksDir, task.projectId, `${task.id}.json`);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }

  async create(input: CreateTaskPayload): Promise<Task> {
    await this.ensureInitialized();

    const task: Task = {
      id: this.idGenerator.generate('task'),
      projectId: input.projectId,
      parentId: input.parentId || null,
      title: input.title,
      description: input.description || '',
      status: 'todo' as TaskStatus,
      priority: input.priority || 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      initialPrompt: input.initialPrompt || '',
      sessionIds: [],
      skillIds: input.skillIds || [],
      agentIds: [],
      dependencies: [],
      referenceTaskIds: input.referenceTaskIds || [],
      teamMemberId: input.teamMemberId,
      teamMemberIds: input.teamMemberIds,
      teamId: input.teamId ?? null,
      dueDate: input.dueDate || null,
      memberOverrides: input.memberOverrides,
      dangerousMode: input.dangerousMode,
      useWorktree: input.useWorktree,
      clientRequestId: input.clientRequestId,
    };

    this.tasks.set(task.id, task);
    this.taskAccessTime.set(task.id, Date.now());
    this.taskProjectIndex.set(task.id, task.projectId);
    this.indexTask(task);
    await this.saveTask(task);

    this.evictIfNeeded();

    this.logger.debug(`Created task: ${task.id}`);
    return task;
  }

  async findById(id: string): Promise<Task | null> {
    await this.ensureInitialized();

    const cached = this.tasks.get(id);
    if (cached) {
      this.taskAccessTime.set(id, Date.now());
      return cached;
    }

    // Cache miss — try lazy-load from disk
    return this.loadTaskFromDisk(id);
  }

  async findByProjectId(projectId: string): Promise<Task[]> {
    await this.ensureInitialized();
    const taskIds = this.projectIndex.get(projectId);
    if (!taskIds) return [];
    const tasks: Task[] = [];
    for (const id of taskIds) {
      const task = this.tasks.get(id);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    await this.ensureInitialized();
    const taskIds = this.statusIndex.get(status);
    if (!taskIds) return [];
    const tasks: Task[] = [];
    for (const id of taskIds) {
      const task = this.tasks.get(id);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async findByParentId(parentId: string | null): Promise<Task[]> {
    await this.ensureInitialized();
    if (parentId === null) {
      // Can't use index for null — scan
      return Array.from(this.tasks.values()).filter(t => t.parentId === null);
    }
    const taskIds = this.parentIndex.get(parentId);
    if (!taskIds) return [];
    const tasks: Task[] = [];
    for (const id of taskIds) {
      const task = this.tasks.get(id);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async findBySessionId(sessionId: string): Promise<Task[]> {
    await this.ensureInitialized();
    const taskIds = this.sessionIndex.get(sessionId);
    if (!taskIds) return [];
    const tasks: Task[] = [];
    for (const id of taskIds) {
      const task = this.tasks.get(id);
      if (task) tasks.push(task);
    }
    return tasks;
  }

  async findAll(filter?: TaskFilter): Promise<Task[]> {
    await this.ensureInitialized();

    // Use index intersection when filters provided
    if (filter) {
      let candidateIds: Set<string> | null = null;

      if (filter.projectId) {
        candidateIds = new Set(this.projectIndex.get(filter.projectId) ?? []);
      }
      if (filter.status) {
        const statusIds = this.statusIndex.get(filter.status) ?? new Set();
        if (candidateIds) {
          candidateIds = new Set([...candidateIds].filter(id => statusIds.has(id)));
        } else {
          candidateIds = new Set(statusIds);
        }
      }
      if (filter.parentId !== undefined) {
        if (filter.parentId === null) {
          // Special case: null parentId needs full scan of candidates
          if (candidateIds) {
            candidateIds = new Set([...candidateIds].filter(id => {
              const task = this.tasks.get(id);
              return task && task.parentId === null;
            }));
          } else {
            return Array.from(this.tasks.values()).filter(t => t.parentId === null);
          }
        } else {
          const parentIds = this.parentIndex.get(filter.parentId) ?? new Set();
          if (candidateIds) {
            candidateIds = new Set([...candidateIds].filter(id => parentIds.has(id)));
          } else {
            candidateIds = new Set(parentIds);
          }
        }
      }
      if (filter.sessionId) {
        const sessionIds = this.sessionIndex.get(filter.sessionId) ?? new Set();
        if (candidateIds) {
          candidateIds = new Set([...candidateIds].filter(id => sessionIds.has(id)));
        } else {
          candidateIds = new Set(sessionIds);
        }
      }

      if (candidateIds) {
        const tasks: Task[] = [];
        for (const id of candidateIds) {
          const task = this.tasks.get(id);
          if (task) tasks.push(task);
        }
        return tasks;
      }
    }

    return Array.from(this.tasks.values());
  }

  async update(id: string, updates: UpdateTaskPayload): Promise<Task> {
    await this.ensureInitialized();

    const task = this.tasks.get(id) ?? await this.loadTaskFromDisk(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    // Unindex old state
    this.unindexTask(task);

    // Apply updates
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.sessionIds !== undefined) task.sessionIds = updates.sessionIds;
    if (updates.skillIds !== undefined) task.skillIds = updates.skillIds;
    if (updates.agentIds !== undefined) task.agentIds = updates.agentIds;
    if (updates.taskSessionStatuses !== undefined) {
      task.taskSessionStatuses = { ...(task.taskSessionStatuses || {}), ...updates.taskSessionStatuses };
    }
    if (updates.referenceTaskIds !== undefined) task.referenceTaskIds = updates.referenceTaskIds;
    if (updates.pinned !== undefined) task.pinned = updates.pinned;
    if (updates.teamMemberId !== undefined) task.teamMemberId = updates.teamMemberId;
    if (updates.teamMemberIds !== undefined) task.teamMemberIds = updates.teamMemberIds;
    if (updates.teamId !== undefined) task.teamId = updates.teamId;
    if (updates.images !== undefined) task.images = updates.images;
    if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
    if (updates.memberOverrides !== undefined) task.memberOverrides = updates.memberOverrides;
    if (updates.dangerousMode !== undefined) task.dangerousMode = updates.dangerousMode;
    if (updates.useWorktree !== undefined) task.useWorktree = updates.useWorktree;

    if (updates.status !== undefined) {
      task.status = updates.status;
      if (updates.status === 'in_progress' && !task.startedAt) {
        task.startedAt = Date.now();
      }
      if (updates.status === 'completed' && !task.completedAt) {
        task.completedAt = Date.now();
      }
    }

    task.updatedAt = Date.now();

    this.tasks.set(id, task);
    this.taskAccessTime.set(id, Date.now());
    // Re-index new state
    this.indexTask(task);
    await this.saveTask(task);

    this.logger.debug(`Updated task: ${id}`);
    return task;
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();

    const task = this.tasks.get(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    this.unindexTask(task);
    this.tasks.delete(id);
    this.taskAccessTime.delete(id);
    this.taskProjectIndex.delete(id);
    await this.deleteTaskFile(task);

    this.logger.debug(`Deleted task: ${id}`);
  }

  async addSession(taskId: string, sessionId: string): Promise<void> {
    await this.ensureInitialized();

    const task = this.tasks.get(taskId) ?? await this.loadTaskFromDisk(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    if (!task.sessionIds.includes(sessionId)) {
      task.sessionIds.push(sessionId);
      task.updatedAt = Date.now();
      this.tasks.set(taskId, task);
      // Update session index
      this.addToIndex(this.sessionIndex, sessionId, taskId);
      await this.saveTask(task);
    }
  }

  async removeSession(taskId: string, sessionId: string): Promise<void> {
    await this.ensureInitialized();

    const task = this.tasks.get(taskId) ?? await this.loadTaskFromDisk(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    task.sessionIds = task.sessionIds.filter(id => id !== sessionId);
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);
    // Update session index
    this.removeFromIndex(this.sessionIndex, sessionId, taskId);
    await this.saveTask(task);
  }

  async existsByProjectId(projectId: string): Promise<boolean> {
    await this.ensureInitialized();
    return (this.projectIndex.get(projectId)?.size ?? 0) > 0;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.tasks.size;
  }

  async flush(): Promise<void> {
    await this.writeBatcher.flush();
  }
}
