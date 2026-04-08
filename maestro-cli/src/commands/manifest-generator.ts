import type {
  MaestroManifest,
  AdditionalContext,
  AgentTool,
  AgentModeInput,
  TeamMemberData,
  TeamMemberProfile,
  MasterProjectInfo,
  AgentMode,
} from '../types/manifest.js';
import { normalizeMode, isCoordinatorMode } from '../types/manifest.js';
import { DEFAULT_ACCEPTANCE_CRITERIA, MODE_VALIDATION_ERROR, AGENT_TOOL_VALIDATION_PREFIX } from '../prompts/index.js';
import { validateManifest } from '../schemas/manifest-schema.js';
import { storage } from '../storage.js';
import { api } from '../api.js';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join, extname } from 'path';
import { homedir } from 'os';

/**
 * Task data input for manifest generation
 */
export interface TaskInput {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  projectId: string;
  createdAt: string;
  parentId?: string | null;
  dependencies?: string[];
  priority?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
  images?: Array<{ path: string; filename: string; mimeType: string }>;
}

/**
 * Session options for manifest generation
 */
export interface SessionOptions {
  model: string;
  permissionMode: 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions';
  thinkingMode?: 'auto' | 'interleaved' | 'disabled';
  maxTurns?: number;
  timeout?: number;
  workingDirectory?: string;
  context?: AdditionalContext;
}

export function resolveSelfIdentityMemberIds(
  mode: AgentMode,
  teamMemberId?: string,
  teamMemberIds?: string[],
): string[] {
  if (teamMemberId) {
    return [teamMemberId];
  }

  const ids = (teamMemberIds || []).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }

  if (isCoordinatorMode(mode)) {
    return [ids[0]];
  }

  return ids;
}

type MemberPermissionMode = SessionOptions['permissionMode'];
type MemberCommandPermissions = NonNullable<MaestroManifest['teamMemberCommandPermissions']>;

interface MemberLaunchOverride {
  agentTool?: AgentTool;
  model?: string;
  permissionMode?: MemberPermissionMode;
  skillIds?: string[];
  commandPermissions?: MemberCommandPermissions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  const filtered: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') {
      filtered[key] = entry;
    }
  }
  return filtered;
}

function mergeCommandPermissions(
  base: MemberCommandPermissions | undefined,
  override: MemberCommandPermissions | undefined,
): MemberCommandPermissions | undefined {
  if (!base && !override) return undefined;

  const hasOverrideGroups = !!override && Object.prototype.hasOwnProperty.call(override, 'groups');
  const hasOverrideCommands = !!override && Object.prototype.hasOwnProperty.call(override, 'commands');

  const result: MemberCommandPermissions = {};
  if (hasOverrideGroups || base?.groups) {
    result.groups = hasOverrideGroups ? (override?.groups || {}) : (base?.groups || {});
  }
  if (hasOverrideCommands || base?.commands) {
    result.commands = hasOverrideCommands ? (override?.commands || {}) : (base?.commands || {});
  }

  if (!('groups' in result) && !('commands' in result)) {
    return undefined;
  }

  return result;
}

function parseMemberOverrides(raw: string | undefined): Record<string, MemberLaunchOverride> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const overrides: Record<string, MemberLaunchOverride> = {};
    for (const [memberId, value] of Object.entries(parsed)) {
      if (!isRecord(value)) continue;

      let commandPermissions: MemberCommandPermissions | undefined;
      if (isRecord(value.commandPermissions)) {
        const hasGroups = Object.prototype.hasOwnProperty.call(value.commandPermissions, 'groups');
        const hasCommands = Object.prototype.hasOwnProperty.call(value.commandPermissions, 'commands');
        if (hasGroups || hasCommands) {
          commandPermissions = {
            ...(hasGroups ? { groups: readBooleanRecord(value.commandPermissions.groups) } : {}),
            ...(hasCommands ? { commands: readBooleanRecord(value.commandPermissions.commands) } : {}),
          };
        }
      }

      const override: MemberLaunchOverride = {
        ...(typeof value.agentTool === 'string' ? { agentTool: value.agentTool as AgentTool } : {}),
        ...(typeof value.model === 'string' ? { model: value.model } : {}),
        ...(typeof value.permissionMode === 'string' ? { permissionMode: value.permissionMode as MemberPermissionMode } : {}),
        ...(Array.isArray(value.skillIds)
          ? { skillIds: value.skillIds.filter((entry): entry is string => typeof entry === 'string') }
          : {}),
        ...(commandPermissions && Object.keys(commandPermissions).length > 0 ? { commandPermissions } : {}),
      };

      if (Object.keys(override).length > 0) {
        overrides[memberId] = override;
      }
    }

    return overrides;
  } catch {
    return {};
  }
}

