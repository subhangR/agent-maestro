/**
 * Turn-end authority: when an agent ends its turn the server must move
 * session.status out of 'working' on its own, so status and needsInput can never
 * contradict each other (the "stuck spinner" bug where status='working' AND
 * needsInput.active=true were held at once).
 *
 * Covers the source-sensitivity the fix requires: 'stop' / 'notification' /
 * 'permission_request' / 'manual' end the turn and demote status, while
 * 'tool_failure' fires mid-turn and must NOT demote (the agent recovers on its
 * own — a false "done" is worse than a stuck spinner).
 *
 * An ABSENT source is treated the same as tool_failure — no demotion. A
 * pre-upgrade plugin bundle calls `maestro session needs-input` with no --source
 * from PostToolUseFailure as well as from Stop, so an untagged signal carries no
 * evidence the turn ended; demoting on it would be the same false "done".
 */

import { isTurnEndSignal } from '../src/application/services/SessionService';
import {
  TestDataDir,
  createTestContainer,
  createTestProject,
  createTestTask,
  createTestSession,
} from './helpers';

describe('isTurnEndSignal (pure rule)', () => {
  it('demotes a working session when a stop-sourced needs-input arrives', () => {
    expect(
      isTurnEndSignal({ needsInput: { active: true, source: 'stop' } }, 'working')
    ).toBe(true);
  });

  it('demotes for every turn-end source', () => {
    for (const source of ['stop', 'notification', 'permission_request', 'manual'] as const) {
      expect(
        isTurnEndSignal({ needsInput: { active: true, source } }, 'working')
      ).toBe(true);
    }
  });

  it('does NOT demote for tool_failure (mid-turn recovery)', () => {
    expect(
      isTurnEndSignal({ needsInput: { active: true, source: 'tool_failure' } }, 'working')
    ).toBe(false);
  });

  it('does NOT demote an untagged source (conservative default for version skew)', () => {
    // A pre-upgrade plugin bundle sends needs-input with no source from
    // PostToolUseFailure too, so an untagged signal must not be read as turn end.
    expect(isTurnEndSignal({ needsInput: { active: true } }, 'working')).toBe(false);
  });

  it('also demotes from spawning', () => {
    expect(
      isTurnEndSignal({ needsInput: { active: true, source: 'stop' } }, 'spawning')
    ).toBe(true);
  });

  it('never demotes a terminal/idle status', () => {
    for (const status of ['idle', 'completed', 'failed', 'stopped'] as const) {
      expect(
        isTurnEndSignal({ needsInput: { active: true, source: 'stop' } }, status)
      ).toBe(false);
    }
  });

  it('ignores needsInput.active=false', () => {
    expect(
      isTurnEndSignal({ needsInput: { active: false, source: 'stop' } }, 'working')
    ).toBe(false);
  });

  it('defers to an explicitly supplied status', () => {
    // Caller said 'completed' — do not override it with 'idle'.
    expect(
      isTurnEndSignal({ status: 'completed', needsInput: { active: true, source: 'stop' } }, 'working')
    ).toBe(false);
  });
});

