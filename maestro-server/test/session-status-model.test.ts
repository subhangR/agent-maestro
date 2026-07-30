/**
 * Regression tests for the session status model fixes:
 *
 * 1. detectStuck must NOT fire when tool calls are still arriving (agent is
 *    actively working, just not narrating). It used to fire on text-silence alone
 *    which meant a worker making 15 rapid tool calls was flagged as stuck.
 *
 * 2. mapSessionState must use the persisted status field as the primary source of
 *    truth. A session with status='working' but a stale needsInput.active=true used
 *    to surface as 'needs_input' in the digest, contradicting session info.
 *
 * 3. updateSession must auto-clear needsInput.active when status transitions to
 *    'working', so the two signals never diverge on disk.
 *
 * 4. reconcileOrphanedSessions must mark all non-terminal sessions (spawning/idle/
 *    working) as 'stopped' on startup, cleaning up sessions whose PTY processes
 *    were killed by a server restart.
 */

import { LogDigestService } from '../src/application/services/LogDigestService';
import {
  TestDataDir,
  createTestContainer,
  createTestProject,
  createTestTask,
  createTestSession,
} from './helpers';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a fake Claude JSONL assistant line with optional text and/or tool_use blocks. */
function assistantLine(opts: {
  hasText?: boolean;
  hasToolUse?: boolean;
  timestampMs?: number;
}): any {
  const content: any[] = [];
  if (opts.hasText) {
    content.push({ type: 'text', text: 'I will now check the file.' });
  }
  if (opts.hasToolUse) {
    content.push({ type: 'tool_use', id: 'tu1', name: 'read_file', input: {} });
  }
  const ts = opts.timestampMs ?? Date.now();
  return {
    type: 'assistant',
    timestamp: new Date(ts).toISOString(),
    message: { content },
  };
}

/** One minute ago in ms */
const ONE_MINUTE_AGO = Date.now() - 60_000;
/** Two minutes ago in ms */
const TWO_MINUTES_AGO = Date.now() - 120_000;
/** 5 seconds ago (recent) */
const FIVE_SECONDS_AGO = Date.now() - 5_000;

// ── LogDigestService private-method access ────────────────────────────────────

let svc: any;

beforeEach(() => {
  // LogDigestService constructor takes (sessionService, projectRepo); pass stubs
  svc = new (LogDigestService as any)({}, {});
});

// ── detectStuck: tool-call recency guard ──────────────────────────────────────

describe('detectStuck — tool-call recency guard', () => {
  it('does NOT flag stuck when tool calls are still arriving within the window', () => {
    // 10 tool-call-only turns, but the most recent one was 5 seconds ago — agent
    // is still actively working. Old code: flagged stuck. New code: not stuck.
    const lines = [
      assistantLine({ hasText: true, timestampMs: TWO_MINUTES_AGO }),
      assistantLine({ hasToolUse: true, timestampMs: ONE_MINUTE_AGO }),
      assistantLine({ hasToolUse: true, timestampMs: ONE_MINUTE_AGO + 1000 }),
      assistantLine({ hasToolUse: true, timestampMs: ONE_MINUTE_AGO + 2000 }),
      assistantLine({ hasToolUse: true, timestampMs: ONE_MINUTE_AGO + 3000 }),
      assistantLine({ hasToolUse: true, timestampMs: ONE_MINUTE_AGO + 4000 }),
      assistantLine({ hasToolUse: true, timestampMs: ONE_MINUTE_AGO + 5000 }),
      // Most recent tool call is only 5 seconds ago — agent is clearly working
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO }),
    ];

    const result = svc.detectStuck(lines);
    expect(result).toBeNull(); // NOT stuck — tool calls still arriving
  });

  it('DOES flag stuck when both text AND tool calls have been silent', () => {
    // 10 tool-call turns with no text, and the last tool call was 2 minutes ago
    const lines = [
      assistantLine({ hasText: true, timestampMs: TWO_MINUTES_AGO - 10_000 }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 1000 }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 2000 }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 3000 }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 4000 }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 5000 }),
    ];

    const result = svc.detectStuck(lines);
    expect(result).not.toBeNull();
    expect(result.toolCallsSinceLastText).toBe(6);
    expect(result.silentDurationMs).toBeGreaterThan(30_000);
  });

  it('is not stuck when tool-call count is below threshold', () => {
    // Only 3 tool calls (threshold is 5) — never fires regardless of silence
    const lines = [
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 1000 }),
      assistantLine({ hasToolUse: true, timestampMs: TWO_MINUTES_AGO + 2000 }),
    ];

    expect(svc.detectStuck(lines)).toBeNull();
  });

  it('is not stuck when recent text exists within the window', () => {
    // Text was printed 5 seconds ago — still within 30s silence window
    const lines = [
      assistantLine({ hasText: true, timestampMs: FIVE_SECONDS_AGO }),
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO + 100 }),
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO + 200 }),
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO + 300 }),
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO + 400 }),
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO + 500 }),
      assistantLine({ hasToolUse: true, timestampMs: FIVE_SECONDS_AGO + 600 }),
    ];

    expect(svc.detectStuck(lines)).toBeNull();
  });
});

// ── mapSessionState: status takes precedence ──────────────────────────────────

