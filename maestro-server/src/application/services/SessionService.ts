import { Session, SessionStatus, AgentMode, NeedsInputSource, NEEDS_INPUT_SOURCE_ENDS_TURN, isNeedsInputSource, CreateSessionPayload, UpdateSessionPayload, SessionTimelineEvent, SessionTimelineEventType, DocEntry } from '../../types';
import { ISessionRepository, SessionFilter } from '../../domain/repositories/ISessionRepository';
import { ITaskRepository } from '../../domain/repositories/ITaskRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ValidationError, NotFoundError } from '../../domain/common/Errors';
import { GitWorktreeService } from './GitWorktreeService';

/** Statuses that a turn-end signal is allowed to demote. */
const IN_TURN_STATUSES: ReadonlySet<SessionStatus> = new Set<SessionStatus>(['working', 'spawning']);

/**
 * Decide whether an incoming update carries an end-of-turn signal that should
 * move the session out of a working status.
 *
 * Exported for direct unit testing — the rule is the whole point of the fix, and
 * it is much easier to pin down here than through the full repository stack.
 */
export function isTurnEndSignal(
  updates: Pick<UpdateSessionPayload, 'status' | 'needsInput'>,
  currentStatus: SessionStatus | undefined,
): boolean {
  // Only an assertion that the session needs input can end a turn.
  if (updates.needsInput?.active !== true) return false;

  // The caller named a status explicitly — respect it rather than second-guess.
  // This keeps `{ status: 'completed', needsInput: {...} }` intact.
  if (updates.status !== undefined) return false;

  // Nothing to demote unless the session is mid-turn.
  if (currentStatus === undefined || !IN_TURN_STATUSES.has(currentStatus)) return false;

  const source = updates.needsInput.source;
  // Untagged callers get NO demotion. A pre-upgrade plugin bundle calls
  // `maestro session needs-input` with no --source from PostToolUseFailure just
  // as it does from Stop, so an untagged signal carries no evidence that the
  // turn ended. Guessing "ended" there would report a false "done" mid-turn,
  // which is strictly worse than the stuck spinner we fall back to.
  if (source === undefined) return false;

  return NEEDS_INPUT_SOURCE_ENDS_TURN[source];
}

/**
 * Application service for session operations.
 * Manages session lifecycle, task associations, and events.
 */
export class SessionService {
  constructor(
    private sessionRepo: ISessionRepository,
    private taskRepo: ITaskRepository,
    private projectRepo: IProjectRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator
  ) {}

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

