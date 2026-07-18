/**
 * Provider-aware session resume contract (Codex + Claude).
 *
 * Parent bug: Codex sessions could not be resumed. The resume route
 * (POST /api/sessions/:id/resume) hard-blocked every agentTool other than
 * `claude-code`, and — even if unblocked — reused the Claude-only
 * `MAESTRO_CLAUDE_SESSION_ID` env var (a random UUID minted at spawn) for a
 * Codex session that Codex never used, so `codex resume` would target a
 * non-existent thread.
 *
 * These tests pin the SERVER-owned half of the fix:
 *   - Fresh Codex sessions never receive or persist a Claude-native session id;
 *     fresh Claude sessions still pre-seed one for deterministic resume.
 *   - Codex sessions are resumable (no 400 agent_tool_not_resumable).
 *   - The session:resume event/env is provider-aware: it carries
 *     MAESTRO_AGENT_TOOL, and for Codex it drops MAESTRO_CLAUDE_SESSION_ID and
 *     sets MAESTRO_CODEX_SESSION_ID *only* when a real rollout id is known.
 *   - When no Codex rollout id can be recovered, the id is omitted (the CLI
 *     then fresh-starts with full context — no `--last` guess) — never a
 *     fabricated UUID.
 *   - Claude resume is unchanged (regression guard).
 *   - Genuinely unsupported tools (e.g. gemini) still 400.
 *
 * The Codex native id is the rollout `session_meta.payload.id`; parsing of that
 * payload is unit-tested via the pure `extractCodexSessionIdFromRolloutHead`.
 */

import express from 'express';
import supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';

