/**
 * H1: Auto-advance task.status when all sessions for a task reach terminal state.
 *
 * When worker-init.ts sets task.status = 'in_progress' at session start, nothing
 * used to roll it back automatically. This test verifies that SessionService now
 * auto-advances the task when all sessions in taskSessionStatuses are terminal.
 */

import { TestDataDir, createTestContainer, createTestProject, createTestTask, createTestSession } from './helpers';

describe('Harness H1 — task.status auto-advance on session completion', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());

    const project = await container.projectService.createProject(createTestProject());
    projectId = project.id;

    const task = await container.taskService.createTask(createTestTask(projectId));
    taskId = task.id;
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('auto-advances task to completed when the sole session completes', async () => {
    // Create and start a session — simulates worker-init.ts behavior
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );

    // Simulate worker-init: set task.status = 'in_progress' + taskSessionStatuses[sid] = 'working'
    await container.taskService.updateTask(taskId, { status: 'in_progress' });
    await container.taskService.updateTask(taskId, {
      taskSessionStatuses: { [session.id]: 'working' },
    });

    // Session completes — this is what `maestro session report complete` triggers
    await container.sessionService.updateSession(session.id, { status: 'completed' });

    // Task should have been auto-advanced
    const task = await container.taskService.getTask(taskId);
    expect(task.status).toBe('completed');
  });

  it('auto-advances task to completed only when ALL sessions complete', async () => {
    // Two sessions on the same task
    const sess1 = await container.sessionService.createSession(
      createTestSession(projectId, [taskId], { name: 'Session 1' })
    );
    const sess2 = await container.sessionService.createSession(
      createTestSession(projectId, [taskId], { name: 'Session 2' })
    );

    await container.taskService.updateTask(taskId, { status: 'in_progress' });
    await container.taskService.updateTask(taskId, {
      taskSessionStatuses: { [sess1.id]: 'working', [sess2.id]: 'working' },
    });

    // Only sess1 completes
    await container.sessionService.updateSession(sess1.id, { status: 'completed' });

    let task = await container.taskService.getTask(taskId);
    expect(task.status).toBe('in_progress'); // not advanced yet — sess2 still active

    // sess2 also completes
    await container.sessionService.updateSession(sess2.id, { status: 'completed' });

    task = await container.taskService.getTask(taskId);
    expect(task.status).toBe('completed');
  });

  it('auto-advances task to blocked when any session fails/stops', async () => {
    const sess1 = await container.sessionService.createSession(
      createTestSession(projectId, [taskId], { name: 'Session 1' })
    );
    const sess2 = await container.sessionService.createSession(
      createTestSession(projectId, [taskId], { name: 'Session 2' })
    );

    await container.taskService.updateTask(taskId, { status: 'in_progress' });
    await container.taskService.updateTask(taskId, {
      taskSessionStatuses: { [sess1.id]: 'working', [sess2.id]: 'working' },
    });

    // sess1 stops (maps to taskSessionStatus = 'failed')
    await container.sessionService.updateSession(sess1.id, { status: 'stopped' });

    let task = await container.taskService.getTask(taskId);
    expect(task.status).toBe('in_progress'); // sess2 still active

    // sess2 completes
    await container.sessionService.updateSession(sess2.id, { status: 'completed' });

    task = await container.taskService.getTask(taskId);
    // Mixed: one failed, one completed → blocked (needs attention)
    expect(task.status).toBe('blocked');
  });

  it('does NOT auto-advance if task.status is already completed (no regression)', async () => {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );

    // Task already marked completed by user/coordinator
    await container.taskService.updateTask(taskId, { status: 'completed' });
    await container.taskService.updateTask(taskId, {
      taskSessionStatuses: { [session.id]: 'working' },
    });

    await container.sessionService.updateSession(session.id, { status: 'completed' });

    const task = await container.taskService.getTask(taskId);
    expect(task.status).toBe('completed'); // unchanged — was already completed
  });

  it('does NOT auto-advance if task.status is todo (session was added without worker-init)', async () => {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );

    // Task status stays 'todo' — no worker-init ran
    await container.taskService.updateTask(taskId, {
      taskSessionStatuses: { [session.id]: 'working' },
    });

    await container.sessionService.updateSession(session.id, { status: 'completed' });

    const task = await container.taskService.getTask(taskId);
    // Not auto-advanced: only in_progress triggers auto-advance
    // (todo is the user's initial state and shouldn't be changed by session lifecycle)
    expect(task.status).toBe('todo');
  });

  it('emits task:updated event when auto-advancing task status', async () => {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );

    await container.taskService.updateTask(taskId, { status: 'in_progress' });
    await container.taskService.updateTask(taskId, {
      taskSessionStatuses: { [session.id]: 'working' },
    });

    const emittedEvents: string[] = [];
    container.eventBus.on('task:updated', () => { emittedEvents.push('task:updated'); });

    await container.sessionService.updateSession(session.id, { status: 'completed' });

    expect(emittedEvents).toContain('task:updated');
  });
});