    // Turn-end is authoritative here, not at the client. Clients only ever push
    // status *forward* to 'working' (worker init/resume, session register,
    // resume-working) and never back, so status was a one-way latch that stayed
    // 'working' for the life of the session. needsInput.active=true — written by
    // the Stop / Notification hooks via `maestro session needs-input` — is the
    // real end-of-turn signal, so derive the status demotion from it.
    //
    // The decision is made against a status re-read immediately before the write,
    // NOT against `oldStatus`. updateSession is called concurrently from a dozen
    // sites (session/git routes, PtyHostService, LogDigestService), so `oldStatus`
    // — captured before an await — can already be obsolete: a concurrent call may
    // have landed 'completed' in the meantime, and demoting from the stale read
    // would silently revert a terminal status.
    if (isTurnEndSignal(updates, oldStatus)) {
      const currentStatus = (await this.sessionRepo.findById(id))?.status;
      if (isTurnEndSignal(updates, currentStatus)) {
        updates.status = 'idle';
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
          }
        } catch {
          // Best effort — don't fail the session update if task update fails
        }
      }
    }

    // Emit lightweight status event when only status/lastActivity/needsInput changed,
    // full session:updated for structural changes (name, taskIds, description, etc.)
    const statusOnlyFields = new Set(['status', 'lastActivity', 'needsInput']);
    const updateKeys = Object.keys(updates).filter(k => (updates as any)[k] !== undefined);
    const isStatusOnly = updateKeys.length > 0 && updateKeys.every(k => statusOnlyFields.has(k));

    // Did the visible state (status or needsInput.active) actually transition?
    const newNeedsInputActive = session.needsInput?.active ?? false;
    const statusTransitioned =
      !!oldSession && (oldStatus !== session.status || oldNeedsInputActive !== newNeedsInputActive);

    if (isStatusOnly) {
      await this.eventBus.emit('session:status_changed', {
        id: session.id,
        status: session.status,
        lastActivity: session.lastActivity,
        needsInput: session.needsInput,
      });
    } else if (statusTransitioned) {
      // A structural update (e.g. the CLI's needs-input PATCH, which carries a
      // `timeline` entry alongside `needsInput`) can also flip status/needsInput.
      // session:updated is batched + throttled; the transition itself must take
      // the immediate lane, so emit the lightweight event as well when it moved.
      //
      // Emitted concurrently, not in sequence: InMemoryEventBus.emit awaits every
      // listener, so awaiting session:updated first would hold the latency-
      // sensitive status frame behind them — exactly what the immediate lane is
      // there to avoid. Listener invocation order is unchanged (Promise.all calls
      // them in array order), so WebSocketBridge still sees session:updated first
      // and reconciles the status frame against it.
      await Promise.all([
        this.eventBus.emit('session:updated', session),
        this.eventBus.emit('session:status_changed', {
          id: session.id,
          status: session.status,
          lastActivity: session.lastActivity,
          needsInput: session.needsInput,
        }),
      ]);
    } else {
      await this.eventBus.emit('session:updated', session);
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
      type: 'task_completed',  // Or could be task_skipped depending on context
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
   * Add an event to a session.
   */
  async addEventToSession(sessionId: string, event: { type: string; data?: any }): Promise<Session> {
    const session = await this.sessionRepo.addEvent(sessionId, event);

    await this.eventBus.emit('session:updated', session);

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

    // Auto-set needsInput flag when needs_input timeline event is added.
    // This writes through the repository rather than updateSession(), so the
    // turn-end rule has to be applied here too — otherwise this path could leave
    // status='working' alongside needsInput.active=true, the exact contradiction
    // that keeps the chat panel spinning after the agent has finished.
    if (type === 'needs_input') {
      // `metadata` reaches us from POST /sessions/:id/timeline, whose Zod schema
      // validates it only as a record of unknowns — any string passes. Narrow it
      // at runtime; an unrecognised value is dropped and treated exactly like an
      // absent one (no demotion), so a bogus source cannot manufacture a turn end
      // and cannot be persisted onto the session either.
      const rawSource = metadata?.source;
      const source: NeedsInputSource | undefined = isNeedsInputSource(rawSource) ? rawSource : undefined;
      const needsInputUpdate: UpdateSessionPayload = {
        needsInput: { active: true, message, since: Date.now(), source },
      };
      // Re-read the status right before the write for the same reason as
      // updateSession: `session` was captured before two awaits.
      const currentStatus = (await this.sessionRepo.findById(sessionId))?.status ?? session.status;
      if (isTurnEndSignal(needsInputUpdate, currentStatus)) {
        needsInputUpdate.status = 'idle';
      }
      await this.sessionRepo.update(sessionId, needsInputUpdate);
    }

    // Fetch the fully updated session after all mutations
    const updatedSession = await this.sessionRepo.findById(sessionId);
    if (!updatedSession) {
      throw new NotFoundError('Session', sessionId);
    }

    // session:updated is batched and throttled; a turn ending is the one thing
    // the UI must repaint without delay, so also emit the lightweight status
    // event that takes the immediate lane in WebSocketBridge. Emitted
    // concurrently so the status frame does not queue behind session:updated's
    // listeners (see the matching note in updateSession).
    if (type === 'needs_input') {
      await Promise.all([
        this.eventBus.emit('session:updated', updatedSession),
        this.eventBus.emit('session:status_changed', {
          id: updatedSession.id,
          status: updatedSession.status,
          lastActivity: updatedSession.lastActivity,
          needsInput: updatedSession.needsInput,
        }),
      ]);
    } else {
      await this.eventBus.emit('session:updated', updatedSession);
    }

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

    await this.eventBus.emit('session:updated', updatedSession);

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