describe('SessionService — turn-end status authority', () => {
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

  async function workingSession() {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId], { status: 'working' })
    );
    expect(session.status).toBe('working');
    return session;
  }

  it('THE CONTRADICTION CASE: working + incoming stop needs-input => status leaves working AND needsInput.active stays true', async () => {
    const session = await workingSession();

    // Shape of the CLI's `session needs-input` PATCH: needsInput + a timeline entry.
    const updated = await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, message: 'waiting', since: Date.now(), source: 'stop' },
      timeline: [
        {
          id: 'evt-test-1',
          type: 'needs_input',
          timestamp: Date.now(),
          message: 'waiting',
          metadata: { source: 'stop' },
        },
      ],
    });

    expect(updated.status).not.toBe('working');
    expect(updated.status).toBe('idle');
    expect(updated.needsInput?.active).toBe(true);
  });

  it('emits an immediate session:status_changed carrying the turn-end transition', async () => {
    const session = await workingSession();

    const statusChanged: any[] = [];
    container.eventBus.on('session:status_changed', (d: any) => { statusChanged.push(d); });

    await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, source: 'stop' },
      timeline: [
        { id: 'evt-test-2', type: 'needs_input', timestamp: Date.now(), metadata: { source: 'stop' } },
      ],
    });

    // Even though `timeline` makes this a structural update, the transition must
    // still ride the lightweight status_changed event (the immediate lane).
    const frame = statusChanged.find((d) => d.id === session.id);
    expect(frame).toBeDefined();
    expect(frame.status).toBe('idle');
    expect(frame.needsInput?.active).toBe(true);
  });

  it('does NOT demote on a tool_failure needs-input (agent still mid-turn)', async () => {
    const session = await workingSession();

    const updated = await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, source: 'tool_failure' },
      timeline: [
        { id: 'evt-test-3', type: 'needs_input', timestamp: Date.now(), metadata: { source: 'tool_failure' } },
      ],
    });

    expect(updated.status).toBe('working');
    expect(updated.needsInput?.active).toBe(true);
  });

  it('addTimelineEvent(needs_input, source=stop) demotes status and emits status_changed', async () => {
    const session = await workingSession();

    const statusChanged: any[] = [];
    container.eventBus.on('session:status_changed', (d: any) => { statusChanged.push(d); });

    const updated = await container.sessionService.addTimelineEvent(
      session.id,
      'needs_input',
      'waiting',
      taskId,
      { source: 'stop' }
    );

    expect(updated.status).toBe('idle');
    expect(updated.needsInput?.active).toBe(true);

    const frame = statusChanged.find((d) => d.id === session.id);
    expect(frame).toBeDefined();
    expect(frame.status).toBe('idle');
  });

  it('addTimelineEvent(needs_input, source=tool_failure) keeps status working', async () => {
    const session = await workingSession();

    const updated = await container.sessionService.addTimelineEvent(
      session.id,
      'needs_input',
      'tool blew up',
      taskId,
      { source: 'tool_failure' }
    );

    expect(updated.status).toBe('working');
    expect(updated.needsInput?.active).toBe(true);
  });

  it('does NOT demote an untagged needs-input PATCH (pre-upgrade plugin skew)', async () => {
    const session = await workingSession();

    // Shape an OLD plugin bundle produces: no `source` anywhere in the payload.
    const updated = await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, message: 'waiting', since: Date.now() },
      timeline: [
        { id: 'evt-skew-1', type: 'needs_input', timestamp: Date.now(), message: 'waiting' },
      ],
    });

    expect(updated.status).toBe('working');
    expect(updated.needsInput?.active).toBe(true);
  });

  it('drops an unrecognised source: no demotion and the bogus value is not persisted', async () => {
    const session = await workingSession();

    // Reachable via POST /sessions/:id/timeline, whose Zod schema lets any string
    // through as metadata. A garbage source must behave like an absent one.
    const updated = await container.sessionService.addTimelineEvent(
      session.id,
      'needs_input',
      'waiting',
      taskId,
      { source: 'totally-bogus' }
    );

    expect(updated.status).toBe('working');
    expect(updated.needsInput?.active).toBe(true);
    expect(updated.needsInput?.source).toBeUndefined();
  });

  it('does not re-introduce resume gating: a working PATCH still works from idle', async () => {
    const session = await workingSession();
    await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, source: 'stop' },
    });
    // Simulate the UserPromptSubmit / resume-working hook.
    const resumed = await container.sessionService.updateSession(session.id, {
      status: 'working',
      needsInput: { active: false },
    });
    expect(resumed.status).toBe('working');
    expect(resumed.needsInput?.active).toBe(false);
  });
});
