import type {
  MaestroManifest,
  AdditionalContext,
  AgentTool,
  AgentModeInput,
  TeamMemberData,
  TeamMemberProfile,
  MasterProjectInfo,
  AgentMode,
  LaunchConfig,
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
  launchConfig?: LaunchConfig;
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
  launchConfig?: LaunchConfig;
  agentTool?: AgentTool;
  model?: string;
  reasoningEffort?: LaunchConfig['reasoningEffort'];
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

function agentToolForProvider(provider: LaunchConfig['provider']): AgentTool {
  switch (provider) {
    case 'claude':
      return 'claude-code';
    case 'openai':
      return 'codex';
    case 'hermes':
      return 'hermes';
    case 'gemini':
      return 'gemini';
  }
}

function permissionModeForAccessMode(accessMode?: LaunchConfig['accessMode']): MemberPermissionMode | undefined {
  switch (accessMode) {
    case 'fullAccess':
      return 'bypassPermissions';
    case 'acceptEdits':
      return 'acceptEdits';
    case 'plan':
      return 'readOnly';
    case 'safe':
      return 'interactive';
    default:
      return undefined;
  }
}

function accessModeForPermissionMode(permissionMode?: string): LaunchConfig['accessMode'] | undefined {
  switch (permissionMode) {
    case 'bypassPermissions':
      return 'fullAccess';
    case 'acceptEdits':
      return 'acceptEdits';
    case 'readOnly':
      return 'plan';
    case 'interactive':
      return 'safe';
    default:
      return undefined;
  }
}

function providerForAgentTool(agentTool?: AgentTool): LaunchConfig['provider'] {
  switch (agentTool) {
    case 'codex':
      return 'openai';
    case 'hermes':
      return 'hermes';
    case 'gemini':
      return 'gemini';
    case 'claude-code':
    default:
      return 'claude';
  }
}

// Infer the provider a model belongs to from its name. Model names are
// provider-specific, so the model is authoritative for choosing the tool —
// this prevents a Claude model from being launched on Codex. Mirrors
// providerForModel() in maestro-server/src/api/sessionRoutes.ts.
function providerForModel(model?: string): LaunchConfig['provider'] | undefined {
  if (!model) return undefined;
  const m = model.toLowerCase();
  if (m.startsWith('claude') || m.startsWith('opus') || m.startsWith('sonnet') || m.startsWith('haiku')) {
    return 'claude';
  }
  if (m.startsWith('gpt') || /^o\d/.test(m)) {
    return 'openai';
  }
  if (m.startsWith('gemini')) {
    return 'gemini';
  }
  if (m.startsWith('hermes')) {
    return 'hermes';
  }
  return undefined;
}

function getValidReasoningEfforts(provider: LaunchConfig['provider']): LaunchConfig['reasoningEffort'][] {
  switch (provider) {
    case 'claude':
      return ['low', 'medium', 'high', 'xhigh', 'max'];
    case 'openai':
      return ['minimal', 'low', 'medium', 'high', 'xhigh'];
    default:
      return [];
  }
}

function supportsLaunchSpeed(provider: LaunchConfig['provider'], model?: string): boolean {
  return provider === 'openai' && (model === 'gpt-5.5' || model === 'gpt-5.4');
}

function defaultModelForAgentTool(agentTool: AgentTool): string {
  switch (agentTool) {
    case 'codex':
      return 'gpt-5.5';
    case 'hermes':
      return 'hermes-default';
    case 'gemini':
      return 'gemini-2.5-pro';
    case 'claude-code':
    default:
      return 'claude-opus-4-8';
  }
}

function sanitizeLaunchConfig(config?: LaunchConfig | null): LaunchConfig | undefined {
  if (!config?.provider || !config.model) return undefined;
  if (!['claude', 'openai', 'hermes', 'gemini'].includes(config.provider)) return undefined;

  const validReasoning = getValidReasoningEfforts(config.provider);
  const reasoningEffort = config.reasoningEffort && validReasoning.includes(config.reasoningEffort)
    ? config.reasoningEffort
    : undefined;
  const speed = config.speed && supportsLaunchSpeed(config.provider, config.model)
    ? config.speed
    : undefined;
  const accessMode = config.accessMode && ['safe', 'acceptEdits', 'plan', 'fullAccess'].includes(config.accessMode)
    ? config.accessMode
    : undefined;

  return {
    provider: config.provider,
    model: config.model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(speed ? { speed } : {}),
    ...(accessMode ? { accessMode } : {}),
  };
}

function launchConfigFromLegacy(
  agentTool?: AgentTool,
  model?: string,
  reasoningEffort?: LaunchConfig['reasoningEffort'],
  permissionMode?: string,
): LaunchConfig | undefined {
  // Default to claude-code when only a model or only a permissionMode is supplied,
  // so a permissionMode-only legacy override still yields a launchConfig (carrying
  // its accessMode) instead of being silently dropped.
  const tool = agentTool || (model ? 'claude-code' : undefined) || (permissionMode ? 'claude-code' : undefined);
  if (!tool) return undefined;
  return sanitizeLaunchConfig({
    // Model name is authoritative for provider inference (mirrors the server),
    // falling back to the agentTool only when the model is unrecognized.
    provider: providerForModel(model) || providerForAgentTool(tool),
    model: model || defaultModelForAgentTool(tool),
    reasoningEffort,
    accessMode: accessModeForPermissionMode(permissionMode),
  });
}

function parseLaunchConfig(raw: string | undefined): LaunchConfig | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') {
      return undefined;
    }
    if (!['claude', 'openai', 'hermes', 'gemini'].includes(parsed.provider)) {
      return undefined;
    }
    return sanitizeLaunchConfig({
      provider: parsed.provider as LaunchConfig['provider'],
      model: parsed.model,
      ...(typeof parsed.reasoningEffort === 'string' ? { reasoningEffort: parsed.reasoningEffort as LaunchConfig['reasoningEffort'] } : {}),
      ...(typeof parsed.speed === 'string' ? { speed: parsed.speed as LaunchConfig['speed'] } : {}),
      ...(typeof parsed.accessMode === 'string' ? { accessMode: parsed.accessMode as LaunchConfig['accessMode'] } : {}),
    });
  } catch {
    return undefined;
  }
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

      const launchConfig = isRecord(value.launchConfig)
        ? parseLaunchConfig(JSON.stringify(value.launchConfig))
        : launchConfigFromLegacy(
            typeof value.agentTool === 'string' ? value.agentTool as AgentTool : undefined,
            typeof value.model === 'string' ? value.model : undefined,
            typeof value.reasoningEffort === 'string' ? value.reasoningEffort as LaunchConfig['reasoningEffort'] : undefined,
            typeof value.permissionMode === 'string' ? value.permissionMode : undefined,
          );
      const override: MemberLaunchOverride = {
        ...(launchConfig ? { launchConfig } : {}),
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
    ...(override.launchConfig !== undefined ? {
      agentTool: agentToolForProvider(override.launchConfig.provider),
      model: override.launchConfig.model,
      ...(permissionModeForAccessMode(override.launchConfig.accessMode) ? { permissionMode: permissionModeForAccessMode(override.launchConfig.accessMode) } : {}),
    } : {}),
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
    agentTool?: AgentTool;
    launchConfig?: LaunchConfig;
    referenceTaskIds?: string[];
    teamMemberIds?: string[];
    teamMemberId?: string;
    teamId?: string;
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

      const hasExplicitModel = !!options.launchConfig;
      const resolvedModel = options.launchConfig?.model || 'sonnet';

      // 4. Build session options
      const sessionOptions: SessionOptions = {
        model: resolvedModel,
        permissionMode: 'acceptEdits',
        thinkingMode: 'auto',
        workingDirectory: project.workingDir,
        ...(options.launchConfig ? { launchConfig: options.launchConfig } : {}),
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

      // Add agent tool to manifest (if specified). When an agentTool is given
      // without a launchConfig, derive a coherent launchConfig from it so the
      // spawner resolves the correct model instead of falling through to the
      // bare manifest.session.model default (which can yield a removed model
      // string for non-Claude tools, e.g. 'sonnet' -> a stale Codex model).
      if (options.agentTool && !options.launchConfig) {
        manifest.agentTool = options.agentTool;
        const derivedLaunchConfig = launchConfigFromLegacy(options.agentTool, undefined, undefined, undefined);
        if (derivedLaunchConfig) {
          manifest.launchConfig = derivedLaunchConfig;
          manifest.session.launchConfig = derivedLaunchConfig;
        }
      }
      if (options.launchConfig) {
        manifest.launchConfig = options.launchConfig;
        manifest.session.launchConfig = options.launchConfig;
        manifest.agentTool = agentToolForProvider(options.launchConfig.provider);
        manifest.session.permissionMode = permissionModeForAccessMode(options.launchConfig.accessMode) || manifest.session.permissionMode;
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
        const MODEL_POWER: Record<string, number> = {
          'claude-fable-5[1m]': 6.1,
          'claude-fable-5': 6.0,
          'claude-opus-4-8[1m]': 5.9,
          'claude-opus-4-8': 5.8,
          'gpt-5.5': 5.5,
          'claude-opus-4-7[1m]': 5.2,
          'claude-opus-4-7': 5,
          'gpt-5.4': 4.7,
          'opus[1m]': 4.5,
          'gpt-5.3-codex': 4.2,
          'opus': 4,
          'gpt-5.2-codex': 3.8,
          'sonnet[1m]': 3,
          'gpt-5.1-codex-max': 2.8,
          'sonnet': 2.5,
          'gpt-5.1-codex': 2.3,
          'gpt-5-codex': 2,
          'gpt-5.1-codex-mini': 1.8,
          'gpt-5-codex-mini': 1.5,
          'haiku': 1,
        };
        // Winning member: the most-powerful model wins, and model + agentTool +
        // permissionMode are all taken from that SAME member so they stay coherent.
        // Resolving these independently previously let the model come from one
        // member (e.g. claude-opus-4-8) and the tool from another (e.g. codex),
        // producing a Claude model launched on Codex. Mirrors the server collapse.
        let highestModelPower = -1;
        let hasWinner = false;
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

            const power = tm.model ? (MODEL_POWER[tm.model] || 0) : -1;
            if (!hasWinner || power > highestModelPower) {
              hasWinner = true;
              highestModelPower = power;
              resolvedModelFromProfiles = tm.model;
              resolvedAgentToolFromProfiles = tm.agentTool;
              resolvedPermissionModeFromProfiles = tm.permissionMode;
            }

          } catch {
            // ignore team member load error
          }
        }

        if (profiles.length > 0) {
          manifest.teamMemberProfiles = profiles;

          // The launchConfig (per-task badge override OR the server-resolved
          // config) is authoritative: it already paired model + tool coherently.
          // Only fall back to the profile collapse when no launchConfig was given.
          if (!options.launchConfig) {
            if (resolvedModelFromProfiles && !hasExplicitModel) {
              manifest.session.model = resolvedModelFromProfiles;
            }

            // Derive the tool from the winning model so a Claude model can never
            // launch on Codex; fall back to the member's own agentTool.
            const collapsedProvider = providerForModel(resolvedModelFromProfiles)
              || providerForAgentTool(resolvedAgentToolFromProfiles);
            if (!options.agentTool) {
              manifest.agentTool = agentToolForProvider(collapsedProvider);
            }

            if (resolvedPermissionModeFromProfiles) {
              manifest.session.permissionMode = resolvedPermissionModeFromProfiles as any;
            }
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

      // Recursive team structure: when this coordinator session is bound to a saved
      // team, fetch the resolved tree so the leader can route work by expertise and
      // spawn sub-team leaders as sub-coordinators.
      if (options.teamId && isCoordinatorMode(manifest.mode)) {
        try {
          const tree: any = await api.get(
            `/api/teams/${options.teamId}/tree?projectId=${options.projectId}`
          );
          if (tree && tree.id) {
            manifest.teamStructure = tree;

            // If no explicit delegation roster was provided, derive a flat discovery
            // roster from every member in the tree so prompt rendering still works.
            if (!manifest.availableTeamMembers || manifest.availableTeamMembers.length === 0) {
              const flat: TeamMemberData[] = [];
              const seen = new Set<string>();
              const walk = (node: any) => {
                for (const m of node.members || []) {
                  if (seen.has(m.id)) continue;
                  seen.add(m.id);
                  flat.push({
                    id: m.id,
                    name: m.name,
                    role: m.role || 'worker',
                    identity: m.identity || `You are ${m.name}. ${m.role || 'A team member.'}`,
                    avatar: m.avatar || '🤖',
                    mode: m.mode,
                  });
                }
                for (const sub of node.subTeams || []) walk(sub);
              };
              walk(tree);
              if (flat.length > 0) {
                manifest.availableTeamMembers = flat;
              }
            }
          }
        } catch {
          // Non-fatal: coordinator proceeds with flat roster if the tree can't be fetched.
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
        ...(options.launchConfig && { launchConfig: options.launchConfig }),
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
    .option('--launch-config <json>', 'Canonical launch config JSON: provider, model, reasoningEffort, speed, accessMode')
    .option('--agent-tool <tool>', 'Agent tool to use (claude-code, codex, hermes, or gemini)', 'claude-code')
    .option('--model <model>', 'Legacy model override; converted to canonical launch config')
    .option('--reasoning-effort <effort>', 'Legacy reasoning effort override; converted to canonical launch config')
    .option('--permission-mode <mode>', 'Legacy permission mode override; converted to canonical launch config')
    .option('--reference-task-ids <ids>', 'Comma-separated reference task IDs for context')
    .option('--team-member-id <id>', 'Team member ID for this session')
    .option('--team-member-ids <ids>', 'Comma-separated team member IDs (for coordinate mode)')
    .option('--team-id <id>', 'Saved team ID for recursive team structure (coordinator mode)')
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
      const validTools = ['claude-code', 'codex', 'hermes', 'gemini'];
      if (options.agentTool && !validTools.includes(options.agentTool)) {
        process.exit(1);
      }

      const hasLegacyLaunchOverride = !!options.model || !!options.reasoningEffort || !!options.permissionMode || options.agentTool !== 'claude-code';
      const launchConfig = parseLaunchConfig(options.launchConfig)
        || (hasLegacyLaunchOverride
          ? launchConfigFromLegacy(options.agentTool, options.model, options.reasoningEffort, options.permissionMode)
          : undefined);
      if (options.launchConfig && !launchConfig) {
        console.error('Invalid launch config JSON');
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
        launchConfig,
        agentTool: options.agentTool !== 'claude-code' ? options.agentTool : undefined,
        referenceTaskIds,
        teamMemberId: options.teamMemberId,
        teamMemberIds,
        teamId: options.teamId,
      });
    });
}
