/**
 * Regression tests for the spawn-path CLI resolution hardening.
 *
 * Two concerns are covered:
 *   1. Command construction — the resolved CLI entry point is wrapped as
 *      `node <path> <mode> <subcommand>`, falling back to a bare `maestro`
 *      (PATH lookup) only when the path could not be resolved (packaged build).
 *      The bare-`maestro` branch is unreachable through the route in a non-pkg
 *      (test) env — `resolveMaestroCliRuntime` always resolves to the real
 *      `node_modules/.bin/maestro` — so it is exercised via the extracted pure
 *      `buildMaestroSpawnCommand` helper.
 *   2. Fail-fast guard — a resolved-but-nonexistent MAESTRO_CLI_PATH must surface
 *      as an actionable 500 (`maestro_cli_not_found`) rather than silently spawning
 *      `node <bad-path> worker init` inside a terminal that never flips to failed.
 */

import express from 'express';
import supertest from 'supertest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';

import { TestDataDir, createTestContainer, createTestProject, createTestTask, silentLogger } from './helpers';
import {
  createSessionRoutes,
  buildMaestroSpawnCommand,
} from '../src/api/sessionRoutes';
import { LogDigestService } from '../src/application/services/LogDigestService';
import { PtyHostService } from '../src/application/services/PtyHostService';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn((_cmd: any, _args: any, _opts: any, callback: any) => {
    if (typeof callback === 'function') callback(null, '', '');
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn: mockSpawnFn } = require('child_process');

// Manifest generation is a mocked child_process.spawn that just writes the
// requested --output manifest and exits 0, regardless of the (possibly bogus)
// CLI path — so the route always reaches the post-manifest guard under test.
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

function makeConfig(dataDir: string, cliPath: string) {
  return {
    serverUrl: 'http://localhost:3002',
    dataDir,
    sessionDir: path.join(dataDir, 'sessions'),
    port: 3002,
    manifestGenerator: { type: 'cli', cliPath },
  } as any;
}

async function buildApp(dataDir: string, cliPath: string) {
  const container = await createTestContainer(dataDir);
  const config = makeConfig(dataDir, cliPath);
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
  });

  const app = express();
  app.use(express.json());
  app.use('/api', sessionRoutes);
  return { app, container };
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) & (b): command construction — pure helper
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMaestroSpawnCommand — command construction', () => {
  it('(a) uses a bare `maestro` (no `node ` prefix) when the CLI path is unresolved', () => {
    // init-spawn form
    expect(buildMaestroSpawnCommand('maestro', 'worker', 'init')).toBe('maestro worker init');
    expect(buildMaestroSpawnCommand('maestro', 'orchestrator', 'init')).toBe('maestro orchestrator init');
    // resume form
    expect(buildMaestroSpawnCommand('maestro', 'worker', 'resume')).toBe('maestro worker resume');
    expect(buildMaestroSpawnCommand('maestro', 'orchestrator', 'resume')).toBe('maestro orchestrator resume');
  });

  it('(b) wraps a resolved path as `node <path> <mode> <subcommand>` (proven happy-path form)', () => {
    const resolved = '/repo/node_modules/.bin/maestro';
    // The exact byte-for-byte happy-path string that must never regress.
    expect(buildMaestroSpawnCommand(resolved, 'worker', 'init')).toBe('node /repo/node_modules/.bin/maestro worker init');
    expect(buildMaestroSpawnCommand(resolved, 'orchestrator', 'init')).toBe('node /repo/node_modules/.bin/maestro orchestrator init');
    expect(buildMaestroSpawnCommand(resolved, 'worker', 'resume')).toBe('node /repo/node_modules/.bin/maestro worker resume');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) integration + guard-passes: real resolution yields `node <existing> worker init`
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/spawn — resolved CLI path (happy path)', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;
  let container: any;
  let projectId: string;
  let taskId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    // cliPath 'maestro' → resolveMaestroCliRuntime resolves to the real
    // node_modules/.bin/maestro in the monorepo (exists), so the guard passes.
    ({ app, container } = await buildApp(testDataDir.getPath(), 'maestro'));
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

  it('spawns with `node <existing-path> worker init` and does not trip the guard', async () => {
    let emittedCommand: string | undefined;
    container.eventBus.on('session:spawn', (evt: any) => { emittedCommand = evt.command; });

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .send({ projectId, taskIds: [taskId], spawnSource: 'ui', mode: 'worker' });

    expect(res.status).toBe(201);
    expect(res.body.code).not.toBe('maestro_cli_not_found');

    expect(emittedCommand).toBeDefined();
    const match = /^node (\/.+maestro) worker init$/.exec(emittedCommand!);
    expect(match).not.toBeNull();
    // The resolved entry point actually exists on disk (the guard's invariant).
    expect(existsSync(match![1])).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c): fail-fast guard — resolved-but-missing CLI path → 500 maestro_cli_not_found
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/spawn — missing CLI path guard', () => {
  let testDataDir: TestDataDir;
  let app: express.Application;
  let container: any;
  let projectId: string;
  let taskId: string;
  let missingCliPath: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    // An absolute path that is never created → resolveMaestroCliRuntime returns it
    // verbatim (override branch), existsSync is false, guard must fire.
    missingCliPath = path.join(testDataDir.getPath(), 'no-such-dir', 'maestro');
    ({ app, container } = await buildApp(testDataDir.getPath(), missingCliPath));
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

  it('returns 500 maestro_cli_not_found when the resolved CLI path does not exist', async () => {
    expect(existsSync(missingCliPath)).toBe(false); // precondition

    const res = await supertest(app)
      .post('/api/sessions/spawn')
      .send({ projectId, taskIds: [taskId], spawnSource: 'ui', mode: 'worker' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('maestro_cli_not_found');
    expect(res.body.message).toContain(missingCliPath);
  });
});
