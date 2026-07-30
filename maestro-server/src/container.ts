import { existsSync, writeFileSync, readdirSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
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
import { FileSystemSpellRepository } from './infrastructure/repositories/FileSystemSpellRepository';
import { FileSystemEnsembleRepository } from './infrastructure/repositories/FileSystemEnsembleRepository';
import { FileSystemModelProfileRepository } from './infrastructure/repositories/FileSystemModelProfileRepository';
import { FileSystemSessionPromptRepository } from './infrastructure/repositories/FileSystemSessionPromptRepository';
import { FileSystemClipboardImageRepository } from './infrastructure/repositories/FileSystemClipboardImageRepository';
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
import { ClipboardImageService } from './application/services/ClipboardImageService';
import { HuddleService } from './application/services/HuddleService';
import { CommandUsageService } from './application/services/CommandUsageService';
import { FileSystemSessionCommandUsageRepository } from './infrastructure/repositories/FileSystemSessionCommandUsageRepository';
import { SpellService } from './application/services/SpellService';
import { EnsembleService } from './application/services/EnsembleService';
import { HookDispatcherService } from './application/services/HookDispatcherService';
import { TokenAnalyticsService } from './application/services/TokenAnalyticsService';
import { PtyHostService } from './application/services/PtyHostService';
import { SessionPromptDeliveryService } from './application/services/SessionPromptDeliveryService';
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
import { ISpellRepository } from './domain/repositories/ISpellRepository';
import { IEnsembleRepository } from './domain/repositories/IEnsembleRepository';
import { IModelProfileRepository } from './domain/repositories/IModelProfileRepository';
import { ISessionPromptRepository } from './domain/repositories/ISessionPromptRepository';
import { IClipboardImageRepository } from './domain/repositories/IClipboardImageRepository';
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
 * Clean-break migration for the v2 spell redesign (§11.9). The data model changed
 * shape (single-action `Spell` → multi-rule `Spell.rules[]`, and `ActiveSpell`
 * dropped `iteration`/`hookEvent`/`matcher` for `ruleIterations`). Old-shaped JSON
 * is NOT parsed into the new type, so this one-shot:
 *   (a) deletes any data/spells/*.json that lacks a `rules[]` array (old shape), and
 *   (b) strips `activeSpells` from every data/sessions/* file so no stale rings render.
 * Fresh seeds reappear from code (SPELL_LIBRARY). Guarded by a sentinel; malformed
 * files are skipped, and any failure is non-fatal so the server still starts.
 *
 * To run manually (e.g. on a box that already has the sentinel), delete
 * `<dataDir>/.migrated-spell-redesign-v2` and restart the server.
 */
export function migrateSpellCleanBreak(logger: ILogger, dataDir: string): void {
  try {
    const sentinelPath = join(dataDir, '.migrated-spell-redesign-v2');
    if (existsSync(sentinelPath)) {
      logger.info('Spell clean-break migration already completed, skipping.');
      return;
    }
    logger.info('Running spell clean-break migration (v2)...');

    // This migration runs BEFORE the repos initialize (which is what creates the
    // data dir), so on a brand-new DATA_DIR the sentinel write below would ENOENT.
    // Ensure the data dir exists first.
    mkdirSync(dataDir, { recursive: true });

    // (a) Delete old-shape spell files (anything without a rules[] array).
    let deletedSpells = 0;
    const spellsDir = join(dataDir, 'spells');
    if (existsSync(spellsDir)) {
      for (const file of readdirSync(spellsDir)) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(spellsDir, file);
        try {
          const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
          if (!parsed || !Array.isArray(parsed.rules)) {
            unlinkSync(filePath);
            deletedSpells++;
          }
        } catch {
          // Malformed JSON — leave it untouched rather than guess.
        }
      }
    }

    // (b) Strip activeSpells from every session file.
    let strippedSessions = 0;
    const sessionsDir = join(dataDir, 'sessions');
    if (existsSync(sessionsDir)) {
      for (const file of readdirSync(sessionsDir)) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(sessionsDir, file);
        try {
          const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
          if (parsed && Array.isArray(parsed.activeSpells) && parsed.activeSpells.length > 0) {
            parsed.activeSpells = [];
            writeFileSync(filePath, JSON.stringify(parsed));
            strippedSessions++;
          }
        } catch {
          // Malformed JSON — skip.
        }
      }
    }

    logger.info(
      `Spell clean-break migration complete: deleted ${deletedSpells} old spell file(s), ` +
      `cleared activeSpells on ${strippedSessions} session(s).`,
    );
    writeFileSync(sentinelPath, new Date().toISOString());
  } catch (err) {
    logger.error('Error during spell clean-break migration:', err instanceof Error ? err : new Error(String(err)));
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
  spellRepo: ISpellRepository;
  ensembleRepo: IEnsembleRepository;
  modelProfileRepo: IModelProfileRepository;
  sessionPromptRepo: ISessionPromptRepository;
  clipboardImageRepo: IClipboardImageRepository;

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
  clipboardImageService: ClipboardImageService;
  huddleService: HuddleService;
  commandUsageService: CommandUsageService;
  spellService: SpellService;
  ensembleService: EnsembleService;
  hookDispatcherService: HookDispatcherService;
  tokenAnalyticsService: TokenAnalyticsService;
  ptyHostService: PtyHostService;
  sessionPromptDeliveryService: SessionPromptDeliveryService;
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
  const spellRepo = new FileSystemSpellRepository(config.dataDir, idGenerator, logger);
  const ensembleRepo = new FileSystemEnsembleRepository(config.dataDir, logger);
  const modelProfileRepo = new FileSystemModelProfileRepository(config.dataDir, idGenerator, logger);
  const sessionPromptRepo = new FileSystemSessionPromptRepository(config.dataDir, logger);
  const clipboardImageRepo = new FileSystemClipboardImageRepository(config.dataDir, logger);

  // 4. Loaders
  const skillLoader = new MultiScopeSkillLoader(logger);

  // 5. Services
  const projectService = new ProjectService(projectRepo, eventBus);
  const taskService = new TaskService(taskRepo, projectRepo, eventBus, idGenerator, taskListRepo);
  const taskListService = new TaskListService(taskListRepo, projectRepo, taskRepo, eventBus);
  const taskGraphService = new TaskGraphService(taskGraphRepo, projectRepo, taskRepo, eventBus);
  const sessionService = new SessionService(sessionRepo, taskRepo, projectRepo, eventBus, idGenerator);
  const logDigestService = new LogDigestService(sessionService, projectRepo);
  sessionService.setLogDigestService(logDigestService);
  const tokenAnalyticsService = new TokenAnalyticsService(sessionRepo, taskRepo);
  const orderingService = new OrderingService(orderingRepo);
  const teamMemberService = new TeamMemberService(teamMemberRepo, eventBus, idGenerator);
  const teamService = new TeamService(teamRepo, teamMemberRepo, eventBus, idGenerator);
  const modelProfileService = new ModelProfileService(modelProfileRepo, eventBus, idGenerator);
  const sessionPromptService = new SessionPromptService(sessionPromptRepo, sessionRepo, eventBus, idGenerator);
  const clipboardMaxBytesEnv = Number(process.env.MAESTRO_CLIPBOARD_MAX_BYTES);
  const clipboardImageService = new ClipboardImageService(
    clipboardImageRepo,
    Number.isFinite(clipboardMaxBytesEnv) && clipboardMaxBytesEnv > 0
      ? { maxBytes: clipboardMaxBytesEnv }
      : undefined,
  );
  const huddleService = new HuddleService(sessionPromptService, sessionService);
  const commandUsageRepo = new FileSystemSessionCommandUsageRepository(config.dataDir, logger);
  const commandUsageService = new CommandUsageService(commandUsageRepo);
  // Ensemble service is constructed first so SpellService can delegate
  // `coordinate` casts to it (C1).
  const ensembleService = new EnsembleService(
    ensembleRepo,
    sessionRepo,
    spellRepo,
    eventBus,
    idGenerator,
    logger,
  );
  const spellService = new SpellService(
    projectRepo,
    taskRepo,
    sessionRepo,
    teamMemberRepo,
    skillLoader,
    customPromptRepo,
    spellRepo,
    eventBus,
    idGenerator,
    ensembleService,
  );
  const hookDispatcherService = new HookDispatcherService(
    sessionRepo,
    spellRepo,
    teamMemberRepo,
    eventBus,
    logger,
    config,
  );
  const ptyHostService = new PtyHostService(sessionService, logger);
  const sessionPromptDeliveryService = new SessionPromptDeliveryService(
    eventBus,
    ptyHostService,
    config.ptyHost,
    logger,
  );

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
    spellRepo,
    ensembleRepo,
    modelProfileRepo,
    sessionPromptRepo,
    clipboardImageRepo,
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
    clipboardImageService,
    huddleService,
    commandUsageService,
    spellService,
    ensembleService,
    hookDispatcherService,
    tokenAnalyticsService,
    ptyHostService,
    sessionPromptDeliveryService,
    announcementService,
    alexaIngressService,

    async initialize() {
      logger.info('Initializing container...');

      // Clean-break spell migration (§11.9) — runs on-disk BEFORE repos load their
      // caches, so stale activeSpells / old-shape spell files never reach memory.
      migrateSpellCleanBreak(logger, config.dataDir);

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
        spellRepo.initialize(),
        ensembleRepo.initialize(),
        modelProfileRepo.initialize(),
        sessionPromptRepo.initialize(),
      ]);

      // Migration: Delete old team member tasks (skip if already done)
      await migrateTeamMemberTasks(taskRepo, logger, config.dataDir);

      // Voice/Alexa bootstrap: ensure Master project + Alexa Coordinator (idempotent)
      await masterProjectBootstrap.ensure();

      // Orphan reconciliation: any session that was spawning/idle/working/needs_input
      // when the server last exited has a PTY process that is now dead. Mark those
      // sessions as 'stopped' so the coordinator never sees phantom active sessions.
      const { count: orphanedCount } = await sessionService.reconcileOrphanedSessions();
      if (orphanedCount > 0) {
        logger.info(`Startup reconciliation: marked ${orphanedCount} orphaned session(s) as stopped`);
      }

      logger.info('Container initialized');
    },

    async shutdown() {
      logger.info('Shutting down container...');
      sessionPromptDeliveryService.shutdown();
      ptyHostService.shutdownAll();
      hookDispatcherService.shutdown(); // C5: kill any in-flight run-command children
      logDigestService.shutdown();
      (skillLoader as MultiScopeSkillLoader).shutdown();
      sessionRepo.shutdown();
      eventBus.removeAllListeners();
      logger.info('Container shutdown complete');
    }
  };

  return container;
}
