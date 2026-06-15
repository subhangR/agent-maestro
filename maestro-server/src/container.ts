import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Config } from './infrastructure/config';
import { ConsoleLogger } from './infrastructure/common/ConsoleLogger';
import { TimestampIdGenerator } from './infrastructure/common/TimestampIdGenerator';
import { InMemoryEventBus } from './infrastructure/events/InMemoryEventBus';
import { FileSystemProjectRepository } from './infrastructure/repositories/FileSystemProjectRepository';
import { FileSystemTaskRepository } from './infrastructure/repositories/FileSystemTaskRepository';
import { FileSystemSessionRepository } from './infrastructure/repositories/FileSystemSessionRepository';
import { FileSystemTaskListRepository } from './infrastructure/repositories/FileSystemTaskListRepository';
import { FileSystemTaskGraphRepository } from './infrastructure/repositories/FileSystemTaskGraphRepository';

import { FileSystemOrderingRepository } from './infrastructure/repositories/FileSystemOrderingRepository';
import { FileSystemTeamMemberRepository } from './infrastructure/repositories/FileSystemTeamMemberRepository';
import { FileSystemTeamRepository } from './infrastructure/repositories/FileSystemTeamRepository';
import { FileSystemCustomPromptRepository } from './infrastructure/repositories/FileSystemCustomPromptRepository';
import { FileSystemModelProfileRepository } from './infrastructure/repositories/FileSystemModelProfileRepository';
import { FileSystemSessionPromptRepository } from './infrastructure/repositories/FileSystemSessionPromptRepository';
import { MultiScopeSkillLoader } from './infrastructure/skills/MultiScopeSkillLoader';
import { ProjectService } from './application/services/ProjectService';
import { TaskService } from './application/services/TaskService';
import { SessionService } from './application/services/SessionService';
import { TaskListService } from './application/services/TaskListService';
import { TaskGraphService } from './application/services/TaskGraphService';
import { LogDigestService } from './application/services/LogDigestService';

import { OrderingService } from './application/services/OrderingService';
import { TeamMemberService } from './application/services/TeamMemberService';
import { TeamService } from './application/services/TeamService';
import { ModelProfileService } from './application/services/ModelProfileService';
import { SessionPromptService } from './application/services/SessionPromptService';
import { HuddleService } from './application/services/HuddleService';
import { CommandUsageService } from './application/services/CommandUsageService';
import { FileSystemSessionCommandUsageRepository } from './infrastructure/repositories/FileSystemSessionCommandUsageRepository';
import { SpellService } from './application/services/SpellService';
import { PtyHostService } from './application/services/PtyHostService';
import { AnnouncementService } from './application/services/AnnouncementService';
import { AlexaIngressService } from './application/services/AlexaIngressService';
import { VoiceMonkeyClient } from './infrastructure/voicemonkey/VoiceMonkeyClient';
import { MasterProjectBootstrap, VoiceState } from './infrastructure/bootstrap/MasterProjectBootstrap';
import { ILogger } from './domain/common/ILogger';
import { IIdGenerator } from './domain/common/IIdGenerator';
import { IEventBus } from './domain/events/IEventBus';
import { IProjectRepository } from './domain/repositories/IProjectRepository';
import { ITaskRepository } from './domain/repositories/ITaskRepository';
import { ITaskListRepository } from './domain/repositories/ITaskListRepository';
import { ITaskGraphRepository } from './domain/repositories/ITaskGraphRepository';
import { ISessionRepository } from './domain/repositories/ISessionRepository';

import { IOrderingRepository } from './domain/repositories/IOrderingRepository';
import { ITeamMemberRepository } from './domain/repositories/ITeamMemberRepository';
import { ITeamRepository } from './domain/repositories/ITeamRepository';
import { ICustomPromptRepository } from './domain/repositories/ICustomPromptRepository';
import { IModelProfileRepository } from './domain/repositories/IModelProfileRepository';
import { ISessionPromptRepository } from './domain/repositories/ISessionPromptRepository';
import { ISkillLoader } from './domain/services/ISkillLoader';

/**
 * Migration: Delete old team member tasks (one-time migration).
 * Scans all tasks and deletes any with taskType === 'team-member'.
 * This is safe to run multiple times (idempotent).
 */
