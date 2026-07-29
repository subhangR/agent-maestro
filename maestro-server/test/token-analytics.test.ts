import express from 'express';
import supertest from 'supertest';

import { TestDataDir, createTestContainer, createTestProject, createTestTask, createTestSession } from './helpers';
import { TokenAnalyticsService } from '../src/application/services/TokenAnalyticsService';
import { createTokenAnalyticsRoutes } from '../src/api/tokenAnalyticsRoutes';
import { TokenUsageSnapshot } from '../src/types';

function makeSnap(overrides: Partial<TokenUsageSnapshot> = {}): TokenUsageSnapshot {
  return {
    input: 100, output: 50, cacheCreate: 10, cacheRead: 5, total: 165,
    provider: 'claude', model: 'claude-sonnet-4-6',
    capturedAt: Date.now(),
    ...overrides,
  };
}

async function buildApp(dataDir: string) {
  const container = await createTestContainer(dataDir);
  const service = new TokenAnalyticsService(container.sessionRepo, container.taskRepo);

  const app = express();
  app.use(express.json());
  app.use('/api', createTokenAnalyticsRoutes(service));

  return { app, container, service };
}

describe('TokenAnalyticsService', () => {
  let testDataDir: TestDataDir;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('sums tokenUsage across sessions for a task', async () => {
    const { container } = await buildApp(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));

    const snap1 = makeSnap({ input: 100, output: 50, total: 150, capturedAt: Date.now() });
    const snap2 = makeSnap({ input: 200, output: 80, total: 280, capturedAt: Date.now() });

    const s1 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));
    const s2 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));

    await container.sessionRepo.update(s1.id, { tokenUsage: snap1 } as any);
    await container.sessionRepo.update(s2.id, { tokenUsage: snap2 } as any);

    const service = new TokenAnalyticsService(container.sessionRepo, container.taskRepo);
    const summary = await service.getTaskTokenSummary(task.id);

    expect(summary.taskId).toBe(task.id);
    expect(summary.sessions).toHaveLength(2);
    expect(summary.totals.input).toBe(300);
    expect(summary.totals.output).toBe(130);
    expect(summary.totals.total).toBe(430);
  });

  it('returns zeros for tasks with no sessions having tokenUsage', async () => {
    const { container } = await buildApp(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));

    await container.sessionService.createSession(createTestSession(project.id, [task.id]));

    const service = new TokenAnalyticsService(container.sessionRepo, container.taskRepo);
    const summary = await service.getTaskTokenSummary(task.id);

    expect(summary.totals.total).toBe(0);
    expect(summary.sessions[0].tokenUsage).toBeNull();
  });

  it('global summary filters by windowMs', async () => {
    const { container } = await buildApp(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));

    const oldSnap = makeSnap({ capturedAt: Date.now() - 48 * 60 * 60 * 1000 }); // 48h ago
    const recentSnap = makeSnap({ capturedAt: Date.now() - 60 * 1000 });         // 1 min ago

    const s1 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));
    const s2 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));
    await container.sessionRepo.update(s1.id, { tokenUsage: oldSnap } as any);
    await container.sessionRepo.update(s2.id, { tokenUsage: recentSnap } as any);

    const service = new TokenAnalyticsService(container.sessionRepo, container.taskRepo);
    const summary = await service.getGlobalSummary(24 * 60 * 60 * 1000);

    expect(summary.sessionCount).toBe(1);
    expect(summary.totals.total).toBe(recentSnap.total);
  });

  it('global summary groups by provider', async () => {
    const { container } = await buildApp(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));

    const claudeSnap = makeSnap({ provider: 'claude', total: 100, input: 80, output: 20, capturedAt: Date.now() });
    const openaiSnap = makeSnap({ provider: 'openai', total: 200, input: 150, output: 50, capturedAt: Date.now() });

    const s1 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));
    const s2 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));
    await container.sessionRepo.update(s1.id, { tokenUsage: claudeSnap } as any);
    await container.sessionRepo.update(s2.id, { tokenUsage: openaiSnap } as any);

    const service = new TokenAnalyticsService(container.sessionRepo, container.taskRepo);
    const summary = await service.getGlobalSummary(24 * 60 * 60 * 1000);

    expect(summary.byProvider['claude']?.total).toBe(100);
    expect(summary.byProvider['openai']?.total).toBe(200);
    expect(summary.totals.total).toBe(300);
  });

  it('global summary groups by model', async () => {
    const { container } = await buildApp(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));

    const s1 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));
    const s2 = await container.sessionService.createSession(createTestSession(project.id, [task.id]));

    const snap1 = makeSnap({ model: 'claude-sonnet-4-6', total: 50, input: 40, output: 10, capturedAt: Date.now() });
    const snap2 = makeSnap({ model: 'claude-sonnet-4-6', total: 75, input: 60, output: 15, capturedAt: Date.now() });
    await container.sessionRepo.update(s1.id, { tokenUsage: snap1 } as any);
    await container.sessionRepo.update(s2.id, { tokenUsage: snap2 } as any);

    const service = new TokenAnalyticsService(container.sessionRepo, container.taskRepo);
    const summary = await service.getGlobalSummary(24 * 60 * 60 * 1000);

    expect(summary.byModel['claude-sonnet-4-6']?.total).toBe(125);
  });
});

describe('GET /api/analytics/tokens/global', () => {
  let testDataDir: TestDataDir;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns 200 with empty summary when no sessions', async () => {
    const { app } = await buildApp(testDataDir.getPath());
    const res = await supertest(app).get('/api/analytics/tokens/global');

    expect(res.status).toBe(200);
    expect(res.body.sessionCount).toBe(0);
    expect(res.body.totals.total).toBe(0);
  });

  it('rejects invalid windowMs below minimum', async () => {
    const { app } = await buildApp(testDataDir.getPath());
    const res = await supertest(app).get('/api/analytics/tokens/global?windowMs=100');
    expect(res.status).toBe(400);
  });

  it('accepts custom windowMs', async () => {
    const { app } = await buildApp(testDataDir.getPath());
    const res = await supertest(app).get('/api/analytics/tokens/global?windowMs=3600000');
    expect(res.status).toBe(200);
    expect(res.body.windowMs).toBe(3600000);
  });
});

describe('GET /api/analytics/tokens/tasks/:id', () => {
  let testDataDir: TestDataDir;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns 404 for unknown task', async () => {
    const { app } = await buildApp(testDataDir.getPath());
    const res = await supertest(app).get('/api/analytics/tokens/tasks/task_nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns token summary for task', async () => {
    const { app, container } = await buildApp(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    const task = await container.taskService.createTask(createTestTask(project.id));

    const res = await supertest(app).get(`/api/analytics/tokens/tasks/${task.id}`);
    expect(res.status).toBe(200);
    expect(res.body.taskId).toBe(task.id);
    expect(res.body.totals.total).toBe(0);
  });
});
