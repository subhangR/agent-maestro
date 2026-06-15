/**
 * Tests for GET /api/sessions/:id/command-usage — reads the per-session JSONL
 * command-usage log written by the maestro CLI and returns parsed records plus
 * an aggregated summary (totals, failures, per-command tallies).
 */

import express from 'express';
import supertest from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';

import { TestDataDir, createTestContainer } from './helpers';
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

async function writeLog(dataDir: string, sessionId: string, lines: string[]): Promise<void> {
  const dir = path.join(dataDir, 'command-logs');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
}

function record(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    ts: '2026-06-11T00:00:00.000Z',
    sessionId: 'sess_x',
    projectId: 'proj_x',
    command: 'whoami',
    argv: ['whoami'],
    exitCode: 0,
    durationMs: 10,
    success: true,
    cliVersion: '0.1.0',
    ...overrides,
  });
}

describe('GET /api/sessions/:id/command-usage', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    ({ app } = await buildApp(testDataDir.getPath()));
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('returns parsed records and an aggregated summary', async () => {
    const sessionId = 'sess_cmd_1';
    await writeLog(testDataDir.getPath(), sessionId, [
      record({ command: 'whoami', argv: ['whoami'] }),
      record({ command: 'task get', argv: ['task', 'get', 'bad'], exitCode: 2, success: false }),
      record({ command: 'task get', argv: ['task', 'get', 'also-bad'], exitCode: 2, success: false }),
      record({ command: 'status', argv: ['status'] }),
    ]);

    const res = await supertest(app).get(`/api/sessions/${sessionId}/command-usage`);

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.records).toHaveLength(4);
    expect(res.body.summary).toMatchObject({ total: 4, succeeded: 2, failed: 2 });

    const taskGet = res.body.summary.byCommand.find((c: any) => c.command === 'task get');
    expect(taskGet).toMatchObject({ command: 'task get', total: 2, failed: 2 });
    // byCommand is sorted by total descending — "task get" (2) leads.
    expect(res.body.summary.byCommand[0].command).toBe('task get');
  });

  it('returns an empty summary when the session has no log file', async () => {
    const res = await supertest(app).get('/api/sessions/sess_none/command-usage');

    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
    expect(res.body.summary).toMatchObject({ total: 0, succeeded: 0, failed: 0, byCommand: [] });
  });

  it('skips corrupt JSONL lines without failing the request', async () => {
    const sessionId = 'sess_cmd_2';
    await writeLog(testDataDir.getPath(), sessionId, [
      record({ command: 'whoami' }),
      '{ this is not valid json',
      record({ command: 'status' }),
    ]);

    const res = await supertest(app).get(`/api/sessions/${sessionId}/command-usage`);

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
    expect(res.body.summary.total).toBe(2);
  });
});