import { TestDataDir, createTestContainer, createTestProject, createTestTask, silentLogger } from './helpers';
import { createSessionRoutes } from '../src/api/sessionRoutes';
import { LogDigestService, extractCodexSessionIdFromRolloutHead } from '../src/application/services/LogDigestService';
import { PtyHostService } from '../src/application/services/PtyHostService';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn((_cmd: any, _args: any, _opts: any, callback: any) => {
    if (typeof callback === 'function') callback(null, '', '');
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn: mockSpawnFn } = require('child_process');

// Manifest generation is a mocked child_process.spawn that writes the requested
// --output manifest and exits 0, so both spawn and resume routes reach the
// event-emit path under test.
function setupManifestMock() {
  mockSpawnFn.mockImplementation((_cmd: string, shellArgs: string[]) => {
    const emitter = new EventEmitter() as any;
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();
    emitter.killed = false;
    emitter.kill = jest.fn();
    const outputIdx = shellArgs.indexOf('--output');
    const manifestPath = outputIdx >= 0 ? shellArgs[outputIdx + 1] : null;
    setImmediate(async () => {
      if (manifestPath) {
        try {
          await fs.mkdir(path.dirname(manifestPath), { recursive: true });
          await fs.writeFile(manifestPath, JSON.stringify({ mode: 'worker', sections: [], launchConfig: null, sessionId: 'test' }));
        } catch { /* ignore */ }
      }
      emitter.emit('exit', 0);
    });
    return emitter;
  });
}

function makeConfig(dataDir: string) {
  return {
    serverUrl: 'http://localhost:3002',
    dataDir,
    sessionDir: path.join(dataDir, 'sessions'),
    port: 3002,
    manifestGenerator: { type: 'cli', cliPath: 'maestro' },
  } as any;
}

async function buildApp(dataDir: string) {
  const container = await createTestContainer(dataDir);
  const config = makeConfig(dataDir);
  const logDigestService = new LogDigestService(container.sessionService, container.projectRepo);
  const ptyHostService = new PtyHostService(container.sessionService, silentLogger);

  const sessionRoutes = createSessionRoutes({
    sessionService: container.sessionService,
    sessionPromptService: container.sessionPromptService,
    huddleService: container.huddleService,
    commandUsageService: container.commandUsageService,
    logDigestService,
    teamService: container.teamService,
    projectRepo: container.projectRepo,
    taskRepo: container.taskRepo,
    teamMemberRepo: container.teamMemberRepo,
    modelProfileRepo: container.modelProfileRepo,
    eventBus: container.eventBus,
    config,
    ptyHostService,
    spellRepo: {} as any,
  });

  const app = express();
  app.use(express.json());
  app.use('/api', sessionRoutes);
  return { app, container };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure parser: extract the Codex rollout UUID from a session_meta head.
// ─────────────────────────────────────────────────────────────────────────────

describe('extractCodexSessionIdFromRolloutHead', () => {
  it('returns payload.id from the session_meta line', () => {
    const head =
      '{"timestamp":"2026-06-15T03:54:39.461Z","type":"session_meta","payload":{"id":"019ec96a-b3b3-7710-a375-cc969f90615f","cwd":"/x","model_provider":"openai"}}\n' +
      '{"type":"response_item","payload":{"type":"message"}}\n';
    expect(extractCodexSessionIdFromRolloutHead(head)).toBe('019ec96a-b3b3-7710-a375-cc969f90615f');
  });

  it('returns null when there is no session_meta line', () => {
    expect(extractCodexSessionIdFromRolloutHead('{"type":"response_item"}\n')).toBeNull();
  });

  it('skips a truncated/partial session_meta line without throwing', () => {
    const truncated = '{"type":"session_meta","payload":{"id":"019ec96a-b3b3-7710-a3';
    expect(extractCodexSessionIdFromRolloutHead(truncated)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Eager capture: persist the native Codex rollout id when the rollout is first
// located (fires on digest/stats polls), so resume already has it even if the
// session dies before the resume-time scan runs. Write-once, no-overwrite.
// ─────────────────────────────────────────────────────────────────────────────

describe('LogDigestService eager Codex id capture', () => {
  let testDataDir: TestDataDir;
  let container: any;
  let svc: LogDigestService;
  const ROLLOUT_HEAD =
    '{"timestamp":"2026-06-15T03:54:39.461Z","type":"session_meta","payload":{"id":"019ec96a-b3b3-7710-a375-cc969f90615f","cwd":"/x"}}\n';

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
    svc = new LogDigestService(container.sessionService, container.projectRepo);
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  async function makeSession(metadata?: Record<string, unknown>): Promise<string> {
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));
    const session = await container.sessionService.createSession({
      projectId: project.id,
      taskIds: [task.id],
      metadata: metadata ?? {},
    });
    return session.id;
  }

  it('persists the parsed rollout id onto a session that has none', async () => {
    const sessionId = await makeSession();
    await (svc as any).captureCodexSessionId(sessionId, ROLLOUT_HEAD);

    const persisted = await container.sessionService.getSession(sessionId);
    expect(persisted.metadata.codexSessionId).toBe('019ec96a-b3b3-7710-a375-cc969f90615f');
  });

  it('does not overwrite an already-captured id (write-once)', async () => {
    const sessionId = await makeSession({ codexSessionId: 'existing-id' });
    await (svc as any).captureCodexSessionId(sessionId, ROLLOUT_HEAD);

    const persisted = await container.sessionService.getSession(sessionId);
    expect(persisted.metadata.codexSessionId).toBe('existing-id');
  });

  it('no-ops (does not throw) when the head has no session_meta id', async () => {
    const sessionId = await makeSession();
    await expect(
      (svc as any).captureCodexSessionId(sessionId, '{"type":"response_item"}\n'),
    ).resolves.toBeUndefined();

    const persisted = await container.sessionService.getSession(sessionId);
    expect(persisted.metadata.codexSessionId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route contract: provider-aware resume
// ─────────────────────────────────────────────────────────────────────────────

const CODEX_LAUNCH = { provider: 'openai', model: 'gpt-5-codex' };
const GEMINI_LAUNCH = { provider: 'gemini', model: 'gemini-2.5-pro' };
const KNOWN_CODEX_ID = '019ec96a-b3b3-7710-a375-cc969f90615f';

describe('POST /api/sessions/:id/resume — provider-aware payload', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;
  let container: any;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    ({ app, container } = await buildApp(testDataDir.getPath()));
    const project = await container.projectService.createProject(createTestProject());
    projectId = project.id;
    const task = await container.taskService.createTask(createTestTask(projectId));
    taskId = task.id;
    setupManifestMock();
  });

  afterEach(async () => {
    await testDataDir.cleanup();
    jest.resetAllMocks();
  });

  async function spawnSession(launchConfig?: Record<string, unknown>): Promise<string> {
    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .send({ projectId, taskIds: [taskId], spawnSource: 'ui', mode: 'worker', ...(launchConfig ? { launchConfig } : {}) });
    expect(res.status).toBe(201);
    return res.body.sessionId as string;
  }

  function captureResume(): { get: () => any } {
    let evt: any;
    container.eventBus.on('session:resume', (e: any) => { evt = e; });
    return { get: () => evt };
  }

  function captureSpawn(): { get: () => any } {
    let evt: any;
    container.eventBus.on('session:spawn', (e: any) => { evt = e; });
    return { get: () => evt };
  }

  it('keeps a fresh Codex spawn free of Claude-native ids in its payload, event, and persisted record', async () => {
    const cap = captureSpawn();
    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .send({ projectId, taskIds: [taskId], spawnSource: 'ui', mode: 'worker', launchConfig: CODEX_LAUNCH });
    expect(res.status).toBe(201);

    expect(res.body.session.metadata.agentTool).toBe('codex');
    expect(res.body.session.claudeSessionId).toBeUndefined();
    expect(res.body.session.env.MAESTRO_AGENT_TOOL).toBe('codex');
    expect(res.body.session.env.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();

    const evt = cap.get();
    expect(evt).toBeDefined();
    expect(evt.envVars.MAESTRO_AGENT_TOOL).toBe('codex');
    expect(evt.envVars.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();
    expect(evt.session.claudeSessionId).toBeUndefined();

    const persisted = await reloadFromDisk(res.body.sessionId);
    expect(persisted.metadata.agentTool).toBe('codex');
    expect(persisted.claudeSessionId).toBeUndefined();
    expect(persisted.env.MAESTRO_AGENT_TOOL).toBe('codex');
    expect(persisted.env.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();
  });

  it('continues pre-seeding the Claude-native id for a fresh Claude spawn', async () => {
    const cap = captureSpawn();
    const sessionId = await spawnSession();
    const persisted = await container.sessionService.getSession(sessionId);
    const evt = cap.get();

    expect(persisted.metadata.agentTool).toBe('claude-code');
    expect(persisted.env.MAESTRO_AGENT_TOOL).toBe('claude-code');
    expect(typeof persisted.claudeSessionId).toBe('string');
    expect(persisted.env.MAESTRO_CLAUDE_SESSION_ID).toBe(persisted.claudeSessionId);
    expect(evt.envVars.MAESTRO_CLAUDE_SESSION_ID).toBe(persisted.claudeSessionId);
  });

  it('does NOT hard-block a Codex session (regression: used to 400 agent_tool_not_resumable)', async () => {
    const sessionId = await spawnSession(CODEX_LAUNCH);
    // Sanity: spawn persisted agentTool=codex.
    const persisted = await container.sessionService.getSession(sessionId);
    expect(persisted.metadata.agentTool).toBe('codex');

    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.body.code).not.toBe('agent_tool_not_resumable');
    expect(res.status).toBe(200);
  });

  it('forwards the real Codex rollout id and never the Claude id', async () => {
    const sessionId = await spawnSession(CODEX_LAUNCH);
    // Simulate the rollout id already recovered/persisted for this session.
    await container.sessionService.updateSession(sessionId, { metadata: { codexSessionId: KNOWN_CODEX_ID } });

    const cap = captureResume();
    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.status).toBe(200);

    const evt = cap.get();
    expect(evt).toBeDefined();
    expect(evt.agentTool).toBe('codex');
    expect(evt.envVars.MAESTRO_AGENT_TOOL).toBe('codex');
    expect(evt.envVars.MAESTRO_CODEX_SESSION_ID).toBe(KNOWN_CODEX_ID);
    // The Claude-only id must never be present on the Codex resume path.
    expect(evt.envVars.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();
  });

  it('omits the Codex id (no fabricated UUID) when no rollout can be recovered', async () => {
    const sessionId = await spawnSession(CODEX_LAUNCH);
    // No codexSessionId persisted and the fresh sess_ marker matches no real
    // rollout under ~/.codex/sessions, so resolution returns null.

    const cap = captureResume();
    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.status).toBe(200);

    const evt = cap.get();
    expect(evt.envVars.MAESTRO_AGENT_TOOL).toBe('codex');
    expect(evt.envVars.MAESTRO_CODEX_SESSION_ID).toBeUndefined();
    expect(evt.envVars.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();
  });

  it('preserves Claude resume behavior (regression guard)', async () => {
    const sessionId = await spawnSession(); // default → claude-code
    const persisted = await container.sessionService.getSession(sessionId);
    expect(persisted.metadata.agentTool).toBe('claude-code');

    const cap = captureResume();
    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.status).toBe(200);

    const evt = cap.get();
    expect(evt.agentTool).toBe('claude-code');
    expect(evt.envVars.MAESTRO_AGENT_TOOL).toBe('claude-code');
    expect(typeof evt.envVars.MAESTRO_CLAUDE_SESSION_ID).toBe('string');
    expect(evt.envVars.MAESTRO_CLAUDE_SESSION_ID.length).toBeGreaterThan(0);
    expect(evt.envVars.MAESTRO_CODEX_SESSION_ID).toBeUndefined();
    expect(evt.command).toMatch(/worker resume$/);
  });

  // ── PERSISTED-state regressions (parent-bug tail) ──────────────────────────
  // FileSystemSessionRepository MERGES env updates
  // ({ ...session.env, ...updates.env }). The Codex resume path therefore still
  // needs explicit deletion semantics for legacy sessions created before fresh
  // spawn became provider-aware. These reload through a new container so the
  // assertion reflects on-disk truth, not the cached in-memory Session.
  async function reloadFromDisk(sessionId: string): Promise<any> {
    // Flush the live repo's batched writes to disk, then read through a fresh
    // container so we assert persisted JSON, not the cached in-memory Session.
    await container.sessionRepo.shutdown();
    const fresh = await createTestContainer(testDataDir.getPath());
    const session = await fresh.sessionService.getSession(sessionId);
    await fresh.sessionRepo.shutdown();
    return session;
  }

  it('drops MAESTRO_CLAUDE_SESSION_ID from the PERSISTED Codex session while keeping unrelated keys and the Codex id', async () => {
    const sessionId = await spawnSession(CODEX_LAUNCH);
    // Simulate a legacy Codex record created before fresh spawns became
    // provider-aware, and add an unrelated key that MUST survive the resume.
    const afterSpawn = await container.sessionService.getSession(sessionId);
    expect(afterSpawn.env.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();
    await container.sessionService.updateSession(sessionId, {
      env: {
        CUSTOM_KEEP_ME: 'keep',
        MAESTRO_CLAUDE_SESSION_ID: '11111111-2222-3333-4444-555555555555',
      },
    });
    // A real rollout id is known → MAESTRO_CODEX_SESSION_ID must be retained on reload.
    await container.sessionService.updateSession(sessionId, { metadata: { codexSessionId: KNOWN_CODEX_ID } });

    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.status).toBe(200);

    const persisted = await reloadFromDisk(sessionId);
    // The stale Claude id must NOT survive in the persisted Codex env.
    expect(persisted.env.MAESTRO_CLAUDE_SESSION_ID).toBeUndefined();
    // Unrelated keys survive (merge semantics preserved for everything else).
    expect(persisted.env.CUSTOM_KEEP_ME).toBe('keep');
    // The resolved Codex rollout id is retained.
    expect(persisted.env.MAESTRO_CODEX_SESSION_ID).toBe(KNOWN_CODEX_ID);
  });

  it('keeps MAESTRO_CLAUDE_SESSION_ID in the PERSISTED Claude session after resume (regression guard)', async () => {
    const sessionId = await spawnSession(); // claude-code
    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.status).toBe(200);

    const persisted = await reloadFromDisk(sessionId);
    expect(typeof persisted.env.MAESTRO_CLAUDE_SESSION_ID).toBe('string');
    expect(persisted.env.MAESTRO_CLAUDE_SESSION_ID.length).toBeGreaterThan(0);
    expect(persisted.env.MAESTRO_CODEX_SESSION_ID).toBeUndefined();
  });

  it('still rejects a genuinely unsupported agent tool (gemini) with 400', async () => {
    const sessionId = await spawnSession(GEMINI_LAUNCH);
    const res = await supertest(app).post(`/api/sessions/${sessionId}/resume`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('agent_tool_not_resumable');
  });
});
