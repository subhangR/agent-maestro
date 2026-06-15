/**
 * Tests for POST /api/sessions/:id/prompt — verifies the emitted session:prompt_send
 * event carries server-derived senderProjectId + targetProjectId (used by the UI to
 * decide same-project rail vs cross-project bar messaging animations).
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
  app.use(express.json());
  app.use('/api', sessionRoutes);

  return { app, container };
}

describe('POST /api/sessions/:id/prompt — project IDs in event payload', () => {
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

  it('emits senderProjectId and targetProjectId for a same-project prompt', async () => {
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));
    const sender = await container.sessionService.createSession(
      createTestSession(project.id, [task.id], { name: 'Sender' }),
    );
    const target = await container.sessionService.createSession(
      createTestSession(project.id, [task.id], { name: 'Target' }),
    );

    const events: any[] = [];
    container.eventBus.on('session:prompt_send', (data: any) => events.push(data));

    const res = await supertest(app)
      .post(`/api/sessions/${target.id}/prompt`)
      .send({ content: 'hello', senderSessionId: sender.id });

    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: target.id,
      senderSessionId: sender.id,
      senderProjectId: project.id,
      targetProjectId: project.id,
    });
  });

  it('emits distinct project IDs for a cross-project prompt', async () => {
    const projectA = await container.projectService.createProject(createTestProject({ name: 'A' }));
    const projectB = await container.projectService.createProject(createTestProject({ name: 'B' }));
    const taskA = await container.taskService.createTask(createTestTask(projectA.id));
    const taskB = await container.taskService.createTask(createTestTask(projectB.id));
    const target = await container.sessionService.createSession(
      createTestSession(projectA.id, [taskA.id], { name: 'Target' }),
    );
    const sender = await container.sessionService.createSession(
      createTestSession(projectB.id, [taskB.id], { name: 'Sender' }),
    );

    const events: any[] = [];
    container.eventBus.on('session:prompt_send', (data: any) => events.push(data));

    const res = await supertest(app)
      .post(`/api/sessions/${target.id}/prompt`)
      .send({ content: 'cross project hello', senderSessionId: sender.id });

    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0].senderProjectId).toBe(projectB.id);
    expect(events[0].targetProjectId).toBe(projectA.id);
    expect(events[0].senderProjectId).not.toBe(events[0].targetProjectId);
  });
});

describe('SessionPrompt persistence + read endpoints', () => {
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

  async function seedTwoSessions() {
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));
    const sender = await container.sessionService.createSession(
      createTestSession(project.id, [task.id], { name: 'Sender' }),
    );
    const target = await container.sessionService.createSession(
      createTestSession(project.id, [task.id], { name: 'Target' }),
    );
    return { project, sender, target };
  }

  it('persists a clean SessionPrompt (no [From:] prefix) and emits session:prompt_recorded', async () => {
    const { project, sender, target } = await seedTwoSessions();

    const recorded: any[] = [];
    container.eventBus.on('session:prompt_recorded', (data: any) => recorded.push(data));

    const res = await supertest(app)
      .post(`/api/sessions/${target.id}/prompt`)
      .send({ content: 'do the thing', senderSessionId: sender.id });

    expect(res.status).toBe(200);
    expect(recorded).toHaveLength(1);

    const all = await container.sessionPromptService.getAll();
    expect(all).toHaveLength(1);
    const prompt = all[0];
    expect(prompt.id).toMatch(/^sp_/);
    expect(prompt.content).toBe('do the thing');
    expect(prompt.content).not.toContain('[From:');
    expect(prompt.fromSessionId).toBe(sender.id);
    expect(prompt.toSessionId).toBe(target.id);
    expect(prompt.fromProjectId).toBe(project.id);
    expect(prompt.toProjectId).toBe(project.id);
    expect(prompt.fromSessionName).toBe('Sender');
    expect(prompt.toSessionName).toBe('Target');
    expect(prompt.mode).toBe('send');
  });

  it('GET /api/sessions/:id/prompts returns prompts where the session is sender OR receiver', async () => {
    const { sender, target } = await seedTwoSessions();

    await supertest(app)
      .post(`/api/sessions/${target.id}/prompt`)
      .send({ content: 'a to b', senderSessionId: sender.id });
    await supertest(app)
      .post(`/api/sessions/${sender.id}/prompt`)
      .send({ content: 'b to a', senderSessionId: target.id });

    const res = await supertest(app).get(`/api/sessions/${target.id}/prompts`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const contents = res.body.map((p: any) => p.content).sort();
    expect(contents).toEqual(['a to b', 'b to a']);
  });

  it('GET /api/session-prompts returns every prompt across projects', async () => {
    const { sender, target } = await seedTwoSessions();

    await supertest(app)
      .post(`/api/sessions/${target.id}/prompt`)
      .send({ content: 'one', senderSessionId: sender.id });

    const res = await supertest(app).get('/api/session-prompts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].content).toBe('one');
  });

  it('rejects an empty content body via Zod validation', async () => {
    const { sender, target } = await seedTwoSessions();
    const res = await supertest(app)
      .post(`/api/sessions/${target.id}/prompt`)
      .send({ content: '', senderSessionId: sender.id });
    expect(res.status).toBe(400);
  });
});