function applyMemberOverride(teamMember: any, override: MemberLaunchOverride | undefined): any {
  if (!override) return teamMember;

  const mergedCommandPermissions = mergeCommandPermissions(teamMember.commandPermissions, override.commandPermissions);

  return {
    ...teamMember,
    ...(override.agentTool !== undefined ? { agentTool: override.agentTool } : {}),
    ...(override.model !== undefined ? { model: override.model } : {}),
    ...(override.permissionMode !== undefined ? { permissionMode: override.permissionMode } : {}),
    ...(override.skillIds !== undefined ? { skillIds: override.skillIds } : {}),
    ...(mergedCommandPermissions ? { commandPermissions: mergedCommandPermissions } : {}),
  };
}

/**
 * CLI Command handler for manifest generation
 */
export class ManifestGeneratorCLICommand {
  private generator: ManifestGenerator;

  constructor() {
    this.generator = new ManifestGenerator();
  }

  /**
   * Fetch task data from local storage
   */
  async fetchTask(taskId: string): Promise<TaskInput> {
    await storage.initialize();
    const task = storage.getTask(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found in local storage (~/.maestro/data/tasks/)`);
    }

    // Ensure acceptanceCriteria has at least one item
    let acceptanceCriteria = task.acceptanceCriteria || [];
    if (acceptanceCriteria.length === 0) {
      acceptanceCriteria = [DEFAULT_ACCEPTANCE_CRITERIA];
    }

    // Convert timestamp to ISO string
    const createdAt = typeof task.createdAt === 'number'
      ? new Date(task.createdAt).toISOString()
      : String(task.createdAt);

    // Resolve absolute paths for attached images
    const dataDir = process.env.DATA_DIR
      ? (process.env.DATA_DIR.startsWith('~') ? join(homedir(), process.env.DATA_DIR.slice(1)) : process.env.DATA_DIR)
      : join(homedir(), '.maestro', 'data');

    const images = (task.images || []).map((img) => {
      const ext = extname(img.filename) || `.${img.mimeType.split('/')[1] || 'png'}`;
      const path = join(dataDir, 'images', task.projectId, task.id, `${img.id}${ext}`);
      return { path, filename: img.filename, mimeType: img.mimeType };
    });

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria,
      projectId: task.projectId,
      createdAt,
      parentId: task.parentId,
      dependencies: task.dependencies,
      priority: task.priority as any,
      metadata: task.metadata,
      ...(images.length > 0 && { images }),
    };
  }

  /**
   * Fetch project data from local storage
   */
  async fetchProject(projectId: string): Promise<{ workingDir: string }> {
    await storage.initialize();
    const project = storage.getProject(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} not found in local storage (~/.maestro/data/projects/)`);
    }

