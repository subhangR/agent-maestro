/**
 * Verifies the crux of the model-profile feature: a team member bound to a
 * modelProfileId resolves its launch config from the profile at spawn, and
 * editing the profile re-points the member (no member edit needed).
 */

import express from 'express';
import supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';

import { TestDataDir, createTestContainer, createTestProject, createTestTask } from './helpers';
import { createSessionRoutes } from '../src/api/sessionRoutes';
import { LogDigestService } from '../src/application/services/LogDigestService';
import { ModelProfileService } from '../src/application/services/ModelProfileService';
import { TeamMemberService } from '../src/application/services/TeamMemberService';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn((_cmd: any, _args: any, _opts: any, callback: any) => {
    if (typeof callback === 'function') callback(null, '', '');
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn: mockSpawnFn } = require('child_process');

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
  const modelProfileService = new ModelProfileService(container.modelProfileRepo, container.eventBus, container.idGenerator);
  const teamMemberService = new TeamMemberService(container.teamMemberRepo, container.eventBus, container.idGenerator);

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

  const app = express();
  app.use(express.json());
  app.use('/api', sessionRoutes);
  return { app, container, modelProfileService, teamMemberService };
}

async function spawn(app: express.Application, projectId: string, taskId: string, teamMemberId: string) {
  return supertest(app)
    .post('/api/sessions/spawn')
    .send({ projectId, taskIds: [taskId], teamMemberId, spawnSource: 'ui', mode: 'worker' });
}

describe('Model profile resolution at spawn', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;
  let container: any;
  let modelProfileService: ModelProfileService;
  let teamMemberService: TeamMemberService;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    ({ app, container, modelProfileService, teamMemberService } = await buildApp(testDataDir.getPath()));
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

  it('resolves the bound profile model (ignoring the raw member model)', async () => {
    const member = await teamMemberService.createTeamMember({
      projectId, name: 'Bound', role: 'worker', avatar: '🔧',
      model: 'haiku',                 // raw fallback, should be overridden
      modelProfileId: 'mp_balanced',  // seeded → claude-sonnet-4-6
    });

    const res = await spawn(app, projectId, taskId, member.id);
    expect(res.status).toBe(201);
    expect(res.body.session.metadata.model).toBe('claude-sonnet-4-6');
    expect(res.body.session.metadata.launchConfig.model).toBe('claude-sonnet-4-6');
    expect(res.body.session.metadata.launchConfig.provider).toBe('claude');
  });

  it('propagates a profile edit to the bound member without editing the member', async () => {
    const member = await teamMemberService.createTeamMember({
      projectId, name: 'Bound', role: 'worker', avatar: '🔧', modelProfileId: 'mp_balanced',
    });

    const before = await spawn(app, projectId, taskId, member.id);
    expect(before.body.session.metadata.model).toBe('claude-sonnet-4-6');

    // Edit the profile only — member is untouched.
    await modelProfileService.updateModelProfile('mp_balanced', {
      launchConfig: { provider: 'claude', model: 'claude-opus-4-8', reasoningEffort: 'high' },
    });

    const after = await spawn(app, projectId, taskId, member.id);
    expect(after.body.session.metadata.model).toBe('claude-opus-4-8');
    expect(after.body.session.metadata.launchConfig.reasoningEffort).toBe('high');
  });

  it('falls back to the raw member model when no profile is bound', async () => {
    const member = await teamMemberService.createTeamMember({
      projectId, name: 'Raw', role: 'worker', avatar: '🔧', model: 'claude-haiku-4-5',
    });

    const res = await spawn(app, projectId, taskId, member.id);
    expect(res.body.session.metadata.model).toBe('claude-haiku-4-5');
  });

  it('falls back to the raw model when the bound profile was deleted', async () => {
    const member = await teamMemberService.createTeamMember({
      projectId, name: 'Orphan', role: 'worker', avatar: '🔧',
      model: 'claude-haiku-4-5', modelProfileId: 'mp_fast',
    });
    await modelProfileService.deleteModelProfile('mp_fast');

    const res = await spawn(app, projectId, taskId, member.id);
    expect(res.body.session.metadata.model).toBe('claude-haiku-4-5');
  });
});