describe('mapSessionState — status takes precedence over stale needsInput', () => {
  it('returns "active" for status=working even when needsInput.active=true', () => {
    // The live defect: a session with stale needsInput.active surfaced as needs_input
    // in the digest even though the persisted status was working.
    const state = svc.mapSessionState('working', { active: true });
    expect(state).toBe('active');
  });

  it('returns "active" for status=spawning regardless of needsInput', () => {
    expect(svc.mapSessionState('spawning', { active: true })).toBe('active');
    expect(svc.mapSessionState('spawning', { active: false })).toBe('active');
    expect(svc.mapSessionState('spawning', undefined)).toBe('active');
  });

  it('returns "needs_input" when status=idle and needsInput.active=true', () => {
    expect(svc.mapSessionState('idle', { active: true })).toBe('needs_input');
  });

  it('returns "idle" when status=idle and needsInput is not set', () => {
    expect(svc.mapSessionState('idle', undefined)).toBe('idle');
    expect(svc.mapSessionState('idle', { active: false })).toBe('idle');
  });

  it('returns "idle" for terminal statuses', () => {
    expect(svc.mapSessionState('stopped', undefined)).toBe('idle');
    expect(svc.mapSessionState('completed', undefined)).toBe('idle');
    expect(svc.mapSessionState('failed', undefined)).toBe('idle');
  });
});

// ── SessionService.updateSession: auto-clear needsInput on working ────────────

describe('SessionService.updateSession — auto-clears needsInput when resuming work', () => {
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

  it('clears needsInput.active when status transitions to working', async () => {
    // Create a session that is stuck in needs_input state
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );

    // Simulate the agent asking for input
    await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, message: 'Please confirm', since: Date.now() },
    });

    let fetched = await container.sessionService.getSession(session.id);
    expect(fetched.needsInput?.active).toBe(true);

    // Agent resumes working — status transitions to 'working'
    await container.sessionService.updateSession(session.id, { status: 'working' });

    fetched = await container.sessionService.getSession(session.id);
    expect(fetched.status).toBe('working');
    expect(fetched.needsInput?.active).toBe(false);
  });

  it('does not clear needsInput when updating something else while still needing input', async () => {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );
    await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, message: 'Confirm?', since: Date.now() },
    });

    // Update metadata without changing status — needsInput must stay
    await container.sessionService.updateSession(session.id, {
      metadata: { lastCheckedAt: Date.now() },
    });

    const fetched = await container.sessionService.getSession(session.id);
    expect(fetched.needsInput?.active).toBe(true);
  });

  it('does not clobber an explicit needsInput=false passed alongside status=working', async () => {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );
    await container.sessionService.updateSession(session.id, {
      needsInput: { active: true, message: 'Confirm?', since: Date.now() },
    });

    // Caller explicitly passes needsInput=false — should be honoured as-is
    await container.sessionService.updateSession(session.id, {
      status: 'working',
      needsInput: { active: false },
    });

    const fetched = await container.sessionService.getSession(session.id);
    expect(fetched.needsInput?.active).toBe(false);
  });
});

// ── SessionService.reconcileOrphanedSessions ─────────────────────────────────

describe('SessionService.reconcileOrphanedSessions — startup orphan sweep', () => {
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

  async function makeSession(status: string, taskIds: string[] = []) {
    const s = await container.sessionService.createSession({
      projectId,
      taskIds,
      name: `Session ${status}`,
    });
    if (status !== 'spawning') {
      // createSession sets status to whatever the caller provides; override here
      await container.sessionRepo.update(s.id, { status: status as any });
    }
    return s;
  }

  it('marks spawning, idle, and working sessions as stopped', async () => {
    const spawning = await makeSession('spawning');
    const idle = await makeSession('idle');
    const working = await makeSession('working');

    const { count } = await container.sessionService.reconcileOrphanedSessions();
    expect(count).toBe(3);

    for (const s of [spawning, idle, working]) {
      const refetched = await container.sessionService.getSession(s.id);
      expect(refetched.status).toBe('stopped');
    }
  });

  it('does not touch terminal sessions', async () => {
    const completed = await makeSession('completed');
    const failed = await makeSession('failed');
    const stopped = await makeSession('stopped');

    const { count } = await container.sessionService.reconcileOrphanedSessions();
    expect(count).toBe(0);

    for (const { id, status } of [
      { id: completed.id, status: 'completed' },
      { id: failed.id, status: 'failed' },
      { id: stopped.id, status: 'stopped' },
    ]) {
      const refetched = await container.sessionService.getSession(id);
      expect(refetched.status).toBe(status);
    }
  });

  it('clears needsInput.active for orphaned sessions', async () => {
    const s = await makeSession('working');
    await container.sessionRepo.update(s.id, {
      needsInput: { active: true, message: 'Waiting', since: Date.now() },
    });

    await container.sessionService.reconcileOrphanedSessions();

    const refetched = await container.sessionService.getSession(s.id);
    expect(refetched.status).toBe('stopped');
    expect(refetched.needsInput?.active).toBe(false);
  });

  it('is idempotent — second call finds nothing to reconcile', async () => {
    await makeSession('working');
    await container.sessionService.reconcileOrphanedSessions();

    const { count: secondCount } = await container.sessionService.reconcileOrphanedSessions();
    expect(secondCount).toBe(0);
  });
});
