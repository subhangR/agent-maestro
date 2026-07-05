/**
 * Regression test for the session-LIST badge bug: the picked model must reach
 * the UI. The launched manifest already carries the right model, but the
 * default GET /sessions summary DTO (toSessionSummary) previously omitted it, so
 * a list-fed badge fell back to the team member's configured default (e.g. Opus)
 * instead of the actually-launched model (e.g. claude-fable-5).
 *
 * These tests assert the summary DTO now surfaces top-level `model` and
 * `launchConfig`, sourced from session.metadata, with a null fallback when a
 * session carries no model.
 */

import express from 'express';
import supertest from 'supertest';
import * as path from 'path';

import {
  TestDataDir,
  createTestContainer,
  createTestProject,
  createTestTask,
  createTestSession,
  silentLogger,
} from './helpers';
import { createSessionRoutes } from '../src/api/sessionRoutes';
import { LogDigestService } from '../src/application/services/LogDigestService';
import { PtyHostService } from '../src/application/services/PtyHostService';

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

describe('GET /sessions summary DTO — model + launchConfig', () => {
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

  it('surfaces the launched model + launchConfig from metadata in the list summary', async () => {
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId], {
        metadata: {
          model: 'claude-fable-5',
          launchConfig: { provider: 'claude', model: 'claude-fable-5' },
        },
      })
    );

    const res = await supertest(app).get('/api/sessions');
    expect(res.status).toBe(200);

    const summary = (res.body as any[]).find((s) => s.id === session.id);
    expect(summary).toBeDefined();
    // The badge reads these exact top-level fields off the list store.
    expect(summary.model).toBe('claude-fable-5');
    expect(summary.launchConfig.model).toBe('claude-fable-5');
    // Summary stays a summary — the raw metadata bag is not inlined.
    expect(summary.metadata).toBeUndefined();
  });

  it('falls back to null model/launchConfig when a session has no model in metadata', async () => {
    // createTestSession seeds metadata.skills but no model.
    const session = await container.sessionService.createSession(
      createTestSession(projectId, [taskId])
    );

    const res = await supertest(app).get('/api/sessions');
    expect(res.status).toBe(200);

    const summary = (res.body as any[]).find((s) => s.id === session.id);
    expect(summary).toBeDefined();
    expect(summary.model).toBeNull();
    expect(summary.launchConfig).toBeNull();
  });
});
