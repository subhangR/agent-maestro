import { Session, SessionStatus, AgentMode, CreateSessionPayload, UpdateSessionPayload, SessionTimelineEvent, SessionTimelineEventType, DocEntry, TokenUsageSnapshot, LaunchProvider, Task, TaskStatus } from '../../types';
import { ISessionRepository, SessionFilter } from '../../domain/repositories/ISessionRepository';
import { ITaskRepository } from '../../domain/repositories/ITaskRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ValidationError, NotFoundError } from '../../domain/common/Errors';
import { GitWorktreeService } from './GitWorktreeService';
import type { LogDigestService } from './LogDigestService';

/**
 * Application service for session operations.
 * Manages session lifecycle, task associations, and events.
 */
export class SessionService {
  private logDigestService?: LogDigestService;

  constructor(
    private sessionRepo: ISessionRepository,
    private taskRepo: ITaskRepository,
    private projectRepo: IProjectRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator
  ) {}

  setLogDigestService(svc: LogDigestService): void {
    this.logDigestService = svc;
  }

  /**
   * Create a new session.
   */
  async createSession(input: CreateSessionPayload): Promise<Session> {
    // Validation
    if (!input.projectId) {
      throw new ValidationError('Project ID is required');
    }

    // Verify project exists
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      throw new NotFoundError('Project', input.projectId);
    }

    // Inherit master session flag from project
    if (project.isMaster) {
      input.isMasterSession = true;
      input.env = { ...input.env, MAESTRO_IS_MASTER: 'true' };
    }

    // Verify all tasks exist
    if (input.taskIds && input.taskIds.length > 0) {
      for (const taskId of input.taskIds) {
        const task = await this.taskRepo.findById(taskId);
        if (!task) {
          throw new NotFoundError('Task', taskId);
        }
      }
    }

    const session = await this.sessionRepo.create(input);

    // Add session ID to all associated tasks and add timeline events
    for (const taskId of session.taskIds) {
      await this.taskRepo.addSession(taskId, session.id);

      // Add timeline event to session for each task
      const event: SessionTimelineEvent = {
        id: this.idGenerator.generate('evt'),
        type: 'task_started',
        timestamp: Date.now(),
        taskId,
        message: `Started working on task`,
      };
      await this.sessionRepo.addTimelineEvent(session.id, event);
    }

    // Emit events
    if (!input._suppressCreatedEvent) {
      await this.eventBus.emit('session:created', session);

      // Emit task:session_added events
      for (const taskId of session.taskIds) {
        await this.eventBus.emit('task:session_added', { taskId, sessionId: session.id });
      }
    }

