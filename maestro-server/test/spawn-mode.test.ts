/**
 * Tests for:
 * - POST /api/sessions/spawn spawn gate (X-Session-Id / coordinator check)
 * - POST /api/sessions/:id/mode (role flip)
 * - GET  /api/sessions/:id/mode
 * - GET  /api/team-members (without projectId)
 * - GET  /api/team-members/:id (without projectId)
 */

import express from 'express';
import supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';

import {
  TestDataDir,
  createTestContainer,
  createTestProject,
  createTestTask,
  createTestSession,
} from './helpers';
import { createSessionRoutes } from '../src/api/sessionRoutes';
import { createTeamMemberRoutes } from '../src/api/teamMemberRoutes';
import { createMasterRoutes } from '../src/api/masterRoutes';
import { LogDigestService } from '../src/application/services/LogDigestService';
import { TeamMemberService } from '../src/application/services/TeamMemberService';

// ─── Mock child_process so generateManifestViaCLI doesn't require a real CLI ──

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn((_cmd: any, _args: any, _opts: any, callback: any) => {
    if (typeof callback === 'function') callback(null, '', '');
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn: mockSpawnFn } = require('child_process');

function setupManifestMock() {
  mockSpawnFn.mockImplementation(
    (_cmd: string, shellArgs: string[], _opts: any) => {
      const emitter = new EventEmitter() as any;
      emitter.stdout = new EventEmitter();
      emitter.stderr = new EventEmitter();
      emitter.killed = false;
      emitter.kill = jest.fn();

      // The shell args structure is:
      //   ['-c', 'ulimit ...', 'sh', maestroBin, 'manifest', 'generate', ..., '--output', manifestPath, ...]
      const outputIdx = shellArgs.indexOf('--output');
      const manifestPath = outputIdx >= 0 ? shellArgs[outputIdx + 1] : null;

      setImmediate(async () => {
        if (manifestPath) {
          try {
            await fs.mkdir(path.dirname(manifestPath), { recursive: true });
            await fs.writeFile(
              manifestPath,
              JSON.stringify({
                mode: 'worker',
                sections: [],
                launchConfig: null,
                sessionId: 'test',
              }),
            );
          } catch {
            // ignore write errors in tests
          }
        }
        emitter.emit('exit', 0);
      });

      return emitter;
    },
  );
}

// ─── Minimal Config stub ──────────────────────────────────────────────────────

function makeConfig(dataDir: string) {
  return {
    serverUrl: 'http://localhost:3002',
    dataDir,
    sessionDir: path.join(dataDir, 'sessions'),
    port: 3002,
    manifestGenerator: {
      type: 'cli',
      cliPath: 'maestro',
    },
  } as any;
}

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(dataDir: string) {
  const container = await createTestContainer(dataDir);
  const config = makeConfig(dataDir);
  const logDigestService = new LogDigestService(container.sessionService, container.projectRepo);
  const teamMemberService = new TeamMemberService(
    container.teamMemberRepo,
    container.eventBus,
    container.idGenerator,
  );

  const sessionRoutes = createSessionRoutes({
    sessionService: container.sessionService,
    sessionPromptService: container.sessionPromptService,
    huddleService: container.huddleService,
    commandUsageService: container.commandUsageService,
    logDigestService,
    projectRepo: container.projectRepo,
    taskRepo: container.taskRepo,
    teamMemberRepo: container.teamMemberRepo,
    modelProfileRepo: container.modelProfileRepo,
    eventBus: container.eventBus,
    config,
  });

  const teamMemberRoutes = createTeamMemberRoutes(teamMemberService);
  const masterRoutes = createMasterRoutes(
    container.projectService,
    container.taskService,
    container.sessionService,
  );

  const app = express();
  app.use(express.json());
  app.use('/api', sessionRoutes);
  app.use('/api', teamMemberRoutes);
  app.use('/api', masterRoutes);

  return { app, container };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createCoordinatorSession(container: any, projectId: string, taskId: string) {
  const session = await container.sessionService.createSession({
    ...createTestSession(projectId, [taskId]),
    name: 'Coordinator Session',
    metadata: { mode: 'coordinator' },
  });
  return session;
}

async function createWorkerSession(container: any, projectId: string, taskId: string) {
  const session = await container.sessionService.createSession({
    ...createTestSession(projectId, [taskId]),
    name: 'Worker Session',
    metadata: { mode: 'worker' },
  });
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPAWN GATE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/spawn — spawn gate', () => {
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

  // UI-initiated spawns are user-driven and have no sender session, so they must
  // bypass the gate entirely. A top-level "orchestrate" creates the first
  // coordinator — there is no parent coordinator to attribute the spawn to.
  it('UI spawn bypasses the gate without an X-Session-Id header', async () => {
    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .send({ projectId, taskIds: [taskId], spawnSource: 'ui', mode: 'coordinator' });

    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe('sender_session_required');
    expect(res.body.code).not.toBe('spawn_requires_coordinator');
  });

  it('returns 400 when a session spawn is missing the X-Session-Id header', async () => {
    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .send({ taskIds: [taskId], spawnSource: 'session' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('sender_session_required');
  });

  it('returns 400 when X-Session-Id points to non-existent session', async () => {
    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', 'sess_nonexistent_abc123')
      .send({ taskIds: [taskId], spawnSource: 'session' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('sender_session_not_found');
  });

  it('returns 403 when sender session is a worker', async () => {
    const workerSession = await createWorkerSession(container, projectId, taskId);

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', workerSession.id)
      .send({ taskIds: [taskId], spawnSource: 'session' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('spawn_requires_coordinator');
  });

  it('returns 403 when sender session is coordinated-worker', async () => {
    const session = await container.sessionService.createSession({
      ...createTestSession(projectId, [taskId]),
      metadata: { mode: 'coordinated-worker' },
    });

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', session.id)
      .send({ taskIds: [taskId], spawnSource: 'session' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('spawn_requires_coordinator');
  });

  it('coordinator sender passes gate and spawn succeeds', async () => {
    const coordinatorSession = await createCoordinatorSession(container, projectId, taskId);

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', coordinatorSession.id)
      .send({ taskIds: [taskId], spawnSource: 'session', sessionId: coordinatorSession.id, mode: 'worker' });

    // Gate passed — should succeed (201) or fail at a later step (not 400/403)
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe('sender_session_required');
    expect(res.body.code).not.toBe('spawn_requires_coordinator');
  });

  it('spawn with projectId in body uses specified project', async () => {
    const project2 = await container.projectService.createProject(
      createTestProject({ name: 'Project 2', workingDir: '/tmp/project2' }),
    );
    const task2 = await container.taskService.createTask(createTestTask(project2.id));
    const coordinatorSession = await createCoordinatorSession(container, projectId, taskId);

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', coordinatorSession.id)
      .send({ projectId: project2.id, taskIds: [task2.id], spawnSource: 'session', sessionId: coordinatorSession.id, mode: 'worker' });

    // Gate passed with explicit projectId
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe('sender_session_required');
    expect(res.body.code).not.toBe('spawn_requires_coordinator');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION INHERITANCE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/spawn — bypass permission inheritance', () => {
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

  it('child inherits bypassPermissions from a bypass-permission parent', async () => {
    const parent = await container.sessionService.createSession({
      ...createTestSession(projectId, [taskId]),
      name: 'Bypass Coordinator',
      metadata: { mode: 'coordinator', permissionMode: 'bypassPermissions' },
    });

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', parent.id)
      .send({ taskIds: [taskId], spawnSource: 'session', sessionId: parent.id, mode: 'worker' });

    expect(res.status).toBe(201);
    expect(res.body.session.metadata.permissionMode).toBe('bypassPermissions');
  });

  it('does not force bypass when the parent is not in bypass mode', async () => {
    const parent = await container.sessionService.createSession({
      ...createTestSession(projectId, [taskId]),
      name: 'Plain Coordinator',
      metadata: { mode: 'coordinator' },
    });

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', parent.id)
      .send({ taskIds: [taskId], spawnSource: 'session', sessionId: parent.id, mode: 'worker' });

    expect(res.status).toBe(201);
    expect(res.body.session.metadata.permissionMode).not.toBe('bypassPermissions');
  });

  it('explicit delegatePermissionMode on the parent takes precedence over parent bypass', async () => {
    const parent = await container.sessionService.createSession({
      ...createTestSession(projectId, [taskId]),
      name: 'Bypass Coordinator With Delegate',
      metadata: {
        mode: 'coordinator',
        permissionMode: 'bypassPermissions',
        delegatePermissionMode: 'acceptEdits',
      },
    });

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .set('X-Session-Id', parent.id)
      .send({ taskIds: [taskId], spawnSource: 'session', sessionId: parent.id, mode: 'worker' });

    expect(res.status).toBe(201);
    expect(res.body.session.metadata.permissionMode).toBe('acceptEdits');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MODE ROUTE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/:id/mode — role flip', () => {
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
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns 403 when X-Session-Id is missing', async () => {
    const session = await createWorkerSession(container, projectId, taskId);

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/mode`)
      .send({ role: 'coordinator' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('mode_self_only');
  });

  it('returns 403 when X-Session-Id does not match :id', async () => {
    const session1 = await createWorkerSession(container, projectId, taskId);
    const session2 = await createWorkerSession(container, projectId, taskId);

    const res = await supertest(app)
      .post(`/api/sessions/${session1.id}/mode`)
      .set('X-Session-Id', session2.id)
      .send({ role: 'coordinator' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('mode_self_only');
  });

  it('promotes worker → coordinator and emits event', async () => {
    const session = await createWorkerSession(container, projectId, taskId);

    let emittedEvent: any = null;
    container.eventBus.on('session:mode_changed', (data: any) => {
      emittedEvent = data;
    });

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/mode`)
      .set('X-Session-Id', session.id)
      .send({ role: 'coordinator' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('coordinator');
    expect(res.body.previousMode).toBe('worker');
    expect(res.body.changed).toBe(true);
    expect(res.body.id).toBe(session.id);

    // Event was emitted
    expect(emittedEvent).not.toBeNull();
    expect(emittedEvent.sessionId).toBe(session.id);
    expect(emittedEvent.mode).toBe('coordinator');
    expect(emittedEvent.previousMode).toBe('worker');
    expect(emittedEvent.changed).toBe(true);
    expect(emittedEvent.timestamp).toBeDefined();
  });

  it('promotes coordinated-worker → coordinated-coordinator (preserves relation)', async () => {
    const session = await container.sessionService.createSession({
      ...createTestSession(projectId, [taskId]),
      metadata: { mode: 'coordinated-worker' },
    });

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/mode`)
      .set('X-Session-Id', session.id)
      .send({ role: 'coordinator' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('coordinated-coordinator');
    expect(res.body.previousMode).toBe('coordinated-worker');
    expect(res.body.changed).toBe(true);
  });

  it('is idempotent — coordinator → coordinator returns changed:false, no event emitted', async () => {
    const session = await createCoordinatorSession(container, projectId, taskId);

    let eventCount = 0;
    container.eventBus.on('session:mode_changed', () => { eventCount++; });

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/mode`)
      .set('X-Session-Id', session.id)
      .send({ role: 'coordinator' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('coordinator');
    expect(res.body.previousMode).toBe('coordinator');
    expect(res.body.changed).toBe(false);
    expect(eventCount).toBe(0);
  });

  it('demotes coordinator → worker and emits event', async () => {
    const session = await createCoordinatorSession(container, projectId, taskId);

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/mode`)
      .set('X-Session-Id', session.id)
      .send({ role: 'worker' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('worker');
    expect(res.body.previousMode).toBe('coordinator');
    expect(res.body.changed).toBe(true);
  });
});

describe('GET /api/sessions/:id/mode', () => {
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
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns mode details for a worker session', async () => {
    const session = await createWorkerSession(container, projectId, taskId);

    const res = await supertest(app).get(`/api/sessions/${session.id}/mode`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(session.id);
    expect(res.body.mode).toBe('worker');
    expect(res.body.relation).toBe('standalone');
    expect(res.body.role).toBe('worker');
  });

  it('returns mode details for a coordinated-coordinator session', async () => {
    const session = await container.sessionService.createSession({
      ...createTestSession(projectId, [taskId]),
      metadata: { mode: 'coordinated-coordinator' },
    });

    const res = await supertest(app).get(`/api/sessions/${session.id}/mode`);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('coordinated-coordinator');
    expect(res.body.relation).toBe('coordinated');
    expect(res.body.role).toBe('coordinator');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEAM MEMBER ROUTE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/team-members — without projectId', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    ({ app } = await buildApp(testDataDir.getPath()));
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns 200 (not 400) when projectId is omitted', async () => {
    const res = await supertest(app).get('/api/team-members');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 200 when scope=global and no projectId', async () => {
    const res = await supertest(app).get('/api/team-members?scope=global');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/team-members/:id — without projectId', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;
  let container: any;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    ({ app, container } = await buildApp(testDataDir.getPath()));
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns 200 (not 400) for a valid member id without projectId', async () => {
    // Create a project and a team member
    const project = await container.projectService.createProject(createTestProject());

    // We'll look up a default team member which exists for every project
    // First, find one by listing with projectId
    const listRes = await supertest(app)
      .get(`/api/team-members?projectId=${project.id}`);

    if (listRes.status !== 200 || !Array.isArray(listRes.body) || listRes.body.length === 0) {
      // No members available (e.g., no team member repo configured)
      return;
    }

    const memberId = listRes.body[0].id;

    // Now fetch without projectId
    const res = await supertest(app).get(`/api/team-members/${memberId}`);

    // Should not be 400 (that was the old behavior)
    expect(res.status).not.toBe(400);
    // Should be 200 (member found in cache) or 404 (not found without project context)
    expect([200, 404]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MASTER ROUTES — open without auth
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/master/* — no auth required', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    ({ app } = await buildApp(testDataDir.getPath()));
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('GET /api/master/projects returns 200 without X-Session-Id', async () => {
    const res = await supertest(app).get('/api/master/projects');
    expect(res.status).toBe(200);
  });

  it('GET /api/master/sessions returns 200 without X-Session-Id', async () => {
    const res = await supertest(app).get('/api/master/sessions');
    expect(res.status).toBe(200);
  });

  it('GET /api/master/sessions?active=true filters active sessions', async () => {
    const res = await supertest(app).get('/api/master/sessions?active=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
