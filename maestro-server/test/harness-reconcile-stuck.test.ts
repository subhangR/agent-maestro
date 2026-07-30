/**
 * H4: reconcileStuckTasks — heal tasks that are stuck in_progress because
 * all their sessions already reached a terminal state before H1 was deployed.
 *
 * The reconciliation uses the same shared tryAutoAdvanceTask logic as the live
 * H1 path in updateSession, so the two cannot drift apart.
 */

import { TestDataDir, createTestContainer, createTestProject, createTestTask, createTestSession } from './helpers';

describe('Harness H4 — reconcileStuckTasks', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let projectId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());

    const project = await container.projectService.createProject(createTestProject());
    projectId = project.id;
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  /**
   * Helper: create a task, attach a session, simulate worker-init (set
   * in_progress + working), then mark the session terminal via updateSession
   * so taskSessionStatuses gets written — but leave task.status alone so the
   * task is stuck in_progress.
   */
  async function makeStuckTask(sessionStatus: 'completed' | 'stopped' | 'failed' = 'completed') {
    const task = await container.taskService.createTask(createTestTask(projectId));
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [task.id])
    );

    // Simulate worker-init
    await container.taskService.updateTask(task.id, { status: 'in_progress' });
    await container.taskService.updateTask(task.id, {
      taskSessionStatuses: { [session.id]: 'working' },
    });

    // Mark session terminal — this writes taskSessionStatuses[sid] = 'completed'/'failed'
    // but does NOT auto-advance task.status because we're calling the repo directly
    // (bypassing H1) to simulate the pre-H1 stuck state.
    const taskSessionStatus = sessionStatus === 'completed' ? 'completed' : 'failed';
    await container.taskService.updateTask(task.id, {
      taskSessionStatuses: { [session.id]: taskSessionStatus },
    });
    // task.status is still 'in_progress' — stuck

    return { task, session };
  }

  it('advances a stuck in_progress task when all sessions are terminal', async () => {
    const { task } = await makeStuckTask('completed');

    const result = await container.sessionService.reconcileStuckTasks({ dryRun: false });

    expect(result.dryRun).toBe(false);
    expect(result.advanced.length).toBeGreaterThanOrEqual(1);
    const entry = result.advanced.find(a => a.taskId === task.id);
    expect(entry).toBeDefined();
    expect(entry!.oldStatus).toBe('in_progress');
    expect(entry!.newStatus).toBe('completed');

    const healed = await container.taskService.getTask(task.id);
    expect(healed.status).toBe('completed');
  });

  it('advances to blocked when any session failed', async () => {
    const { task } = await makeStuckTask('stopped'); // stopped → taskSessionStatus 'failed'

    await container.sessionService.reconcileStuckTasks({ dryRun: false });

    const healed = await container.taskService.getTask(task.id);
    expect(healed.status).toBe('blocked');
  });

  it('dry-run reports changes without mutating', async () => {
    const { task } = await makeStuckTask('completed');

    const result = await container.sessionService.reconcileStuckTasks({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.advanced.length).toBeGreaterThanOrEqual(1);
    const entry = result.advanced.find(a => a.taskId === task.id);
    expect(entry).toBeDefined();

    // Task must NOT have been mutated
    const unchanged = await container.taskService.getTask(task.id);
    expect(unchanged.status).toBe('in_progress');
  });

  it('dry-run is the default when no options are passed', async () => {
    const { task } = await makeStuckTask('completed');

    const result = await container.sessionService.reconcileStuckTasks();

    expect(result.dryRun).toBe(true);
    const unchanged = await container.taskService.getTask(task.id);
    expect(unchanged.status).toBe('in_progress');
  });

  it('does NOT advance a task when at least one session is still live', async () => {
    const task = await container.taskService.createTask(createTestTask(projectId));
    const sess1 = await container.sessionService.createSession(
      createTestSession(projectId, [task.id], { name: 'Session 1' })
    );
    const sess2 = await container.sessionService.createSession(
      createTestSession(projectId, [task.id], { name: 'Session 2' })
    );

    // worker-init state
    await container.taskService.updateTask(task.id, { status: 'in_progress' });
    await container.taskService.updateTask(task.id, {
      taskSessionStatuses: { [sess1.id]: 'working', [sess2.id]: 'working' },
    });

    // Only sess1 completes — sess2 is still working
    await container.taskService.updateTask(task.id, {
      taskSessionStatuses: { [sess1.id]: 'completed', [sess2.id]: 'working' },
    });

    const result = await container.sessionService.reconcileStuckTasks({ dryRun: false });

    // This task must be skipped — sess2 is not terminal
    const entry = result.advanced.find(a => a.taskId === task.id);
    expect(entry).toBeUndefined();

    const stillStuck = await container.taskService.getTask(task.id);
    expect(stillStuck.status).toBe('in_progress');
  });

  it('skips tasks that are not in_progress', async () => {
    const task = await container.taskService.createTask(createTestTask(projectId));
    await container.taskService.updateTask(task.id, { status: 'completed' });

    const result = await container.sessionService.reconcileStuckTasks({ dryRun: false });

    const entry = result.advanced.find(a => a.taskId === task.id);
    expect(entry).toBeUndefined();
  });

  it('processes multiple stuck tasks in one pass', async () => {
    const { task: t1 } = await makeStuckTask('completed');
    const { task: t2 } = await makeStuckTask('completed');
    const { task: t3 } = await makeStuckTask('stopped');

    const result = await container.sessionService.reconcileStuckTasks({ dryRun: false });

    expect(result.advanced.length).toBeGreaterThanOrEqual(3);
    expect(result.errors).toHaveLength(0);

    const healed1 = await container.taskService.getTask(t1.id);
    const healed2 = await container.taskService.getTask(t2.id);
    const healed3 = await container.taskService.getTask(t3.id);
    expect(healed1.status).toBe('completed');
    expect(healed2.status).toBe('completed');
    expect(healed3.status).toBe('blocked');
  });
});
