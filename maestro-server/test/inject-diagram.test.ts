/**
 * Tests for POST /api/sessions/:id/inject-diagram
 * Verifies: files are written to disk, session:prompt_send is emitted with correct paths.
 */

import express from 'express';
import supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs/promises';

import {
  TestDataDir,
  createTestContainer,
  createTestProject,
  createTestTask,
  createTestSession,
} from './helpers';
import { createSessionRoutes } from '../src/api/sessionRoutes';
import { LogDigestService } from '../src/application/services/LogDigestService';

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
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', sessionRoutes);

  return { app, container };
}

describe('POST /api/sessions/:id/inject-diagram', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;
  let container: any;

  // Use a real temp working dir so we can verify files are written
  let workingDir: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    workingDir = path.join(testDataDir.getPath(), 'project-workdir');
    await fs.mkdir(workingDir, { recursive: true });

    ({ app, container } = await buildApp(testDataDir.getPath()));
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('writes both PNG and .excalidraw to disk and emits session:prompt_send', async () => {
    const project = await container.projectService.createProject(
      createTestProject({ workingDir }),
    );
    const task = await container.taskService.createTask(createTestTask(project.id));
    const session = await container.sessionService.createSession(
      createTestSession(project.id, [task.id], { name: 'Target' }),
    );

    // A minimal 1×1 transparent PNG (base64)
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sceneJson = JSON.stringify({ elements: [], appState: {}, files: {} });

    const events: any[] = [];
    container.eventBus.on('session:prompt_send', (data: any) => events.push(data));

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/inject-diagram`)
      .send({ pngBase64, sceneJson, name: 'test_diagram' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.pngPath).toBe('string');
    expect(typeof res.body.excalidrawPath).toBe('string');
    expect(res.body.pngPath).toMatch(/test_diagram.*\.png$/);
    expect(res.body.excalidrawPath).toMatch(/test_diagram.*\.excalidraw$/);

    // Verify files exist on disk
    const pngStat = await fs.stat(res.body.pngPath);
    const excalidrawStat = await fs.stat(res.body.excalidrawPath);
    expect(pngStat.isFile()).toBe(true);
    expect(excalidrawStat.isFile()).toBe(true);

    // Verify the .excalidraw file content matches input
    const writtenScene = await fs.readFile(res.body.excalidrawPath, 'utf-8');
    expect(writtenScene).toBe(sceneJson);

    // Verify the prompt_send event was emitted with both paths
    expect(events).toHaveLength(1);
    expect(events[0].sessionId).toBe(session.id);
    expect(events[0].content).toContain(res.body.pngPath);
    expect(events[0].content).toContain(res.body.excalidrawPath);
  });

  it('returns 400 when pngBase64 is missing', async () => {
    const project = await container.projectService.createProject(createTestProject({ workingDir }));
    const task = await container.taskService.createTask(createTestTask(project.id));
    const session = await container.sessionService.createSession(
      createTestSession(project.id, [task.id]),
    );

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/inject-diagram`)
      .send({ sceneJson: '{}' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when sceneJson is missing', async () => {
    const project = await container.projectService.createProject(createTestProject({ workingDir }));
    const task = await container.taskService.createTask(createTestTask(project.id));
    const session = await container.sessionService.createSession(
      createTestSession(project.id, [task.id]),
    );

    const res = await supertest(app)
      .post(`/api/sessions/${session.id}/inject-diagram`)
      .send({ pngBase64: 'abc' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    const res = await supertest(app)
      .post('/api/sessions/nonexistent_session/inject-diagram')
      .send({ pngBase64: 'abc', sceneJson: '{}' });

    expect(res.status).toBe(404);
  });
});