    return session;
  }

  /**
   * Get a session by ID.
   */
  async getSession(id: string): Promise<Session> {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session', id);
    }
    return session;
  }

  /**
   * List sessions with optional filtering.
   */
  async listSessions(filter?: SessionFilter): Promise<Session[]> {
    return this.sessionRepo.findAll(filter);
  }

  /**
   * List sessions for a project.
   */
  async listSessionsByProject(projectId: string): Promise<Session[]> {
    return this.sessionRepo.findByProjectId(projectId);
  }

  /**
   * List sessions for a task.
   */
  async listSessionsByTask(taskId: string): Promise<Session[]> {
    return this.sessionRepo.findByTaskId(taskId);
  }

  /**
   * Update a session.
   */
  async updateSession(id: string, updates: UpdateSessionPayload): Promise<Session> {
    // Fetch old session state for comparison
    const oldSession = await this.sessionRepo.findById(id);

    // Snapshot old values BEFORE mutation (findById returns a mutable reference)
    const oldStatus = oldSession?.status;
    const oldNeedsInputActive = oldSession?.needsInput?.active ?? false;

    // Guard: don't overwrite 'completed' with 'stopped'
    if (updates.status === 'stopped') {
      if (oldSession && oldStatus === 'completed') {
        delete updates.status;
        if (Object.keys(updates).length === 0) return oldSession;
      }
    }

    const session = await this.sessionRepo.update(id, updates);

    // Propagate terminal session status to task-level taskSessionStatuses
    if (updates.status && ['stopped', 'completed', 'failed'].includes(updates.status)) {
      const taskSessionStatus = updates.status === 'completed' ? 'completed' : 'failed';
      for (const taskId of session.taskIds) {
        try {
          const task = await this.taskRepo.findById(taskId);
          if (task) {
            const currentTaskSessionStatus = task.taskSessionStatuses?.[id];
            // Only update if the task-session status is still active (working/queued/blocked)
            if (currentTaskSessionStatus && !['completed', 'failed', 'skipped'].includes(currentTaskSessionStatus)) {
              await this.taskRepo.update(taskId, {
                taskSessionStatuses: { ...(task.taskSessionStatuses || {}), [id]: taskSessionStatus },
              });
              const updatedTask = await this.taskRepo.findById(taskId);
              if (updatedTask) {
                await this.eventBus.emit('task:updated', updatedTask);
              }
            }

            // H1: Auto-advance task.status when all sessions reach a terminal state.
            // Re-read to pick up the taskSessionStatuses we just wrote.
            await this.tryAutoAdvanceTask(taskId);
          }
        } catch {
          // Best effort — don't fail the session update if task update fails
        }
      }
    }

    // Best-effort: capture token usage snapshot when session reaches a terminal state
    if (this.logDigestService && updates.status && ['stopped', 'completed', 'failed'].includes(updates.status)) {
      try {
        const statsDigest = await this.logDigestService.getSessionStats(id, { lastMessages: 0 });
        if (statsDigest.jsonlFound) {
          const provider: LaunchProvider | null =
            session.teamMemberSnapshot?.launchConfig?.provider ?? null;
          const model: string | null = statsDigest.models[0] ?? null;
          const snap: TokenUsageSnapshot = {
            input: statsDigest.tokens.input,
            output: statsDigest.tokens.output,
            cacheCreate: statsDigest.tokens.cacheCreate,
            cacheRead: statsDigest.tokens.cacheRead,
            total: statsDigest.tokens.total,
            provider,
            model,
            capturedAt: Date.now(),
          };
          await this.sessionRepo.update(id, { tokenUsage: snap });
        }
      } catch {
        // Best-effort: don't block session status update on log scan failure
      }
    }

    // Emit lightweight status event when only status/lastActivity/needsInput changed,
    // full session:updated for structural changes (name, taskIds, description, etc.)
    const statusOnlyFields = new Set(['status', 'lastActivity', 'needsInput']);
    const updateKeys = Object.keys(updates).filter(k => (updates as any)[k] !== undefined);
    const isStatusOnly = updateKeys.length > 0 && updateKeys.every(k => statusOnlyFields.has(k));

    if (isStatusOnly) {
      await this.eventBus.emit('session:status_changed', {
        id: session.id,
        status: session.status,
        lastActivity: session.lastActivity,
        needsInput: session.needsInput,
      });
    } else {
      await this.eventBus.emit('session:updated', this.toBroadcast(session));
    }

    // Emit notification events for session status transitions (using snapshot)
    if (oldSession && oldStatus !== session.status) {
      if (session.status === 'completed') {
        await this.eventBus.emit('notify:session_completed', { sessionId: session.id, name: session.name });
      } else if (session.status === 'failed') {
        await this.eventBus.emit('notify:session_failed', { sessionId: session.id, name: session.name });
      }
    }

    // Emit notify:needs_input when needsInput.active becomes true (using snapshot)
    if (oldSession && updates.needsInput?.active && !oldNeedsInputActive) {
      await this.eventBus.emit('notify:needs_input', {
        sessionId: session.id,
        name: session.name,
        message: updates.needsInput.message,
      });
    }

    return session;
  }

  /**
   * Delete a session.
   */
  async deleteSession(id: string): Promise<void> {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session', id);
    }

    // Add session_stopped timeline event before deletion
    const stopEvent: SessionTimelineEvent = {
      id: this.idGenerator.generate('evt'),
      type: 'session_stopped',
      timestamp: Date.now(),
      message: 'Session ended',
    };
    await this.sessionRepo.addTimelineEvent(id, stopEvent);

    // Clean up git worktree if session had one
    if (session.metadata?.worktreePath && session.metadata?.worktreeBranch) {
      try {
        const project = await this.projectRepo.findById(session.projectId);
        if (project) {
          const gitWorktreeService = new GitWorktreeService();
          await gitWorktreeService.removeWorktree(
            project.workingDir,
            session.metadata.worktreePath,
            session.metadata.worktreeBranch
          );
        }
      } catch (err) {
        console.warn(`[SessionService] Failed to clean up worktree for session ${id}:`, err);
      }
    }

    // Remove session ID from all associated tasks
    for (const taskId of session.taskIds) {
      const task = await this.taskRepo.findById(taskId);
      if (task) {
        await this.taskRepo.removeSession(taskId, id);
      }
    }

    await this.sessionRepo.delete(id);

    await this.eventBus.emit('session:deleted', { id });
  }

  /**
   * Add a task to a session.
   */
  async addTaskToSession(sessionId: string, taskId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    await this.sessionRepo.addTask(sessionId, taskId);
    await this.taskRepo.addSession(taskId, sessionId);

    // Add timeline event to session
    const event: SessionTimelineEvent = {
      id: this.idGenerator.generate('evt'),
      type: 'task_started',
      timestamp: Date.now(),
      taskId,
      message: `Added task to session`,
    };
    await this.sessionRepo.addTimelineEvent(sessionId, event);

    await this.eventBus.emit('session:task_added', { sessionId, taskId });
    await this.eventBus.emit('task:session_added', { taskId, sessionId });
  }

  /**
   * Remove a task from a session.
   */
  async removeTaskFromSession(sessionId: string, taskId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    await this.sessionRepo.removeTask(sessionId, taskId);
    await this.taskRepo.removeSession(taskId, sessionId);

    // Add timeline event to session
    const event: SessionTimelineEvent = {
      id: this.idGenerator.generate('evt'),
      type: 'task_skipped',
      timestamp: Date.now(),
      taskId,
      message: `Removed task from session`,
    };
    await this.sessionRepo.addTimelineEvent(sessionId, event);

    await this.eventBus.emit('session:task_removed', { sessionId, taskId });
    await this.eventBus.emit('task:session_removed', { taskId, sessionId });
  }

  /**
   * Change session mode (flip role while preserving relation axis).
   */
  async changeMode(id: string, newMode: AgentMode): Promise<{ session: Session; previousMode: AgentMode }> {
    const session = await this.sessionRepo.findById(id);
    if (!session) {
      throw new NotFoundError('Session', id);
    }
    const previousMode = (session.metadata?.mode as AgentMode) || 'worker';
    const updatedSession = await this.sessionRepo.update(id, { mode: newMode });
    return { session: updatedSession, previousMode };
  }

  /**
   * Get session count.
   */
  async getSessionCount(): Promise<number> {
    return this.sessionRepo.count();
  }

  /**
   * Get active session count (idle + working).
   */
  async getRunningSessionCount(): Promise<number> {
    const idle = await this.sessionRepo.countByStatus('idle');
    const working = await this.sessionRepo.countByStatus('working');
    return idle + working;
  }

  /**
   * Shared auto-advance logic (H1 + H4).
   *
   * If the task is in_progress and every session listed in sessionIds has a
   * terminal taskSessionStatuses entry, advance the task to completed (all done)
   * or blocked (any failed). Conservative: a sessionId with no entry is treated
   * as non-terminal so we never false-positive on a session that hasn't started yet.
   *
   * This is the single source of truth used by both the live H1 path
   * (updateSession) and the H4 reconciliation sweep (reconcileStuckTasks).
   */
  private async tryAutoAdvanceTask(taskId: string): Promise<{ advanced: boolean; newStatus: TaskStatus | null }> {
    const task = await this.taskRepo.findById(taskId);
    if (!task || task.status !== 'in_progress' || task.sessionIds.length === 0) {
      return { advanced: false, newStatus: null };
    }
    const statuses = task.taskSessionStatuses ?? {};
    const allTerminal = task.sessionIds.every(sid => {
      const s = statuses[sid];
      return s === 'completed' || s === 'failed' || s === 'skipped';
    });
    if (!allTerminal) return { advanced: false, newStatus: null };

    const anyFailed = task.sessionIds.some(sid => statuses[sid] === 'failed');
    const newTaskStatus: TaskStatus = anyFailed ? 'blocked' : 'completed';
    await this.taskRepo.update(taskId, { status: newTaskStatus });
    const finalTask = await this.taskRepo.findById(taskId);
    if (finalTask) {
      await this.eventBus.emit('task:updated', finalTask);
      if (newTaskStatus === 'completed') {
        await this.eventBus.emit('notify:task_completed', { taskId, title: finalTask.title });
      }
    }
    return { advanced: true, newStatus: newTaskStatus };
  }

  /**
   * H4: Reconcile tasks that are stuck in_progress but whose sessions have all
   * already reached a terminal state. Typically caused by agents that completed
   * before H1 was deployed, or by session crashes that bypassed H3.
   *
   * This is an explicit maintenance operation — call it when you want to heal
   * stuck tasks. It is NOT called on startup.
   *
   * @param options.dryRun - When true (default), report what would change without
   *   mutating any data. Set to false to apply the advances.
   */
  async reconcileStuckTasks(options: { dryRun?: boolean } = {}): Promise<{
    found: number;
    advanced: Array<{ taskId: string; title: string; oldStatus: TaskStatus; newStatus: TaskStatus }>;
    skipped: number;
    errors: string[];
    dryRun: boolean;
  }> {
    const dryRun = options.dryRun !== false; // default true
    const inProgressTasks = await this.taskRepo.findByStatus('in_progress');

    const advanced: Array<{ taskId: string; title: string; oldStatus: TaskStatus; newStatus: TaskStatus }> = [];
    const errors: string[] = [];
    let skipped = 0;

    for (const task of inProgressTasks) {
      try {
        if (task.sessionIds.length === 0) {
          skipped++;
          continue;
        }
        const statuses = task.taskSessionStatuses ?? {};
        const allTerminal = task.sessionIds.every(sid => {
          const s = statuses[sid];
          return s === 'completed' || s === 'failed' || s === 'skipped';
        });
        if (!allTerminal) {
          skipped++;
          continue;
        }

        const anyFailed = task.sessionIds.some(sid => statuses[sid] === 'failed');
        const newTaskStatus: TaskStatus = anyFailed ? 'blocked' : 'completed';

        if (!dryRun) {
          // Delegate to the shared method so the exact same logic (including events) runs
          await this.tryAutoAdvanceTask(task.id);
        }

        advanced.push({ taskId: task.id, title: task.title, oldStatus: 'in_progress', newStatus: newTaskStatus });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`task ${task.id}: ${msg}`);
      }
    }

    return { found: advanced.length + errors.length, advanced, skipped, errors, dryRun };
  }

  /**
   * Bound the arrays a `session:updated` broadcast carries. The full session is
   * kept on disk (and served via getReplay / GET /sessions/:id?fields=full), but
   * `timeline[]`/`events[]` grow WITHOUT BOUND as an agent streams, and this
   * event fires ~2×/sec per session. Broadcasting the whole growing object makes
   * every client's per-message parse cost climb over the life of a session —
   * felt as terminal/UI lag that worsens the longer the fleet runs, even after
   * the client caps what it RETAINS. Send only a recent tail so the message size
   * (and parse cost) stays constant. Returns the session unchanged when it's
   * already small, to avoid copying on the hot path.
   */
  private toBroadcast(session: Session): Session {
    const TAIL = 100;
    const tl = session.timeline;
    const ev = session.events;
    const trimTl = Array.isArray(tl) && tl.length > TAIL;
    const trimEv = Array.isArray(ev) && ev.length > TAIL;
    if (!trimTl && !trimEv) return session;
    return {
      ...session,
      ...(trimTl ? { timeline: tl.slice(-TAIL) } : {}),
      ...(trimEv ? { events: ev.slice(-TAIL) } : {}),
    };
  }

  /**
   * Add an event to a session.
   */
  async addEventToSession(sessionId: string, event: { type: string; data?: any }): Promise<Session> {
    const session = await this.sessionRepo.addEvent(sessionId, event);

    await this.eventBus.emit('session:updated', this.toBroadcast(session));

    return session;
  }

  /**
   * Add a timeline event to a session.
   * This is the primary method for logging session activity.
   */
  async addTimelineEvent(
    sessionId: string,
    type: SessionTimelineEventType,
    message?: string,
    taskId?: string,
    metadata?: Record<string, any>
  ): Promise<Session> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    const event: SessionTimelineEvent = {
      id: this.idGenerator.generate('evt'),
      type,
      timestamp: Date.now(),
      message,
      taskId,
      metadata,
    };

    await this.sessionRepo.addTimelineEvent(sessionId, event);

    // Auto-set needsInput flag when needs_input timeline event is added
    if (type === 'needs_input') {
      await this.sessionRepo.update(sessionId, {
        needsInput: { active: true, message, since: Date.now() },
      });
    }

    // Fetch the fully updated session after all mutations
    const updatedSession = await this.sessionRepo.findById(sessionId);
    if (!updatedSession) {
      throw new NotFoundError('Session', sessionId);
    }

    await this.eventBus.emit('session:updated', this.toBroadcast(updatedSession));

    // Emit notification events for specific timeline event types
    if (type === 'progress') {
      await this.eventBus.emit('notify:progress', {
        sessionId,
        taskId,
        message,
      });
    } else if (type === 'needs_input') {
      await this.eventBus.emit('notify:needs_input', {
        sessionId,
        name: updatedSession.name,
        message,
      });
    }

    return updatedSession;
  }

  /**
   * Add a document to a session and create a timeline event.
   */
  async addDoc(
    sessionId: string,
    title: string,
    filePath: string,
    content?: string,
    taskId?: string,
    kind?: 'markdown' | 'diagram',
  ): Promise<Session> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    const doc: DocEntry = {
      id: this.idGenerator.generate('doc'),
      title,
      filePath,
      kind,
      content,
      taskId,
      addedAt: Date.now(),
      addedBy: sessionId,
    };

    await this.sessionRepo.addDoc(sessionId, doc);

    // Also add a timeline event
    const event: SessionTimelineEvent = {
      id: this.idGenerator.generate('evt'),
      type: 'doc_added',
      timestamp: Date.now(),
      message: `Doc added: ${title}`,
      taskId,
      metadata: { docId: doc.id, filePath, title },
    };
    await this.sessionRepo.addTimelineEvent(sessionId, event);

    const updatedSession = await this.sessionRepo.findById(sessionId);
    if (!updatedSession) {
      throw new NotFoundError('Session', sessionId);
    }

    await this.eventBus.emit('session:updated', this.toBroadcast(updatedSession));

    return updatedSession;
  }

  /**
   * Get docs for a session with content hydrated from files on demand.
   */
  async getSessionDocsWithContent(sessionId: string): Promise<DocEntry[]> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    const docs = session.docs || [];
    const hydratedDocs: DocEntry[] = [];

    for (const doc of docs) {
      if (doc.content) {
        // Legacy: inline content still present
        hydratedDocs.push({ ...doc });
      } else if (doc.contentFilePath) {
        // Read content from file
        const content = await this.sessionRepo.getDocContent(sessionId, doc.id);
        hydratedDocs.push({ ...doc, content: content || undefined });
      } else {
        hydratedDocs.push({ ...doc });
      }
    }

    return hydratedDocs;
  }

  /**
   * Overwrite the content of an existing doc (used to re-save diagram scene JSON).
   */
  async updateDocContent(sessionId: string, docId: string, content: string): Promise<boolean> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }
    return this.sessionRepo.updateDocContent(sessionId, docId, content);
  }

  /**
   * Aggregate all docs across every session in a project, deduped by docId, content hydrated.
   */
  async getProjectDocsWithContent(projectId: string): Promise<DocEntry[]> {
    const sessions = await this.sessionRepo.findByProjectId(projectId);
    const seen = new Set<string>();
    const result: DocEntry[] = [];

    for (const session of sessions) {
      const docs = await this.getSessionDocsWithContent(session.id);
      for (const doc of docs) {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          result.push({ ...doc, sessionId: session.id, sessionName: session.name } as DocEntry & { sessionId: string; sessionName: string });
        }
      }
    }

    result.sort((a, b) => a.addedAt - b.addedAt);
    return result;
  }
}
