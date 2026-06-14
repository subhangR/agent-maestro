import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { InMemoryEventBus } from '../src/infrastructure/events/InMemoryEventBus';
import { TimestampIdGenerator } from '../src/infrastructure/common/TimestampIdGenerator';
import { FileSystemProjectRepository } from '../src/infrastructure/repositories/FileSystemProjectRepository';
import { FileSystemTaskRepository } from '../src/infrastructure/repositories/FileSystemTaskRepository';
import { FileSystemSessionRepository } from '../src/infrastructure/repositories/FileSystemSessionRepository';
import { FileSystemTaskListRepository } from '../src/infrastructure/repositories/FileSystemTaskListRepository';
import { FileSystemTeamMemberRepository } from '../src/infrastructure/repositories/FileSystemTeamMemberRepository';
import { FileSystemTeamRepository } from '../src/infrastructure/repositories/FileSystemTeamRepository';
import { FileSystemModelProfileRepository } from '../src/infrastructure/repositories/FileSystemModelProfileRepository';
import { FileSystemSessionPromptRepository } from '../src/infrastructure/repositories/FileSystemSessionPromptRepository';
import { FileSystemSessionCommandUsageRepository } from '../src/infrastructure/repositories/FileSystemSessionCommandUsageRepository';
import { ProjectService } from '../src/application/services/ProjectService';
import { TaskService } from '../src/application/services/TaskService';
import { SessionService } from '../src/application/services/SessionService';
import { SessionPromptService } from '../src/application/services/SessionPromptService';
import { HuddleService } from '../src/application/services/HuddleService';
import { CommandUsageService } from '../src/application/services/CommandUsageService';
import { TeamMemberService } from '../src/application/services/TeamMemberService';
import { TeamService } from '../src/application/services/TeamService';
import { ILogger } from '../src/domain/common/ILogger';

/**
 * Test helper utilities
 */

export class TestDataDir {
  private testDir: string;

  constructor() {
    // Use a unique test directory for each test run
    this.testDir = path.join(os.tmpdir(), `maestro-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  getPath(): string {
    return this.testDir;
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

/** Silent logger for tests */
export const silentLogger: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
};

/**
 * Create a test container with all services wired up, backed by filesystem repos in a temp dir.
 */
export async function createTestContainer(dataDir: string) {
  const eventBus = new InMemoryEventBus(silentLogger);
  const idGenerator = new TimestampIdGenerator();

  const taskRepo = new FileSystemTaskRepository(dataDir, idGenerator, silentLogger);
  const sessionRepo = new FileSystemSessionRepository(dataDir, idGenerator, silentLogger);
  const taskListRepo = new FileSystemTaskListRepository(dataDir, idGenerator, silentLogger);
  const teamMemberRepo = new FileSystemTeamMemberRepository(dataDir, idGenerator, silentLogger);
  const teamRepo = new FileSystemTeamRepository(dataDir, idGenerator, silentLogger);
  const modelProfileRepo = new FileSystemModelProfileRepository(dataDir, idGenerator, silentLogger);
  const sessionPromptRepo = new FileSystemSessionPromptRepository(dataDir, silentLogger);
  const projectRepo = new FileSystemProjectRepository(
    dataDir,
    idGenerator,
    silentLogger,
    (projectId) => taskRepo.existsByProjectId(projectId),
    (projectId) => sessionRepo.existsByProjectId(projectId)
  );

  await projectRepo.initialize();
  await taskRepo.initialize();
  await sessionRepo.initialize();
  await taskListRepo.initialize();
  await teamMemberRepo.initialize();
  await teamRepo.initialize();
  await modelProfileRepo.initialize();
  await sessionPromptRepo.initialize();

  const projectService = new ProjectService(projectRepo, eventBus);
  const taskService = new TaskService(taskRepo, projectRepo, eventBus, idGenerator, taskListRepo);
  const sessionService = new SessionService(sessionRepo, taskRepo, projectRepo, eventBus, idGenerator);
  const sessionPromptService = new SessionPromptService(sessionPromptRepo, sessionRepo, eventBus, idGenerator);
  const huddleService = new HuddleService(sessionPromptService, sessionService);
  const commandUsageService = new CommandUsageService(
    new FileSystemSessionCommandUsageRepository(dataDir, silentLogger)
  );
  const teamMemberService = new TeamMemberService(teamMemberRepo, eventBus, idGenerator);
  const teamService = new TeamService(teamRepo, teamMemberRepo, eventBus, idGenerator);

  return {
    projectService,
    taskService,
    sessionService,
    sessionPromptService,
    huddleService,
    commandUsageService,
    teamMemberService,
    teamService,
    projectRepo,
    taskRepo,
    sessionRepo,
    teamMemberRepo,
    teamRepo,
    modelProfileRepo,
    sessionPromptRepo,
    eventBus,
    idGenerator,
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Wait for a specific time
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create test project data
 */
export function createTestProject(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Project',
    workingDir: '/tmp/test-project',
    description: 'Test project description',
    ...overrides
  };
}

/**
 * Create test task data
 */
export function createTestTask(projectId: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    title: 'Test Task',
    description: 'Test task description',
    priority: 'medium' as const,
    ...overrides
  };
}

/**
 * Create test session data
 */
export function createTestSession(projectId: string, taskIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    taskIds,
    name: 'Test Session',
    metadata: {
      skills: ['test-skill']
    },
    ...overrides
  };
}