    return {
      workingDir: project.workingDir,
    };
  }

  /**
   * Execute the CLI command
   */
  async execute(options: {
    mode: AgentModeInput;
    projectId: string;
    taskIds: string[];
    skills?: string[];
    output: string;
    model?: string;
    agentTool?: AgentTool;
    referenceTaskIds?: string[];
    teamMemberIds?: string[];
    teamMemberId?: string;
  }): Promise<void> {
    try {
      // 1. Fetch ALL tasks
      const tasks: TaskInput[] = [];
      for (const taskId of options.taskIds) {
        const task = await this.fetchTask(taskId);
        tasks.push(task);
      }

      // 2. Fetch project
      const project = await this.fetchProject(options.projectId);

      // 3. Resolve model from CLI option (set by team member via server) or default to 'sonnet'
      // Track whether the model was explicitly set vs defaulted, so team member overrides can take precedence
      const hasExplicitModel = !!options.model;
      const resolvedModel = options.model || 'sonnet';

      // 4. Build session options
      const sessionOptions: SessionOptions = {
        model: resolvedModel,
        permissionMode: 'acceptEdits',
        thinkingMode: 'auto',
        workingDirectory: project.workingDir,
        context: {
          custom: {
            taskIds: options.taskIds,
          },
        },
      };
      const memberOverrides = parseMemberOverrides(process.env.MAESTRO_MEMBER_OVERRIDES);

      // 4. Generate manifest with all tasks
      const manifest = this.generator.generateManifest(
        options.mode,
        tasks,
        sessionOptions
      );

      // Add coordinator session ID from environment and normalize mode
      const coordinatorSessionId = process.env.MAESTRO_COORDINATOR_SESSION_ID;
      if (coordinatorSessionId) {
        manifest.coordinatorSessionId = coordinatorSessionId;
        // Auto-derive coordinated mode when spawned by a coordinator.
        manifest.mode = normalizeMode(manifest.mode as AgentModeInput, true);
      }

      // Add initial directive from environment (passed via spawn flow)
      const initialDirectiveEnv = process.env.MAESTRO_INITIAL_DIRECTIVE;
      if (initialDirectiveEnv) {
        try {
          manifest.initialDirective = JSON.parse(initialDirectiveEnv);
        } catch {
          // ignore parse error
        }
      }

      // If this is a master session, fetch all projects and embed in manifest
      if (process.env.MAESTRO_IS_MASTER === 'true') {
        manifest.isMaster = true;
        try {
          const projectsData: any = await api.get('/api/master/projects');
          const projects: MasterProjectInfo[] = Array.isArray(projectsData)
            ? projectsData.map((p: any) => ({
                id: p.id,
                name: p.name,
                workingDir: p.workingDir,
                ...(p.description ? { description: p.description } : {}),
                ...(p.isMaster ? { isMaster: p.isMaster } : {}),
              }))
            : [];
          if (projects.length > 0) {
            manifest.masterProjects = projects;
          }
        } catch {
          // non-fatal: master context will be partial
        }
      }

      // Add skills to manifest root
      manifest.skills = options.skills || ['maestro-worker'];

      // Add agent tool to manifest (if specified)
      if (options.agentTool) {
        manifest.agentTool = options.agentTool;
      }

      // Add reference task IDs to manifest (if specified)
      if (options.referenceTaskIds && options.referenceTaskIds.length > 0) {
        manifest.referenceTaskIds = options.referenceTaskIds;
      }

      // Add team member identity for this session
      // Multi-identity: if teamMemberIds (array) is provided, build profiles array
      const effectiveTeamMemberIds = resolveSelfIdentityMemberIds(
        manifest.mode,
        options.teamMemberId,
        options.teamMemberIds,
      );

      if (effectiveTeamMemberIds.length === 1 && !options.teamMemberIds?.length) {
        // Single team member — backward compat: use singular fields
        try {
          const teamMemberRaw: any = await api.get(`/api/team-members/${effectiveTeamMemberIds[0]}?projectId=${options.projectId}`);
          const teamMember = applyMemberOverride(teamMemberRaw, memberOverrides[effectiveTeamMemberIds[0]]);
          manifest.teamMemberId = teamMember.id;
          manifest.teamMemberName = teamMember.name;
          manifest.teamMemberAvatar = teamMember.avatar;
          manifest.teamMemberIdentity = teamMember.identity;
          if (teamMember.memory && teamMember.memory.length > 0) {
            manifest.teamMemberMemory = teamMember.memory;
          }
          if (teamMember.capabilities) {
            manifest.teamMemberCapabilities = teamMember.capabilities;
          }
          if (teamMember.commandPermissions) {
            manifest.teamMemberCommandPermissions = teamMember.commandPermissions;
          }
          if (teamMember.permissionMode) {
            manifest.session.permissionMode = teamMember.permissionMode;
          }
          // Override model with team member's model (if not explicitly set by launch settings)
          if (teamMember.model && !hasExplicitModel) {
            manifest.session.model = teamMember.model;
          }
        } catch {
          // ignore team member load error
        }
      } else if (effectiveTeamMemberIds.length > 0) {
        // Multi-identity: fetch all and build profiles array
        const profiles: TeamMemberProfile[] = [];
        const MODEL_POWER: Record<string, number> = { 'opus[1m]': 4, 'opus': 3, 'sonnet[1m]': 2.5, 'sonnet': 2, 'haiku': 1 };
        let highestModelPower = 0;
        let resolvedModelFromProfiles: string | undefined;
        let resolvedAgentToolFromProfiles: AgentTool | undefined;
        let resolvedPermissionModeFromProfiles: string | undefined;

        for (const memberId of effectiveTeamMemberIds) {
          try {
            const tmRaw: any = await api.get(`/api/team-members/${memberId}?projectId=${options.projectId}`);
            const tm = applyMemberOverride(tmRaw, memberOverrides[memberId]);
            profiles.push({
              id: tm.id,
              name: tm.name,
              avatar: tm.avatar,
              identity: tm.identity,
              capabilities: tm.capabilities,
              commandPermissions: tm.commandPermissions,
              model: tm.model,
              agentTool: tm.agentTool,
              memory: tm.memory,
            });

            // Resolve model: most powerful wins
            const power = MODEL_POWER[tm.model || ''] || 0;
            if (power > highestModelPower) {
              highestModelPower = power;
              resolvedModelFromProfiles = tm.model;
            }

            // Resolve agentTool: first non-default wins
            if (!resolvedAgentToolFromProfiles && tm.agentTool) {
              resolvedAgentToolFromProfiles = tm.agentTool;
            }

            // Resolve permissionMode: first non-null wins
            if (!resolvedPermissionModeFromProfiles && tm.permissionMode) {
              resolvedPermissionModeFromProfiles = tm.permissionMode;
            }

          } catch {
            // ignore team member load error
          }
        }

        if (profiles.length > 0) {
          manifest.teamMemberProfiles = profiles;

          // Override model with most powerful from profiles (if not explicitly set by launch settings)
          if (resolvedModelFromProfiles && !hasExplicitModel) {
            manifest.session.model = resolvedModelFromProfiles;
          }

          // Override agentTool from profiles (if not already set)
          if (resolvedAgentToolFromProfiles && !options.agentTool) {
            manifest.agentTool = resolvedAgentToolFromProfiles;
          }

          // Override permissionMode from profiles (first member's setting wins)
          if (resolvedPermissionModeFromProfiles) {
            manifest.session.permissionMode = resolvedPermissionModeFromProfiles as any;
          }

          // Merge capabilities: union (if any member allows, it's allowed)
          const mergedCapabilities: Record<string, boolean> = {};
          for (const profile of profiles) {
            if (profile.capabilities) {
              for (const [key, value] of Object.entries(profile.capabilities)) {
                if (value) mergedCapabilities[key] = true;
                else if (!(key in mergedCapabilities)) mergedCapabilities[key] = false;
              }
            }
          }
          if (Object.keys(mergedCapabilities).length > 0) {
            manifest.teamMemberCapabilities = mergedCapabilities;
          }

          // Merge command permissions: union (most permissive)
          const mergedGroups: Record<string, boolean> = {};
          const mergedCommands: Record<string, boolean> = {};
          for (const profile of profiles) {
            if (profile.commandPermissions?.groups) {
              for (const [key, value] of Object.entries(profile.commandPermissions.groups)) {
                if (value) mergedGroups[key] = true;
                else if (!(key in mergedGroups)) mergedGroups[key] = false;
              }
            }
            if (profile.commandPermissions?.commands) {
              for (const [key, value] of Object.entries(profile.commandPermissions.commands)) {
                if (value) mergedCommands[key] = true;
                else if (!(key in mergedCommands)) mergedCommands[key] = false;
              }
            }
          }
          if (Object.keys(mergedGroups).length > 0 || Object.keys(mergedCommands).length > 0) {
            manifest.teamMemberCommandPermissions = {
              ...(Object.keys(mergedGroups).length > 0 ? { groups: mergedGroups } : {}),
              ...(Object.keys(mergedCommands).length > 0 ? { commands: mergedCommands } : {}),
            };
          }
        }
      }

      // Add team members to manifest (if specified, typically for coordinate mode)
      if (options.teamMemberIds && options.teamMemberIds.length > 0) {
        const teamMembers: TeamMemberData[] = [];
        for (const memberId of options.teamMemberIds) {
          try {
            // Fetch team member from new API instead of task storage
            const teamMemberRaw: any = await api.get(`/api/team-members/${memberId}?projectId=${options.projectId}`);
            const teamMember = applyMemberOverride(teamMemberRaw, memberOverrides[memberId]);
            teamMembers.push({
              id: teamMember.id,
              name: teamMember.name,
              role: teamMember.role || 'worker',
              identity: teamMember.identity || `You are ${teamMember.name}. ${teamMember.role || 'A team member.'}`,
              avatar: teamMember.avatar || '🤖',
              mode: teamMember.mode,
              permissionMode: teamMember.permissionMode,
              skillIds: teamMember.skillIds,
              model: teamMember.model,
              agentTool: teamMember.agentTool,
              capabilities: teamMember.capabilities,
              commandPermissions: teamMember.commandPermissions,
              memory: teamMember.memory,
            });
          } catch {
            // ignore team member load error
          }
        }
        if (teamMembers.length > 0) {
          manifest.availableTeamMembers = teamMembers;
        }
      }

      // Session-level permissionMode override (highest precedence, overrides per-member settings)
      const envPermissionMode = process.env.MAESTRO_PERMISSION_MODE;
      if (envPermissionMode && ['acceptEdits', 'interactive', 'readOnly', 'bypassPermissions'].includes(envPermissionMode)) {
        manifest.session.permissionMode = envPermissionMode as SessionOptions['permissionMode'];
      }

      // 5. Validate manifest
      const validationResult = this.generator.validateGeneratedManifest(manifest);
      if (!validationResult) {
        const result = validateManifest(manifest);
        throw new Error(`Generated manifest failed validation: ${result.errors || 'Unknown error'}`);
      }

      // 6. Save to file with skills included

      // Ensure output directory exists
      const outputDir = dirname(options.output);
      await mkdir(outputDir, { recursive: true });

      const json = this.generator.serializeManifest(manifest);
      await writeFile(options.output, json, 'utf-8');

      process.exit(0);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error || 'Manifest generation failed');
      if (message) {
        console.error(message);
      }
      if (process.env.MAESTRO_DEBUG === 'true' && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

/**
 * ManifestGenerator - Generate manifest files from task data
 *
 * Creates valid manifest files that can be used to spawn Claude sessions.
 */
export class ManifestGenerator {
  /**
   * Generate a manifest from task data
   *
   * @param mode - Agent mode (canonical modes plus legacy aliases accepted)
   * @param tasksData - Array of task information (supports multi-task sessions)
   * @param options - Session configuration
   * @returns Generated manifest
   */
  generateManifest(
    mode: AgentModeInput,
    tasksData: TaskInput | TaskInput[],
    options: SessionOptions
  ): MaestroManifest {
    // Ensure tasksData is an array
    const tasks = Array.isArray(tasksData) ? tasksData : [tasksData];

    // Map tasks to TaskData format
    const taskDataArray = tasks.map(taskData => ({
      id: taskData.id,
      title: taskData.title,
      description: taskData.description,
      acceptanceCriteria: taskData.acceptanceCriteria,
      projectId: taskData.projectId,
      createdAt: taskData.createdAt,
      ...(taskData.parentId !== undefined && { parentId: taskData.parentId }),
      ...(taskData.dependencies && { dependencies: taskData.dependencies }),
      ...(taskData.priority && { priority: taskData.priority }),
      ...(taskData.metadata && { metadata: taskData.metadata }),
      ...(taskData.images && taskData.images.length > 0 && { images: taskData.images }),
    }));

    const manifest: MaestroManifest = {
      manifestVersion: '1.0',
      mode: normalizeMode(mode, false),
      tasks: taskDataArray,
      session: {
        model: options.model,
        permissionMode: options.permissionMode,
        ...(options.thinkingMode && { thinkingMode: options.thinkingMode }),
        ...(options.maxTurns && { maxTurns: options.maxTurns }),
        ...(options.timeout && { timeout: options.timeout }),
        ...(options.workingDirectory && { workingDirectory: options.workingDirectory }),
      },
      ...(options.context && { context: options.context }),
    };

    return manifest;
  }

  /**
   * Generate manifest from API task data
   *
   * @param taskId - Task ID to fetch from API
   * @param options - Session configuration
   * @returns Generated manifest
   */
  async generateFromApi(
    taskId: string,
    options: SessionOptions
  ): Promise<MaestroManifest> {
    // This would fetch task data from the API
    // For now, just placeholder
    throw new Error('generateFromApi not yet implemented - use generateManifest instead');
  }

  /**
   * Serialize manifest to JSON
   *
   * @param manifest - The manifest to serialize
   * @returns JSON string
   */
  serializeManifest(manifest: MaestroManifest): string {
    return JSON.stringify(manifest, null, 2);
  }

  /**
   * Validate a generated manifest
   *
   * @param manifest - The manifest to validate
   * @returns true if valid
   */
  validateGeneratedManifest(manifest: MaestroManifest): boolean {
    const result = validateManifest(manifest);
    return result.valid;
  }

  /**
   * Generate and save manifest to file
   *
   * @param mode - Agent mode
   * @param taskData - Task information
   * @param options - Session configuration
   * @param outputPath - File path to save manifest
   */
  async generateAndSave(
    mode: AgentModeInput,
    taskData: TaskInput,
    options: SessionOptions,
    outputPath: string
  ): Promise<void> {
    const manifest = this.generateManifest(mode, taskData, options);

    // Validate before saving
    if (!this.validateGeneratedManifest(manifest)) {
      throw new Error('Generated manifest is invalid');
    }

    const json = this.serializeManifest(manifest);

    // Save to file
    await writeFile(outputPath, json, 'utf-8');
  }
}

/**
 * Register manifest commands with Commander
 */
export function registerManifestCommands(program: any): void {
  const manifest = program.command('manifest').description('Manifest generation commands');

  manifest
    .command('generate')
    .description('Generate a manifest file from task and project data')
    .requiredOption('--mode <mode>', 'Agent mode (worker, coordinator, coordinated-worker, coordinated-coordinator, or legacy execute/coordinate)')
    .requiredOption('--project-id <id>', 'Project ID')
    .requiredOption('--task-ids <ids>', 'Comma-separated task IDs')
    .option('--skills <skills>', 'Comma-separated skills', 'maestro-worker')
    .option('--model <model>', 'Model to use (e.g. sonnet, sonnet[1m], opus[1m], gpt-5.3-codex, gemini-3-pro-preview)', 'sonnet')
    .option('--agent-tool <tool>', 'Agent tool to use (claude-code, codex, or gemini)', 'claude-code')
    .option('--reference-task-ids <ids>', 'Comma-separated reference task IDs for context')
    .option('--team-member-id <id>', 'Team member ID for this session')
    .option('--team-member-ids <ids>', 'Comma-separated team member IDs (for coordinate mode)')
    .requiredOption('--output <path>', 'Output file path')
    .action(async (options: any) => {
      // Parse comma-separated values
      const taskIds = options.taskIds.split(',').map((id: string) => id.trim());
      const skills = options.skills.split(',').map((skill: string) => skill.trim());

      // Validate mode (accept both new and legacy values)
      const validModes = ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'];
      if (!validModes.includes(options.mode)) {
        console.error(`Invalid mode: ${options.mode}. Must be one of: ${validModes.join(', ')}`);
        process.exit(1);
      }

      // Validate agent tool
      const validTools = ['claude-code', 'codex', 'gemini'];
      if (options.agentTool && !validTools.includes(options.agentTool)) {
        process.exit(1);
      }

      // Parse reference task IDs if provided
      const referenceTaskIds = options.referenceTaskIds
        ? options.referenceTaskIds.split(',').map((id: string) => id.trim()).filter(Boolean)
        : undefined;

      // Parse team member IDs if provided
      const teamMemberIds = options.teamMemberIds
        ? options.teamMemberIds.split(',').map((id: string) => id.trim()).filter(Boolean)
        : undefined;

      // Create and execute command (reads from local storage, no API needed)
      const command = new ManifestGeneratorCLICommand();
      await command.execute({
        mode: options.mode,
        projectId: options.projectId,
        taskIds,
        skills,
        output: options.output,
        model: options.model,
        agentTool: options.agentTool !== 'claude-code' ? options.agentTool : undefined,
        referenceTaskIds,
        teamMemberId: options.teamMemberId,
        teamMemberIds,
      });
    });
}