async function migrateTeamMemberTasks(taskRepo: ITaskRepository, logger: ILogger, dataDir: string): Promise<void> {
  try {
    const sentinelPath = join(dataDir, '.migrated-team-member-tasks');
    if (existsSync(sentinelPath)) {
      logger.info('Team member task migration already completed, skipping.');
      return;
    }

    logger.info('Running team member task migration...');

    // Get all tasks
    const allTasks = await taskRepo.findAll();
    let deletedCount = 0;

    for (const task of allTasks) {
      // Check if task has the old taskType field set to 'team-member'
      const taskAny = task as any;
      if (taskAny.taskType === 'team-member') {
        logger.info(`Deleting old team member task: ${task.id} (${task.title})`);
        await taskRepo.delete(task.id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.info(`Migration complete: deleted ${deletedCount} old team member task(s)`);
    } else {
      logger.info('Migration complete: no old team member tasks found');
    }

    // Write sentinel file so we skip on subsequent startups
    writeFileSync(sentinelPath, new Date().toISOString());
  } catch (err) {
    logger.error('Error during team member task migration:', err instanceof Error ? err : new Error(String(err)));
    // Don't throw - allow server to start even if migration fails
  }
}

/**
 * Dependency injection container.
 * Wires together all application components.
 */
export interface Container {
  // Configuration
  config: Config;

  // Infrastructure
  logger: ILogger;
  idGenerator: IIdGenerator;
  eventBus: IEventBus;

  // Repositories
  projectRepo: IProjectRepository;
  taskRepo: ITaskRepository;
  taskListRepo: ITaskListRepository;
  taskGraphRepo: ITaskGraphRepository;
  sessionRepo: ISessionRepository;
  orderingRepo: IOrderingRepository;
  teamMemberRepo: ITeamMemberRepository;
  teamRepo: ITeamRepository;
  customPromptRepo: ICustomPromptRepository;
  modelProfileRepo: IModelProfileRepository;
  sessionPromptRepo: ISessionPromptRepository;

  // Loaders
  skillLoader: ISkillLoader;

  // Services
  projectService: ProjectService;
  taskService: TaskService;
  taskListService: TaskListService;
  taskGraphService: TaskGraphService;
  sessionService: SessionService;
  logDigestService: LogDigestService;
  orderingService: OrderingService;
  teamMemberService: TeamMemberService;
  teamService: TeamService;
  modelProfileService: ModelProfileService;
  sessionPromptService: SessionPromptService;
  huddleService: HuddleService;
  commandUsageService: CommandUsageService;
  spellService: SpellService;
  ptyHostService: PtyHostService;
  announcementService: AnnouncementService;
  alexaIngressService: AlexaIngressService;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Create and wire up all dependencies.
 */
export async function createContainer(): Promise<Container> {
  // 1. Configuration
  const config = new Config();

  // 2. Infrastructure - Core
  const logger = new ConsoleLogger(config.log.level);
  const idGenerator = new TimestampIdGenerator();
  const eventBus = new InMemoryEventBus(logger);

  // 3. Repositories
  const taskRepo = new FileSystemTaskRepository(config.dataDir, idGenerator, logger);
  const sessionRepo = new FileSystemSessionRepository(config.dataDir, idGenerator, logger);
  const taskListRepo = new FileSystemTaskListRepository(config.dataDir, idGenerator, logger);
  const taskGraphRepo = new FileSystemTaskGraphRepository(config.dataDir, idGenerator, logger);
  const projectRepo = new FileSystemProjectRepository(
    config.dataDir,
    idGenerator,
    logger,
    // Cross-repository checks
    (projectId) => taskRepo.existsByProjectId(projectId),
    (projectId) => sessionRepo.existsByProjectId(projectId)
  );
  const orderingRepo = new FileSystemOrderingRepository(config.dataDir, logger);
  const teamMemberRepo = new FileSystemTeamMemberRepository(config.dataDir, idGenerator, logger);
  const teamRepo = new FileSystemTeamRepository(config.dataDir, idGenerator, logger);
  const customPromptRepo = new FileSystemCustomPromptRepository(config.dataDir, idGenerator, logger);
  const modelProfileRepo = new FileSystemModelProfileRepository(config.dataDir, idGenerator, logger);
  const sessionPromptRepo = new FileSystemSessionPromptRepository(config.dataDir, logger);

  // 4. Loaders
  const skillLoader = new MultiScopeSkillLoader(logger);

  // 5. Services
  const projectService = new ProjectService(projectRepo, eventBus);
  const taskService = new TaskService(taskRepo, projectRepo, eventBus, idGenerator, taskListRepo);
  const taskListService = new TaskListService(taskListRepo, projectRepo, taskRepo, eventBus);
  const taskGraphService = new TaskGraphService(taskGraphRepo, projectRepo, taskRepo, eventBus);
  const sessionService = new SessionService(sessionRepo, taskRepo, projectRepo, eventBus, idGenerator);
  const logDigestService = new LogDigestService(sessionService, projectRepo);
  const orderingService = new OrderingService(orderingRepo);
  const teamMemberService = new TeamMemberService(teamMemberRepo, eventBus, idGenerator);
  const teamService = new TeamService(teamRepo, teamMemberRepo, eventBus, idGenerator);
  const modelProfileService = new ModelProfileService(modelProfileRepo, eventBus, idGenerator);
  const sessionPromptService = new SessionPromptService(sessionPromptRepo, sessionRepo, eventBus, idGenerator);
  const huddleService = new HuddleService(sessionPromptService, sessionService);
  const commandUsageRepo = new FileSystemSessionCommandUsageRepository(config.dataDir, logger);
  const commandUsageService = new CommandUsageService(commandUsageRepo);
  const spellService = new SpellService(
    projectRepo,
    taskRepo,
    sessionRepo,
    teamMemberRepo,
    skillLoader,
    customPromptRepo,
    eventBus,
    idGenerator,
  );
  const ptyHostService = new PtyHostService(sessionService, logger);

  // Voice / Alexa integration
  const voiceState: VoiceState = {};
  const vmClient = config.voice.vmToken
    ? new VoiceMonkeyClient({ token: config.voice.vmToken, logger })
    : null;
  if (!vmClient) {
    logger.warn('VM_TOKEN not configured — voice announcements are disabled');
  }
  const announcementService = new AnnouncementService({
    vmClient,
    defaultDevice: config.voice.vmDevice,
    sessionService,
    logger,
  });
  const alexaIngressService = new AlexaIngressService({
    logger,
    eventBus,
    sessionService,
    voiceState,
    alexaRootTeamMemberId: config.voice.alexaRootTeamMemberId,
    serverUrl: config.serverUrl,
  });
  const masterProjectBootstrap = new MasterProjectBootstrap(
    projectRepo,
    teamMemberRepo,
    taskService,
    logger,
    voiceState,
    config.voice.alexaRootTeamMemberId,
  );

  const container: Container = {
    config,
    logger,
    idGenerator,
    eventBus,
    projectRepo,
    taskRepo,
    taskListRepo,
    taskGraphRepo,
    sessionRepo,
    orderingRepo,
    teamMemberRepo,
    teamRepo,
    customPromptRepo,
    modelProfileRepo,
    sessionPromptRepo,
    skillLoader,
    projectService,
    taskService,
    taskListService,
    taskGraphService,
    sessionService,
    logDigestService,
    orderingService,
    teamMemberService,
    teamService,
    modelProfileService,
    sessionPromptService,
    huddleService,
    commandUsageService,
    spellService,
    ptyHostService,
    announcementService,
    alexaIngressService,

    async initialize() {
      logger.info('Initializing container...');

      // Initialize repositories in parallel
      await Promise.all([
        projectRepo.initialize(),
        taskRepo.initialize(),
        taskListRepo.initialize(),
        taskGraphRepo.initialize(),
        sessionRepo.initialize(),
        orderingRepo.initialize(),
        teamMemberRepo.initialize(),
        teamRepo.initialize(),
        customPromptRepo.initialize(),
        modelProfileRepo.initialize(),
        sessionPromptRepo.initialize(),
      ]);

      // Migration: Delete old team member tasks (skip if already done)
      await migrateTeamMemberTasks(taskRepo, logger, config.dataDir);

      // Voice/Alexa bootstrap: ensure Master project + Alexa Coordinator (idempotent)
      await masterProjectBootstrap.ensure();

      logger.info('Container initialized');
    },

    async shutdown() {
      logger.info('Shutting down container...');
      ptyHostService.shutdownAll();
      logDigestService.shutdown();
      (skillLoader as MultiScopeSkillLoader).shutdown();
      sessionRepo.shutdown();
      eventBus.removeAllListeners();
      logger.info('Container shutdown complete');
    }
  };

  return container;
}
