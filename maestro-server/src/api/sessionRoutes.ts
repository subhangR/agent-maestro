import express, { Request, Response } from 'express';
import { z } from 'zod';
import { spawn as spawnProcess } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, resolve as resolvePath, delimiter as pathDelimiter } from 'path';
import { homedir, platform } from 'os';
import { randomUUID } from 'crypto';
import { SessionService } from '../application/services/SessionService';
import { PtyHostService } from '../application/services/PtyHostService';
import { SessionPromptService } from '../application/services/SessionPromptService';
import { HuddleService } from '../application/services/HuddleService';
import { CommandUsageService } from '../application/services/CommandUsageService';
import { GitService } from '../application/services/GitService';
import { LogDigestService } from '../application/services/LogDigestService';
import { TeamService } from '../application/services/TeamService';
import { IProjectRepository } from '../domain/repositories/IProjectRepository';
import { ITaskRepository } from '../domain/repositories/ITaskRepository';
import { IEventBus } from '../domain/events/IEventBus';
import { Config } from '../infrastructure/config';
import { AppError } from '../domain/common/Errors';
import { SessionStatus, AgentTool, AgentMode, TeamMember, TeamMemberSnapshot, MemberLaunchOverride, LaunchConfig, isCoordinatorMode, normalizeMode } from '../types';
import { ITeamMemberRepository } from '../domain/repositories/ITeamMemberRepository';
import { IModelProfileRepository } from '../domain/repositories/IModelProfileRepository';
import { SessionFilter } from '../domain/repositories/ISessionRepository';
import { handleRouteError } from './middleware/errorHandler';
import {
  validateBody,
  validateParams,
  validateQuery,
  createSessionSchema,
  updateSessionSchema,
  sessionEventSchema,
  sessionTimelineSchema,
  listSessionsQuerySchema,
  spawnSessionSchema,
  modeBodySchema,
  idParamSchema,
  idAndTaskIdParamSchema,
  idAndModalIdParamSchema,
  paginationQuerySchema,
  extractPagination,
  paginate,
  updateDocContentSchema,
  sendSessionPromptSchema,
} from './validation';

function resolveMaestroCliRuntime(cliPathOverride?: string): { maestroBin: string; monorepoRoot: string | null } {
  const isPkg = __dirname.startsWith('/snapshot');
  if (cliPathOverride && cliPathOverride !== 'maestro') {
    return { maestroBin: cliPathOverride, monorepoRoot: null };
  }
  if (!isPkg) {
    const monorepoRoot = resolvePath(__dirname, '..', '..', '..');
    // On Windows, node_modules/.bin contains .exe/.cmd shims, not bare names.
    // Use the CLI entry point directly via node to avoid extension issues.
    const maestroBin = platform() === 'win32'
      ? join(monorepoRoot, 'maestro-cli', 'bin', 'maestro.js')
      : join(monorepoRoot, 'node_modules', '.bin', 'maestro');
    return { maestroBin, monorepoRoot };
  }
  return { maestroBin: 'maestro', monorepoRoot: null };
}

function getNodeRuntimePathEntries(monorepoRoot: string | null): string[] {
  const entries = [
    monorepoRoot ? join(monorepoRoot, 'node_modules', '.bin') : null,
    join(homedir(), '.bun', 'bin'),
    join(homedir(), '.local', 'bin'),
    join(homedir(), 'bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].filter((entry): entry is string => !!entry);

  const nvmVersionsDir = join(homedir(), '.nvm', 'versions', 'node');
  if (existsSync(nvmVersionsDir)) {
    try {
      const nodeBins = readdirSync(nvmVersionsDir)
        .sort()
        .reverse()
        .map((version) => join(nvmVersionsDir, version, 'bin'))
        .filter((entry) => existsSync(entry));
      entries.push(...nodeBins);
    } catch {
      // Ignore unreadable nvm directories; common system paths above are enough for most installs.
    }
  }

  return entries.filter((entry, index) => entries.indexOf(entry) === index);
}

function buildRuntimePath(pathValue: string | undefined, monorepoRoot: string | null): string | undefined {
  const inherited = (pathValue || '').split(pathDelimiter).filter(Boolean);
  const entries = [...getNodeRuntimePathEntries(monorepoRoot), ...inherited];
  const unique = entries.filter((entry, index) => entries.indexOf(entry) === index);
  return unique.length > 0 ? unique.join(pathDelimiter) : pathValue;
}

/**
 * Generate manifest via CLI command
 */
async function generateManifestViaCLI(options: {
  mode: AgentMode;
  projectId: string;
  taskIds: string[];
  skills: string[];
  sessionId: string;
  launchConfig?: LaunchConfig;
  agentTool?: AgentTool;
  referenceTaskIds?: string[];
  teamMemberIds?: string[];
  teamMemberId?: string;
  teamId?: string;
  serverUrl?: string;
  initialDirective?: { subject: string; message: string; fromSessionId?: string };
  coordinatorSessionId?: string;
  isMaster?: boolean;
  memberOverrides?: Record<string, MemberLaunchOverride>;
  permissionMode?: string;
  delegatePermissionMode?: string;
  sessionDir?: string;
  cliPathOverride?: string;
}): Promise<{ manifestPath: string; manifest: any }> {
  const { mode, projectId, taskIds, skills, sessionId, launchConfig, agentTool, referenceTaskIds, teamMemberIds, teamMemberId, teamId, serverUrl, initialDirective, memberOverrides, cliPathOverride } = options;

  const resolvedSessionDir = options.sessionDir ?? join(homedir(), '.maestro', 'sessions');
  const maestroDir = join(resolvedSessionDir, sessionId);
  await mkdir(maestroDir, { recursive: true });

  const manifestPath = join(maestroDir, 'manifest.json');

  const args = [
    'manifest', 'generate',
    '--mode', mode,
    '--project-id', projectId,
    '--task-ids', taskIds.join(','),
    '--skills', skills.join(','),
    '--output', manifestPath,
    ...(launchConfig ? ['--launch-config', JSON.stringify(launchConfig)] : []),
    ...(agentTool && agentTool !== 'claude-code' ? ['--agent-tool', agentTool] : []),
    ...(referenceTaskIds && referenceTaskIds.length > 0 ? ['--reference-task-ids', referenceTaskIds.join(',')] : []),
    ...(teamMemberIds && teamMemberIds.length > 0 ? ['--team-member-ids', teamMemberIds.join(',')] : []),
    ...(teamMemberId ? ['--team-member-id', teamMemberId] : []),
    ...(teamId ? ['--team-id', teamId] : []),
  ];

  const { maestroBin, monorepoRoot } = resolveMaestroCliRuntime(cliPathOverride);

  const spawnEnv: Record<string, string | undefined> = { ...process.env };
  // Ensure CLI subprocess can reach the server API (CLI reads MAESTRO_SERVER_URL, not SERVER_URL)
  if (serverUrl) {
    spawnEnv.MAESTRO_SERVER_URL = serverUrl;
  }
  const runtimePath = buildRuntimePath(spawnEnv.PATH, monorepoRoot);
  if (runtimePath) {
    spawnEnv.PATH = runtimePath;
  }

  // Pass initial directive as env var for manifest generation
  if (initialDirective) {
    spawnEnv.MAESTRO_INITIAL_DIRECTIVE = JSON.stringify(initialDirective);
  }

  if (options.coordinatorSessionId) {
    spawnEnv.MAESTRO_COORDINATOR_SESSION_ID = options.coordinatorSessionId;
  }

  if (options.isMaster) {
    spawnEnv.MAESTRO_IS_MASTER = 'true';
  }

  if (memberOverrides && Object.keys(memberOverrides).length > 0) {
    spawnEnv.MAESTRO_MEMBER_OVERRIDES = JSON.stringify(memberOverrides);
  }

  if (options.permissionMode) {
    spawnEnv.MAESTRO_PERMISSION_MODE = options.permissionMode;
  }
  if (options.delegatePermissionMode) {
    spawnEnv.MAESTRO_DELEGATE_PERMISSION_MODE = options.delegatePermissionMode;
  }

  const MANIFEST_TIMEOUT_MS = 60_000;
  const MAX_OUTPUT_BYTES = 10 * 1024;

  return new Promise((resolve, reject) => {
    // On Unix: raise file descriptor limit before spawning to prevent "low max
    // file descriptors" errors from Claude Code (macOS default of 2560 is too
    // low). On Windows: spawn the binary directly (ulimit doesn't exist).
    const isWindows = platform() === 'win32';
    const child = isWindows
      ? spawnProcess(process.execPath, [maestroBin, ...args], {
          cwd: homedir(),
          stdio: ['ignore', 'pipe', 'pipe'],
          env: spawnEnv as NodeJS.ProcessEnv,
        })
      : spawnProcess(
          '/bin/sh',
          ['-c', 'ulimit -n 2147483646 2>/dev/null; exec "$@"', 'sh', maestroBin, ...args],
          {
            cwd: homedir(),
            stdio: ['ignore', 'pipe', 'pipe'],
            env: spawnEnv as NodeJS.ProcessEnv,
          },
        );

    let stdout = '';
    let stderr = '';

    // Cap stdout/stderr to prevent unbounded string growth
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_BYTES) stdout = stdout.slice(-MAX_OUTPUT_BYTES);
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_BYTES) stderr = stderr.slice(-MAX_OUTPUT_BYTES);
    });

    // Timeout: kill the process. On Windows child.kill() sends TerminateProcess;
    // on Unix we try SIGTERM first, then SIGKILL as a fallback.
    const killTimer = setTimeout(() => {
      if (isWindows) {
        child.kill();
      } else {
        child.kill('SIGTERM');
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
      }
    }, MANIFEST_TIMEOUT_MS);

    child.on('exit', async (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        try {
          const manifestContent = await readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          resolve({ manifestPath, manifest });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          reject(new Error(`Failed to read manifest: ${msg}`));
        }
      } else {
        if (stderr.includes('command not found') || stderr.includes('ENOENT')) {
          reject(new Error(`maestro CLI not found. Please install maestro: npm install -g maestro-cli`));
        } else {
          reject(new Error(`Manifest generation failed (exit code ${code}): ${stderr}`));
        }
      }
    });

    child.on('error', (error) => {
      clearTimeout(killTimer);
      reject(new Error(`Failed to spawn maestro CLI: ${error.message}`));
    });
  });
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

function permissionModeForAccessMode(accessMode?: LaunchConfig['accessMode']): 'acceptEdits' | 'interactive' | 'readOnly' | 'bypassPermissions' | undefined {
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
// provider-specific, so the model the user picked is authoritative for
// choosing the tool — this prevents launching a Claude model on Codex.
// Returns undefined when the name does not clearly map to a provider.
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
  const validProviders: LaunchConfig['provider'][] = ['claude', 'openai', 'hermes', 'gemini'];
  if (!validProviders.includes(config.provider)) return undefined;

  const validReasoning = getValidReasoningEfforts(config.provider);
  const reasoningEffort = config.reasoningEffort && validReasoning.includes(config.reasoningEffort)
    ? config.reasoningEffort
    : undefined;
  const speed = config.speed && supportsLaunchSpeed(config.provider, config.model)
    ? config.speed
    : undefined;
  const validAccessModes: LaunchConfig['accessMode'][] = ['safe', 'acceptEdits', 'plan', 'fullAccess'];
  const accessMode = config.accessMode && validAccessModes.includes(config.accessMode)
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
  const tool = agentTool || (model ? 'claude-code' : undefined);
  if (!tool) return undefined;

  return sanitizeLaunchConfig({
    // The model name is authoritative for provider inference (consistent with the
    // team-member collapse path); fall back to the agentTool only when the model
    // name does not clearly map to a provider. Prevents e.g. a gpt-* model that
    // carries no explicit agentTool from being launched as Claude.
    provider: providerForModel(model) || providerForAgentTool(tool),
    model: model || defaultModelForAgentTool(tool),
    reasoningEffort,
    accessMode: accessModeForPermissionMode(permissionMode),
  });
}

function normalizeMemberLaunchOverrides(memberOverrides: unknown): Record<string, MemberLaunchOverride> | undefined {
  if (!memberOverrides || typeof memberOverrides !== 'object' || Array.isArray(memberOverrides)) return undefined;

  const normalized: Record<string, MemberLaunchOverride> = {};
  for (const [memberId, value] of Object.entries(memberOverrides as Record<string, MemberLaunchOverride>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

    const sanitized = sanitizeLaunchConfig(value.launchConfig);
    // When a (partially migrated) override carries a launchConfig without an
    // accessMode but still has a legacy permissionMode, fold the permissionMode
    // into the launchConfig so it is not silently dropped.
    const launchConfig = sanitized
      ? (!sanitized.accessMode && value.permissionMode
          ? { ...sanitized, accessMode: accessModeForPermissionMode(value.permissionMode) }
          : sanitized)
      : launchConfigFromLegacy(value.agentTool, value.model, value.reasoningEffort, value.permissionMode);
    const override: MemberLaunchOverride = {
      ...(launchConfig ? { launchConfig } : {}),
      ...(Array.isArray(value.skillIds) ? { skillIds: value.skillIds } : {}),
      ...(value.commandPermissions ? { commandPermissions: value.commandPermissions } : {}),
    };

    if (Object.keys(override).length > 0) {
      normalized[memberId] = override;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

type ModeRelation = 'standalone' | 'coordinated';
type ModeRole = 'worker' | 'coordinator';

function splitMode(mode: AgentMode): { relation: ModeRelation; role: ModeRole } {
  switch (mode) {
    case 'coordinator': return { relation: 'standalone', role: 'coordinator' };
    case 'coordinated-worker': return { relation: 'coordinated', role: 'worker' };
    case 'coordinated-coordinator': return { relation: 'coordinated', role: 'coordinator' };
    case 'worker':
    default: return { relation: 'standalone', role: 'worker' };
  }
}

function combineMode(relation: ModeRelation, role: ModeRole): AgentMode {
  if (relation === 'standalone' && role === 'coordinator') return 'coordinator';
  if (relation === 'coordinated' && role === 'worker') return 'coordinated-worker';
  if (relation === 'coordinated' && role === 'coordinator') return 'coordinated-coordinator';
  return 'worker';
}

interface SessionRouteDependencies {
  sessionService: SessionService;
  sessionPromptService: SessionPromptService;
  huddleService: HuddleService;
  commandUsageService: CommandUsageService;
  logDigestService: LogDigestService;
  teamService: TeamService;
  projectRepo: IProjectRepository;
  taskRepo: ITaskRepository;
  teamMemberRepo: ITeamMemberRepository;
  modelProfileRepo: IModelProfileRepository;
  eventBus: IEventBus;
  config: Config;
  ptyHostService: PtyHostService;
}

/**
 * Create session routes using the SessionService.
 */
export function createSessionRoutes(deps: SessionRouteDependencies) {
  const { sessionService, sessionPromptService, huddleService, commandUsageService, logDigestService, teamService, projectRepo, taskRepo, teamMemberRepo, modelProfileRepo, eventBus, config, ptyHostService } = deps;
  const gitService = new GitService();
  const router = express.Router();

  // Clamp a browser-reported terminal dimension from an UNVALIDATED body (the
  // resume route has no body schema). Mirrors ptyDimensionSchema; returns
  // undefined for anything out of range so spawn falls back to its default.
  const clampPtyDim = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1000 ? v : undefined;

  // DEV ONLY: spawn a raw interactive shell PTY for browser-streaming tests,
  // bypassing the manifest/CLI pipeline. Gated to server-hosted PTY mode and
  // intended for the local, trusted-network POC only (no auth).
  router.post('/dev/pty-test', async (req: Request, res: Response) => {
    if (config.ptyHost !== 'server') {
      return res.status(403).json({
        error: true,
        code: 'pty_host_not_server',
        message: 'Server-hosted PTY is disabled. Start with MAESTRO_PTY_HOST=server.',
      });
    }
    const shell = process.env.SHELL || '/bin/bash';
    const sessionId = 'devpty-' + randomUUID().slice(0, 8);
    const cwd = typeof req.body?.cwd === 'string' ? req.body.cwd : homedir();
    try {
      ptyHostService.spawn({
        sessionId,
        command: `${shell} -i`,
        cwd,
        env: { ...process.env } as Record<string, string>,
        cols: 80,
        rows: 24,
      });
      return res.status(201).json({ sessionId });
    } catch (err) {
      return res.status(500).json({
        error: true,
        code: 'pty_spawn_failed',
        message: err instanceof Error ? err.message : 'Failed to spawn dev PTY',
      });
    }
  });

  // Explicitly terminate a server-hosted PTY for a session. This is the ONLY
  // user-initiated path that kills a server PTY (besides spawn-replace and
  // server shutdown). Closing a /pty WebSocket — tab close, reload, device
  // switch — only detaches a subscriber and leaves the process running, so the
  // UI must call this when the user explicitly stops/closes a session.
  router.post('/sessions/:id/pty/stop', validateParams(idParamSchema), async (req: Request, res: Response) => {
    if (config.ptyHost !== 'server') {
      return res.status(403).json({
        error: true,
        code: 'pty_host_not_server',
        message: 'Server-hosted PTY is disabled. Start with MAESTRO_PTY_HOST=server.',
      });
    }
    const id = req.params.id as string;
    try {
      ptyHostService.kill(id);
      await sessionService.updateSession(id, { status: 'stopped' });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({
        error: true,
        code: 'pty_stop_failed',
        message: err instanceof Error ? err.message : 'Failed to stop server PTY',
      });
    }
  });

  // Summary DTO for list views — strips env, events, timeline, metadata
  function toSessionSummary(session: any): Record<string, any> {
    return {
      id: session.id,
      name: session.name,
      status: session.status,
      projectId: session.projectId,
      taskIds: session.taskIds,
      parentSessionId: session.parentSessionId,
      rootSessionId: session.rootSessionId,
      teamSessionId: session.teamSessionId,
      teamMemberIds: session.teamMemberIds,
      teamMemberSnapshots: session.teamMemberSnapshots,
      teamMemberSnapshot: session.teamMemberSnapshot,
      teamMemberId: session.teamMemberId,
      isMasterSession: session.isMasterSession,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      // Persisted human-intent lifecycle stamps drive the Open/Done/Archived tab.
      // They MUST be in the summary DTO, or a list refetch wipes them from the
      // store and archived/done sessions snap back to the Open tab.
      humanCompletedAt: session.humanCompletedAt,
      archivedAt: session.archivedAt,
    };
  }

  const resolveSenderName = (session: any): string => {
    const fromPrimarySnapshot = session?.teamMemberSnapshot?.name;
    const fromMultiSnapshot = Array.isArray(session?.teamMemberSnapshots) ? session.teamMemberSnapshots[0]?.name : undefined;
    const fromMetadataSnapshot = session?.metadata?.teamMemberSnapshot?.name;
    const fromMetadata = session?.metadata?.teamMemberName;
    const fromSessionName = session?.name;
    return String(
      fromPrimarySnapshot ||
      fromMultiSnapshot ||
      fromMetadataSnapshot ||
      fromMetadata ||
      fromSessionName ||
      'Unknown'
    ).trim();
  };

  const prependSenderIdentity = (content: string, senderName: string, senderSessionId: string): string => {
    const prefix = `[From: ${senderName} (${senderSessionId})]`;
    const trimmedLeading = content.trimStart();
    if (trimmedLeading.startsWith(prefix)) {
      return content;
    }
    return `${prefix} ${content}`;
  };

  // Create session
  router.post('/sessions', validateBody(createSessionSchema), async (req: Request, res: Response) => {
    try {
      // Backward compatibility: convert taskId to taskIds
      if (req.body.taskId && !req.body.taskIds) {
        req.body.taskIds = [req.body.taskId];
      }

      if (!req.body.taskIds) {
        return res.status(400).json({
          error: true,
          message: 'taskIds is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const session = await sessionService.createSession(req.body);
      res.status(201).json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // List sessions
  // Helper: enrich session with team member snapshots if missing
  async function enrichSessionWithSnapshots(session: any, teamMemberMapOverride?: Map<string, any>): Promise<any> {
    if (session.teamMemberSnapshots?.length > 0 || session.teamMemberSnapshot) return session;
    const meta = session.metadata;
    if (!meta) return session;
    const tmIds: string[] = meta.teamMemberIds?.length > 0
      ? meta.teamMemberIds
      : (meta.teamMemberId ? [meta.teamMemberId] : []);
    if (tmIds.length === 0) return session;

    let resolveTeamMember: (id: string) => any | undefined;
    if (teamMemberMapOverride) {
      resolveTeamMember = (id) => teamMemberMapOverride.get(id);
    } else {
      // Fallback: batch fetch for this project
      const allMembers = await teamMemberRepo.findByProjectId(session.projectId);
      const localMap = new Map(allMembers.map((m: any) => [m.id, m]));
      resolveTeamMember = (id) => localMap.get(id);
    }

    const snapshots: TeamMemberSnapshot[] = [];
    for (const tmId of tmIds) {
      const tm = resolveTeamMember(tmId);
      if (tm) {
        snapshots.push({ name: tm.name, avatar: tm.avatar, role: tm.role, model: tm.model, agentTool: tm.agentTool });
      }
    }
    if (snapshots.length === 0) return session;
    // Return a shallow clone to avoid mutating the repository's in-memory cache
    const enriched = { ...session, teamMemberIds: tmIds, teamMemberSnapshots: snapshots };
    if (tmIds.length === 1) {
      enriched.teamMemberId = tmIds[0];
      enriched.teamMemberSnapshot = snapshots[0];
    }
    return enriched;
  }

  router.get('/sessions', validateQuery(listSessionsQuerySchema.merge(paginationQuerySchema)), async (req: Request, res: Response) => {
    try {
      const filter: SessionFilter = {};

      if (req.query.projectId) {
        filter.projectId = req.query.projectId as string;
      }
      if (req.query.taskId) {
        filter.taskId = req.query.taskId as string;
      }
      if (req.query.parentSessionId) {
        filter.parentSessionId = req.query.parentSessionId as string;
      }
      if (req.query.rootSessionId) {
        filter.rootSessionId = req.query.rootSessionId as string;
      }
      if (req.query.teamSessionId) {
        filter.teamSessionId = req.query.teamSessionId as string;
      }

      let sessions = await sessionService.listSessions(filter);

      if (req.query.status) {
        const statuses = (req.query.status as string).split(',').map(s => s.trim()).filter(Boolean) as SessionStatus[];
        if (statuses.length > 0) {
          sessions = sessions.filter(s => statuses.includes(s.status));
        }
      }

      if (req.query.active === 'true') {
        sessions = sessions.filter(s => (['spawning', 'idle', 'working'] as SessionStatus[]).includes(s.status));
      }

      // Preload team members for all projects in the result set
      const projectIds = [...new Set(sessions.map((s) => s.projectId).filter(Boolean))];
      const teamMembersByProject = new Map<string, Map<string, any>>();
      await Promise.all(
        projectIds.map(async (pid) => {
          const members = await teamMemberRepo.findByProjectId(pid);
          teamMembersByProject.set(pid, new Map(members.map((m: any) => [m.id, m])));
        })
      );

      // Enrich sessions with team member snapshots
      const enrichedSessions = await Promise.all(
        sessions.map((s) => enrichSessionWithSnapshots(s, teamMembersByProject.get(s.projectId)))
      );

      // Return summary DTOs by default, full objects when ?fields=full
      const result = req.query.fields === 'full'
        ? enrichedSessions
        : enrichedSessions.map(toSessionSummary);

      if (req.query.limit || req.query.offset) {
        res.json(paginate(result, extractPagination(req.query)));
      } else {
        res.json(result);
      }
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Log digests — multi-session (coordinator reads all worker logs)
  router.get('/sessions/log-digests', async (req: Request, res: Response) => {
    try {
      const parentSessionId = req.query.parentSessionId as string | undefined;
      const sessionIds = req.query.sessionIds as string | undefined;
      const last = parseInt(req.query.last as string || '5', 10);
      const maxLength = req.query.maxLength !== undefined ? parseInt(req.query.maxLength as string, 10) : undefined;

      if (parentSessionId) {
        const digests = await logDigestService.getWorkerDigests(parentSessionId, { last, maxLength });
        return res.json(digests);
      }

      if (sessionIds) {
        const ids = sessionIds.split(',').map(s => s.trim()).filter(Boolean);
        const digests = await logDigestService.getDigests(ids, { last, maxLength });
        return res.json(digests);
      }

      return res.json([]);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Log digest — single session
  router.get('/sessions/:id/log-digest', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const last = parseInt(req.query.last as string || '5', 10);
      const maxLength = req.query.maxLength !== undefined ? parseInt(req.query.maxLength as string, 10) : undefined;
      const digest = await logDigestService.getDigest(sessionId, { last, maxLength });
      res.json(digest);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Session stats — token totals, message/tool counts, last N messages.
  // Reads the full JSONL transcript (bounded), so this is heavier than the
  // tail-only log-digest endpoint.
  router.get('/sessions/:id/stats', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const lastMessagesRaw = req.query.lastMessages as string | undefined;
      const lastMessages = lastMessagesRaw !== undefined
        ? Math.max(0, Math.min(50, parseInt(lastMessagesRaw, 10) || 10))
        : 10;
      const stats = await logDigestService.getSessionStats(sessionId, { lastMessages });
      res.json(stats);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get session by ID
  router.get('/sessions/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = await sessionService.getSession(id);
      const enrichedSession = await enrichSessionWithSnapshots(session);
      res.json(enrichedSession);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get session mode
  router.get('/sessions/:id/mode', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = await sessionService.getSession(id);
      const mode: AgentMode = (session.metadata?.mode as AgentMode) || 'worker';
      const { relation, role } = splitMode(mode);
      res.json({ id, mode, relation, role });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Regenerate the on-disk manifest.json for an existing session under a new mode.
  // `coordinator enable`/`disable` flips server-side metadata.mode, but the CLI's
  // capability layer (guardCommand, `maestro commands`, capability flags) reads the
  // frozen spawn-time manifest — so without this the agent keeps seeing the old
  // role's permissions and never gains coordinator commands like `session spawn`.
  // Coordinated modes require coordinatorSessionId or the CLI normalizer rejects
  // the manifest, so it's threaded through from the session's parent linkage.
  async function regenerateManifestForMode(session: any, mode: AgentMode): Promise<string> {
    const project = await projectRepo.findById(session.projectId);
    const storedLaunchConfig = session.metadata?.launchConfig
      ? sanitizeLaunchConfig(session.metadata.launchConfig as LaunchConfig)
      : undefined;
    const resolvedModel: string | undefined = storedLaunchConfig?.model || session.metadata?.model || undefined;
    const agentTool: AgentTool = session.metadata?.agentTool || 'claude-code';
    const coordinatorSessionId: string | undefined =
      session.parentSessionId || session.env?.MAESTRO_COORDINATOR_SESSION_ID || undefined;

    const tasks = await Promise.all(session.taskIds.map((taskId: string) => taskRepo.findById(taskId)));
    const referenceTaskIds: string[] = [];
    for (const task of tasks) {
      if (task?.referenceTaskIds) {
        for (const refId of task.referenceTaskIds) {
          if (!referenceTaskIds.includes(refId)) referenceTaskIds.push(refId);
        }
      }
    }
    await taskRepo.flush();

    const result = await generateManifestViaCLI({
      mode,
      projectId: session.projectId,
      taskIds: session.taskIds,
      skills: session.metadata?.skills || [],
      sessionId: session.id,
      launchConfig: storedLaunchConfig
        ?? (resolvedModel
          ? sanitizeLaunchConfig({
              provider: providerForModel(resolvedModel) || providerForAgentTool(agentTool),
              model: resolvedModel,
            })
          : undefined),
      agentTool,
      referenceTaskIds: referenceTaskIds.length > 0 ? referenceTaskIds : undefined,
      teamMemberIds: session.metadata?.teamMemberIds || undefined,
      teamMemberId: session.metadata?.teamMemberId || undefined,
      teamId: session.teamId || undefined,
      permissionMode: (session.metadata?.permissionMode as string | undefined) || undefined,
      coordinatorSessionId,
      serverUrl: config.serverUrl,
      isMaster: project?.isMaster === true,
      sessionDir: config.sessionDir,
      cliPathOverride: config.manifestGenerator.cliPath,
    });
    return result.manifestPath;
  }

  // Change session mode (role only — relation is immutable)
  router.post('/sessions/:id/mode', validateParams(idParamSchema), validateBody(modeBodySchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const callerSessionId = req.headers['x-session-id'] as string | undefined;

      if (!callerSessionId || callerSessionId !== id) {
        return res.status(403).json({
          error: true,
          code: 'mode_self_only',
          message: 'You can only flip your own role',
        });
      }

      const session = await sessionService.getSession(id);
      const currentMode: AgentMode = (session.metadata?.mode as AgentMode) || 'worker';
      const { relation } = splitMode(currentMode);
      const newMode = combineMode(relation, req.body.role);

      if (newMode === currentMode) {
        return res.json({ id, mode: currentMode, previousMode: currentMode, changed: false });
      }

      const { previousMode } = await sessionService.changeMode(id, newMode);

      // Refresh the on-disk manifest so the CLI's capability layer reflects the
      // new role immediately. Non-fatal: a stale manifest still leaves the
      // server-side spawn gate (which reads live metadata.mode) working.
      let manifestRegenerated = false;
      try {
        const manifestPath = await regenerateManifestForMode(session, newMode);
        if (session.env?.MAESTRO_MANIFEST_PATH && session.env.MAESTRO_MANIFEST_PATH !== manifestPath) {
          await sessionService.updateSession(id, {
            env: { ...session.env, MAESTRO_MANIFEST_PATH: manifestPath },
          });
        }
        manifestRegenerated = true;
      } catch (regenErr) {
        console.warn('[mode] Failed to regenerate manifest after mode change:', regenErr instanceof Error ? regenErr.message : regenErr);
      }

      await eventBus.emit('session:mode_changed', {
        sessionId: id,
        mode: newMode,
        previousMode,
        changed: true,
        timestamp: Date.now(),
      });

      res.json({ id, mode: newMode, previousMode, changed: true, manifestRegenerated });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Update session
  router.patch('/sessions/:id', validateParams(idParamSchema), validateBody(updateSessionSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = await sessionService.updateSession(id, req.body);
      res.json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Delete session
  router.delete('/sessions/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await sessionService.deleteSession(id);
      res.json({ success: true, id });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Add event to session
  router.post('/sessions/:id/events', validateParams(idParamSchema), validateBody(sessionEventSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { type, data } = req.body;

      if (!type) {
        return res.status(400).json({
          error: true,
          message: 'type is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const session = await sessionService.addEventToSession(sessionId, { type, data });
      res.json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Add timeline event to session
  router.post('/sessions/:id/timeline', validateParams(idParamSchema), validateBody(sessionTimelineSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { type = 'progress', message, taskId, metadata } = req.body;

      if (!message) {
        return res.status(400).json({
          error: true,
          message: 'message is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const session = await sessionService.addTimelineEvent(
        sessionId,
        type,
        message,
        taskId,
        metadata
      );
      res.json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Add doc to session
  router.post('/sessions/:id/docs', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { title, filePath, content, taskId, kind } = req.body;

      if (!title) {
        return res.status(400).json({
          error: true,
          message: 'title is required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!filePath) {
        return res.status(400).json({
          error: true,
          message: 'filePath is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const session = await sessionService.addDoc(
        sessionId,
        title,
        filePath,
        content,
        taskId,
        kind,
      );
      res.json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get docs for a session (content hydrated from files on demand)
  router.get('/sessions/:id/docs', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const docs = await sessionService.getSessionDocsWithContent(sessionId);
      res.json(docs);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Re-save diagram scene JSON (or any doc content)
  router.put('/sessions/:id/docs/:docId/content',
    validateParams(z.object({ id: z.string(), docId: z.string() })),
    validateBody(updateDocContentSchema),
    async (req: Request, res: Response) => {
      try {
        const sessionId = req.params.id as string;
        const docId = req.params.docId as string;
        const { content } = req.body as { content: string };

        const updated = await sessionService.updateDocContent(sessionId, docId, content);
        if (!updated) {
          return res.status(404).json({ error: true, message: 'Doc not found', code: 'NOT_FOUND' });
        }
        res.json({ success: true });
      } catch (err: unknown) {
        handleRouteError(err, res);
      }
    }
  );

  // Add task to session
  router.post('/sessions/:id/tasks/:taskId', validateParams(idAndTaskIdParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const taskId = req.params.taskId as string;
      await sessionService.addTaskToSession(sessionId, taskId);
      const session = await sessionService.getSession(sessionId);
      res.json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Remove task from session
  router.delete('/sessions/:id/tasks/:taskId', validateParams(idAndTaskIdParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const taskId = req.params.taskId as string;
      await sessionService.removeTaskFromSession(sessionId, taskId);
      const session = await sessionService.getSession(sessionId);
      res.json(session);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Show modal in UI (agent-generated HTML content)
  router.post('/sessions/:id/modal', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { modalId, title, html, filePath } = req.body;

      if (!modalId) {
        return res.status(400).json({
          error: true,
          message: 'modalId is required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!html) {
        return res.status(400).json({
          error: true,
          message: 'html content is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Verify session exists
      await sessionService.getSession(sessionId);

      // Store modal reference in modals directory
      const modalsDir = join(config.dataDir, 'modals');
      await mkdir(modalsDir, { recursive: true });
      const modalFilePath = join(modalsDir, `${modalId}.html`);
      await writeFile(modalFilePath, html, 'utf-8');

      // Emit WebSocket event to UI
      const modalEvent = {
        sessionId,
        modalId,
        title: title || 'Agent Modal',
        html,
        filePath: filePath || modalFilePath,
        timestamp: Date.now(),
      };

      await eventBus.emit('session:modal', modalEvent);

      res.json({
        success: true,
        modalId,
        sessionId,
        message: 'Modal sent to UI',
      });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Receive user action from a modal (forwarded by UI)
  router.post('/sessions/:id/modal/:modalId/actions', validateParams(idAndModalIdParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const modalId = req.params.modalId as string;
      const { action, data } = req.body;

      if (!action) {
        return res.status(400).json({
          error: true,
          message: 'action is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Emit WebSocket event so the agent CLI can receive it
      const actionEvent = {
        sessionId,
        modalId,
        action,
        data: data || {},
        timestamp: Date.now(),
      };

      await eventBus.emit('session:modal_action', actionEvent);

      res.json({ success: true, modalId, action });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Modal closed by user (forwarded by UI)
  router.post('/sessions/:id/modal/:modalId/close', validateParams(idAndModalIdParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const modalId = req.params.modalId as string;

      await eventBus.emit('session:modal_closed', {
        sessionId,
        modalId,
        timestamp: Date.now(),
      });

      res.json({ success: true, modalId });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Send a prompt to a session's terminal
  router.post('/sessions/:id/prompt', validateParams(idParamSchema), validateBody(sendSessionPromptSchema), async (req: Request, res: Response) => {
    try {
      const { content, mode, senderSessionId } = req.body as { content: string; mode: 'send' | 'paste'; senderSessionId: string };

      const sessionId = req.params.id as string;
      const [session, senderSession] = await Promise.all([
        sessionService.getSession(sessionId),
        sessionService.getSession(senderSessionId),
      ]);

      if (!senderSession) {
        return res.status(404).json({
          error: true,
          code: 'sender_not_found',
          message: `Sender session ${senderSessionId} not found.`,
        });
      }
      if (!session) {
        return res.status(404).json({
          error: true,
          code: 'target_not_found',
          message: `Target session ${sessionId} not found.`,
        });
      }
      if (senderSession.id === session.id) {
        return res.status(400).json({
          error: true,
          code: 'self_prompt_not_allowed',
          message: 'A session cannot prompt itself.',
        });
      }

      const senderName = resolveSenderName(senderSession);
      const contentWithSender = prependSenderIdentity(content, senderName, senderSessionId);

      await eventBus.emit('session:prompt_send', {
        sessionId,
        content: contentWithSender,
        mode,
        senderSessionId,
        senderProjectId: senderSession.projectId ?? null,
        targetProjectId: session.projectId ?? null,
        timestamp: Date.now(),
      });

      await sessionService.addTimelineEvent(
        sessionId,
        'prompt_received',
        `Received prompt from session ${senderSessionId}: "${contentWithSender.substring(0, 100)}${contentWithSender.length > 100 ? '...' : ''}"`,
        undefined,
        { senderSessionId, mode }
      );

      // Persist a durable, cross-project record with CLEAN content (no [From:] prefix).
      // This is one edge in the Huddle graph. Best-effort: a failure here must not
      // break terminal injection, which already succeeded above.
      try {
        await sessionPromptService.record({
          fromSessionId: senderSessionId,
          toSessionId: sessionId,
          content,
          mode,
        });
      } catch (recordErr) {
        console.warn('Failed to record session prompt:', (recordErr as Error).message);
      }

      res.json({ success: true });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get all session prompts where this session is sender or receiver
  router.get('/sessions/:id/prompts', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const prompts = await sessionPromptService.getForSession(sessionId);
      res.json(prompts);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get tracked maestro CLI command usage (commands, exit codes, failures) for this session
  router.get('/sessions/:id/command-usage', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const usage = await commandUsageService.getForSession(sessionId);
      res.json(usage);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get every session prompt across all projects (the full Huddle edge set)
  router.get('/session-prompts', async (_req: Request, res: Response) => {
    try {
      const prompts = await sessionPromptService.getAll();
      res.json(prompts);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Get all Huddles: connected components over the session-prompt graph
  // (cross-project, all-time). Sorted by lastActivity desc.
  router.get('/huddles', async (_req: Request, res: Response) => {
    try {
      const huddles = await huddleService.computeHuddles();
      res.json(huddles);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Inject a diagram (PNG + .excalidraw) from the UI into a session's working directory,
  // then send a prompt referencing both file paths. No senderSessionId required since
  // this is a UI-initiated action (not a session-to-session message).
  router.post('/sessions/:id/inject-diagram', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { pngBase64, sceneJson, name = 'diagram' } = req.body;

      if (!pngBase64 || typeof pngBase64 !== 'string') {
        return res.status(400).json({ error: 'pngBase64 is required and must be a string' });
      }
      if (!sceneJson || typeof sceneJson !== 'string') {
        return res.status(400).json({ error: 'sceneJson is required and must be a string' });
      }

      const session = await sessionService.getSession(sessionId);
      const project = await projectRepo.findById(session.projectId);
      if (!project) {
        return res.status(404).json({ error: true, code: 'project_not_found', message: 'Project not found' });
      }

      const diagDir = join(project.workingDir, '.maestro', 'diagrams');
      await mkdir(diagDir, { recursive: true });

      const ts = Date.now();
      const safeName = String(name).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'diagram';
      const pngPath = join(diagDir, `${safeName}_${ts}.png`);
      const excalidrawPath = join(diagDir, `${safeName}_${ts}.excalidraw`);

      await writeFile(pngPath, Buffer.from(pngBase64, 'base64'));
      await writeFile(excalidrawPath, sceneJson, 'utf-8');

      const content = [
        `[Diagram from UI whiteboard]`,
        `A diagram has been exported and saved for you to review.`,
        ``,
        `PNG (view): ${pngPath}`,
        `Excalidraw (edit): ${excalidrawPath}`,
      ].join('\n');

      await eventBus.emit('session:prompt_send', {
        sessionId,
        content,
        mode: 'send',
        senderSessionId: 'ui',
        senderProjectId: null,
        targetProjectId: session.projectId ?? null,
        timestamp: Date.now(),
      });

      await sessionService.addTimelineEvent(
        sessionId,
        'progress',
        `Diagram injected from UI: ${pngPath}`,
        undefined,
        { pngPath, excalidrawPath }
      );

      res.json({ success: true, pngPath, excalidrawPath });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  // Spawn session (complex endpoint - uses CLI for manifest generation)
  router.post('/sessions/spawn', validateBody(spawnSessionSchema), async (req: Request, res: Response) => {
    try {
      // SPAWN GATE: when a session spawns another session, the sender must be a
      // coordinator-role session. UI-initiated spawns (spawnSource === 'ui') are
      // user-driven and have no sender session, so they bypass this gate.
      const senderSessionId = req.headers['x-session-id'] as string | undefined;
      const isSessionSpawn = req.body?.spawnSource === 'session';
      let senderSession: any = null;

      if (isSessionSpawn) {
        if (!senderSessionId) {
          return res.status(400).json({
            error: true,
            code: 'sender_session_required',
            message: 'X-Session-Id required',
          });
        }

        try {
          senderSession = await sessionService.getSession(senderSessionId);
        } catch {
          return res.status(400).json({
            error: true,
            code: 'sender_session_not_found',
            message: `Sender session ${senderSessionId} not found`,
          });
        }

        const senderMode: AgentMode = (senderSession.metadata?.mode as AgentMode) || 'worker';
        const senderRole = isCoordinatorMode(senderMode) ? 'coordinator' : 'worker';
        if (senderRole !== 'coordinator') {
          return res.status(403).json({
            error: true,
            code: 'spawn_requires_coordinator',
            message: 'Spawning requires coordinator mode. Run `maestro coordinator enable` first.',
          });
        }
      } else if (senderSessionId) {
        // Best-effort resolve so the projectId fallback below still works when a
        // session id is supplied on a non-session spawn; never gates the request.
        try {
          senderSession = await sessionService.getSession(senderSessionId);
        } catch {
          senderSession = null;
        }
      }

      const {
        projectId: bodyProjectId,
        taskIds,
        sessionName,
        skills,
        sessionId,              // Parent session ID when spawnSource === 'session'
        spawnSource = 'ui',     // 'ui' or 'session'
        mode: requestedMode,    // Four-mode model: worker, coordinator, coordinated-worker, coordinated-coordinator
        context,
        teamMemberIds,          // Multiple team member identities for this session
        delegateTeamMemberIds,  // Team member IDs for coordination delegation pool
        teamMemberId,           // Single team member assigned to this task (backward compat)
        teamId: requestedTeamId, // Saved team this session belongs to (recursive team launch)
        launchConfig: rawRequestedLaunchConfig, // Canonical launch override for this run
        agentTool: legacyRequestedAgentTool,
        model: legacyRequestedModel,
        reasoningEffort: legacyRequestedReasoningEffort,
        initialDirective,                // { subject, message, fromSessionId } for guaranteed delivery
        memberOverrides,                 // Per-member launch overrides: Record<string, MemberLaunchOverride>
        permissionMode: rawRequestedPermissionMode,           // Session-level permission mode override
        delegatePermissionMode: requestedDelegatePermissionMode, // Permission mode for spawned workers
        useWorktree: requestedUseWorktree,  // Spawn in an isolated git worktree
      } = req.body;

      const requestedLaunchConfig = sanitizeLaunchConfig(rawRequestedLaunchConfig)
        || launchConfigFromLegacy(legacyRequestedAgentTool, legacyRequestedModel, legacyRequestedReasoningEffort, rawRequestedPermissionMode);

      const requestedPermissionMode =
        permissionModeForAccessMode(requestedLaunchConfig?.accessMode) || rawRequestedPermissionMode;

      let normalizedMemberOverrides = normalizeMemberLaunchOverrides(memberOverrides);

      const requestedModeInput = String(requestedMode || 'worker');
      const requestedCoordinatorMode =
        requestedModeInput === 'coordinator' ||
        requestedModeInput === 'coordinated-coordinator' ||
        requestedModeInput === 'coordinate';

      // Resolve identity/self + delegation as separate concepts for coordinator modes.
      let effectiveTeamMemberIds: string[] = [];
      let effectiveDelegateTeamMemberIds: string[] = [];

      if (requestedCoordinatorMode) {
        if (teamMemberId) {
          effectiveTeamMemberIds = [teamMemberId];
        } else if (teamMemberIds && teamMemberIds.length > 0) {
          // Backward compat: old payloads overloaded teamMemberIds; deterministic first is self.
          effectiveTeamMemberIds = [teamMemberIds[0]];
        }

        if (delegateTeamMemberIds && delegateTeamMemberIds.length > 0) {
          effectiveDelegateTeamMemberIds = delegateTeamMemberIds;
        } else if (teamMemberIds && teamMemberIds.length > 0) {
          // Backward compat:
          // - if explicit self exists, treat teamMemberIds as delegate roster
          // - otherwise, consume remainder after deterministic self
          effectiveDelegateTeamMemberIds = teamMemberId ? teamMemberIds : teamMemberIds.slice(1);
        }
      } else {
        effectiveTeamMemberIds = teamMemberIds && teamMemberIds.length > 0
          ? teamMemberIds
          : (teamMemberId ? [teamMemberId] : []);
      }

      // Resolve projectId: use body value or default to sender's project
      const projectId: string = bodyProjectId || senderSession?.projectId;

      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({
          error: true,
          code: 'invalid_task_ids',
          message: 'taskIds must be a non-empty array'
        });
      }

      if (spawnSource !== 'ui' && spawnSource !== 'session') {
        return res.status(400).json({
          error: true,
          code: 'invalid_spawn_source',
          message: 'spawnSource must be "ui" or "session"'
        });
      }

      let parentSession: any | null = null;

      // Validate sessionId when spawnSource === 'session'
      if (spawnSource === 'session') {
        if (!sessionId) {
          return res.status(400).json({
            error: true,
            code: 'missing_session_id',
            message: 'sessionId is required when spawnSource is "session"'
          });
        }

        // Verify parent session exists
        try {
          parentSession = await sessionService.getSession(sessionId);
          if (!parentSession) {
            return res.status(404).json({
              error: true,
              code: 'parent_session_not_found',
              message: `Parent session ${sessionId} not found`
            });
          }
        } catch (err: unknown) {
          return res.status(404).json({
            error: true,
            code: 'parent_session_not_found',
            message: `Parent session ${sessionId} not found`
          });
        }
      }

      // Inherit memberOverrides from parent session when coordinator spawns workers
      // This ensures launch-time overrides (model, permissionMode, etc.) propagate to child sessions
      if (spawnSource === 'session' && parentSession && !normalizedMemberOverrides) {
        const parentOverrides = parentSession.metadata?.memberOverrides;
        if (parentOverrides && typeof parentOverrides === 'object' && !Array.isArray(parentOverrides)) {
          // Migrate legacy {agentTool, model} shapes into canonical launchConfig so
          // pre-PR#83 coordinator overrides are not silently ignored downstream.
          normalizedMemberOverrides = normalizeMemberLaunchOverrides(parentOverrides) ?? undefined;
        }
      }

      // Inherit delegatePermissionMode from parent as child's permissionMode
      // When a coordinator spawns a worker, the coordinator's delegatePermissionMode becomes the worker's permissionMode
      let resolvedPermissionMode = requestedPermissionMode;
      let resolvedDelegatePermissionMode = requestedDelegatePermissionMode;
      if (spawnSource === 'session' && parentSession && !resolvedPermissionMode) {
        const parentDelegateMode = parentSession.metadata?.delegatePermissionMode;
        if (parentDelegateMode) {
          resolvedPermissionMode = parentDelegateMode;
        } else if (parentSession.metadata?.permissionMode === 'bypassPermissions') {
          // A bypass-permission parent propagates bypass to the children it spawns so
          // they don't stall on permission prompts the parent itself never sees.
          resolvedPermissionMode = 'bypassPermissions';
        }
      }

      const resolvedParentSessionId = spawnSource === 'session' && parentSession
        ? parentSession.id
        : null;
      const resolvedRootSessionId = resolvedParentSessionId
        ? (parentSession?.rootSessionId || parentSession?.id)
        : null;

      // Any session (any mode) may spawn new sessions — no mode-level guard rails.

      // Verify all tasks exist (parallel fetch) and collect task-level team member IDs as fallback
      let verifiedTasks: any[];
      try {
        verifiedTasks = await Promise.all(
          taskIds.map(async (taskId: string) => {
            const task = await taskRepo.findById(taskId);
            if (!task) {
              throw Object.assign(new Error(`Task ${taskId} not found`), { taskId, statusCode: 404 });
            }
            return task;
          })
        );
      } catch (err: any) {
        if (err.statusCode === 404) {
          return res.status(404).json({
            error: true,
            code: 'task_not_found',
            message: err.message,
            details: { taskId: err.taskId }
          });
        }
        throw err;
      }

      // Inherit useWorktree from task when not provided in request
      let useWorktree = requestedUseWorktree;
      if (useWorktree === undefined && verifiedTasks.length > 0 && verifiedTasks[0].useWorktree) {
        useWorktree = true;
      }

      // Inherit memberOverrides from task when not provided in request
      // This ensures stored launch-config overrides are applied when spawning from task list
      if (!normalizedMemberOverrides && verifiedTasks.length === 1 && verifiedTasks[0].memberOverrides) {
        const taskOverrides = verifiedTasks[0].memberOverrides;
        if (typeof taskOverrides === 'object' && !Array.isArray(taskOverrides)) {
          // Migrate legacy {agentTool, model} shapes into canonical launchConfig so
          // pre-PR#83 task overrides are not silently ignored downstream.
          normalizedMemberOverrides = normalizeMemberLaunchOverrides(taskOverrides) ?? undefined;
        }
      }

      // Fall back to task-level teamMemberId/teamMemberIds if none provided in request
      if (effectiveTeamMemberIds.length === 0) {
        const taskTeamMemberIds: string[] = [];
        for (const task of verifiedTasks) {
          if (task.teamMemberIds && task.teamMemberIds.length > 0) {
            for (const tmId of task.teamMemberIds) {
              if (!taskTeamMemberIds.includes(tmId)) {
                taskTeamMemberIds.push(tmId);
              }
            }
          } else if (task.teamMemberId && !taskTeamMemberIds.includes(task.teamMemberId)) {
            taskTeamMemberIds.push(task.teamMemberId);
          }
        }
        if (taskTeamMemberIds.length > 0) {
          if (requestedCoordinatorMode) {
            effectiveTeamMemberIds = [taskTeamMemberIds[0]];
            if (effectiveDelegateTeamMemberIds.length === 0 && taskTeamMemberIds.length > 1) {
              effectiveDelegateTeamMemberIds = taskTeamMemberIds.slice(1);
            }
          } else {
            effectiveTeamMemberIds = taskTeamMemberIds;
          }
        }
      }

      if (requestedCoordinatorMode && effectiveTeamMemberIds.length > 0 && effectiveDelegateTeamMemberIds.length > 0) {
        const selfId = effectiveTeamMemberIds[0];
        effectiveDelegateTeamMemberIds = effectiveDelegateTeamMemberIds.filter((id) => id !== selfId);
      }

      // Batch-fetch all project team members once (used for coordinator fallback + defaults loop)
      const projectTeamMembers = await teamMemberRepo.findByProjectId(projectId);
      const teamMemberMap = new Map(projectTeamMembers.map((m) => [m.id, m]));

      // Workspace-global model profiles (cached). Members with a modelProfileId resolve
      // their launch config from the profile at spawn, so a profile edit re-points them.
      const allModelProfiles = await modelProfileRepo.findAll();
      const modelProfileMap = new Map(allModelProfiles.map((p) => [p.id, p]));

      // Coordinator modes must include exactly one self identity profile for prompt normalization.
      // If none was provided/resolved, pick a deterministic active coordinator member from the project.
      if (requestedCoordinatorMode && effectiveTeamMemberIds.length === 0) {
        const activeTeamMembers = projectTeamMembers.filter((member) => member.status !== 'archived');
        const coordinatorSelf =
          activeTeamMembers.find((member) => isCoordinatorMode(String(member.mode || ''))) ||
          activeTeamMembers.find((member) => member.capabilities?.can_spawn_sessions) ||
          activeTeamMembers[0];

        if (!coordinatorSelf) {
          return res.status(400).json({
            error: true,
            code: 'missing_coordinator_self_identity',
            message: 'Coordinator mode requires one self team member profile. Provide teamMemberId or create an active coordinator team member.',
          });
        }

        effectiveTeamMemberIds = [coordinatorSelf.id];
      }

      // Fetch team member defaults from the effective members (after task-level fallback)
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
      let teamMemberDefaults: { mode?: AgentMode; model?: string; agentTool?: AgentTool; permissionMode?: string; launchConfig?: LaunchConfig } = {};
      const teamMemberSnapshots: TeamMemberSnapshot[] = [];

      if (effectiveTeamMemberIds.length > 0 && projectId) {
        let highestModelPower = -1;
        let hasWinner = false;
        for (const tmId of effectiveTeamMemberIds) {
          const teamMember = teamMemberMap.get(tmId);
          if (teamMember && teamMember.status !== 'archived') {
              // Apply per-member overrides if provided. Precedence for the launch
              // config: explicit override > bound model profile > raw member fields.
              const override = normalizedMemberOverrides && normalizedMemberOverrides[tmId];
              const profileConfig = teamMember.modelProfileId
                ? modelProfileMap.get(teamMember.modelProfileId)?.launchConfig
                : undefined;
              // Full launch config of the winning candidate (carries reasoning/speed/access).
              const effectiveLaunchConfig = override?.launchConfig || profileConfig || undefined;
              const effectiveModel = override?.launchConfig?.model || profileConfig?.model || teamMember.model;
              const effectiveAgentTool = effectiveLaunchConfig
                ? agentToolForProvider(effectiveLaunchConfig.provider)
                : teamMember.agentTool;
              const effectivePermissionMode =
                permissionModeForAccessMode(override?.launchConfig?.accessMode)
                || permissionModeForAccessMode(profileConfig?.accessMode)
                || teamMember.permissionMode;
              const effectiveSkillIds = override?.skillIds || teamMember.skillIds;
              const effectiveCommandPermissions = override?.commandPermissions
                ? { ...teamMember.commandPermissions, ...override.commandPermissions }
                : teamMember.commandPermissions;

              // Mode: use first member's mode (or most capable)
              if (!teamMemberDefaults.mode && teamMember.mode) {
                teamMemberDefaults.mode = teamMember.mode as AgentMode;
              }
              // Winning member: most powerful model wins, and model + agentTool +
              // permissionMode are all taken from that SAME member so they stay coherent.
              // Resolving these fields independently previously allowed the model to come
              // from one member (e.g. claude-opus-4-8) and the tool from another (e.g. codex),
              // producing a Claude model launched on Codex.
              const power = effectiveModel ? (MODEL_POWER[effectiveModel] || 0) : -1;
              if (!hasWinner || power > highestModelPower) {
                hasWinner = true;
                highestModelPower = power;
                teamMemberDefaults.model = effectiveModel;
                teamMemberDefaults.agentTool = effectiveAgentTool;
                teamMemberDefaults.permissionMode = effectivePermissionMode;
                teamMemberDefaults.launchConfig = effectiveLaunchConfig;
              }
              // Build snapshot for UI display (with overrides applied)
              teamMemberSnapshots.push({
                name: teamMember.name,
                avatar: teamMember.avatar,
                role: teamMember.role,
                model: effectiveModel,
                agentTool: effectiveAgentTool,
                permissionMode: effectivePermissionMode,
              });
          }
        }
      }

      // Fall back to the winning team member's stored permissionMode when neither the
      // request nor a parent-delegate mode supplied one. Without this, a team member's
      // configured access level (e.g. bypassPermissions) is silently dropped at spawn.
      if (!resolvedPermissionMode && teamMemberDefaults.permissionMode) {
        resolvedPermissionMode = teamMemberDefaults.permissionMode;
      }

      // Resolve mode with four-mode normalization
      const rawMode = (requestedMode as string) || teamMemberDefaults.mode || 'worker';
      const validModes = ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'];
      if (!validModes.includes(rawMode)) {
        return res.status(400).json({
          error: true,
          code: 'invalid_mode',
          message: `mode must be one of: ${validModes.join(', ')}`
        });
      }
      // Auto-derive coordinated modes when spawned by a session
      const hasCoordinator = !!resolvedParentSessionId;
      const resolvedMode: AgentMode = normalizeMode(rawMode, hasCoordinator);

      // Resolve launch config and agent tool: explicit launch config wins over team
      // member defaults, which in turn prefer a resolved profile/override config
      // (carries reasoning/speed/access) before reconstructing from the bare model.
      const resolvedLaunchConfig: LaunchConfig | undefined = requestedLaunchConfig
        || sanitizeLaunchConfig(teamMemberDefaults.launchConfig)
        || sanitizeLaunchConfig(
          teamMemberDefaults.model
            ? {
                // The model is authoritative: derive the provider from the model name
                // and only fall back to the member's agentTool when the model is unrecognized.
                provider: providerForModel(teamMemberDefaults.model)
                  || providerForAgentTool(teamMemberDefaults.agentTool),
                model: teamMemberDefaults.model,
              }
            : undefined
        );
      const resolvedModel = resolvedLaunchConfig?.model || teamMemberDefaults.model;
      const resolvedAgentToolFromMember = resolvedLaunchConfig
        ? agentToolForProvider(resolvedLaunchConfig.provider)
        : teamMemberDefaults.agentTool;

      // Get project
      const project = await projectRepo.findById(projectId);
      if (!project) {
        return res.status(404).json({
          error: true,
          code: 'project_not_found',
          message: `Project ${projectId} not found`
        });
      }

      // Validate git repo if worktree requested
      if (useWorktree) {
        const isGit = await gitService.isGitRepo(project.workingDir);
        if (!isGit) {
          return res.status(400).json({
            error: true,
            code: 'not_a_git_repo',
            message: `Cannot use worktree: ${project.workingDir} is not a git repository`
          });
        }
      }

      const skillsToUse = skills && Array.isArray(skills) ? skills : [];

      // Create session with suppressed created event
      const modeLabel = isCoordinatorMode(resolvedMode) ? 'Coordinate' : 'Execute';

      // Determine teamSessionId:
      // Workers inherit the coordinator's session ID as teamSessionId.
      // Coordinator gets teamSessionId = its own ID (set after creation).
      const isSessionSpawned = !!resolvedParentSessionId;

      // Pre-generate Claude session ID for resume support
      const claudeSessionId = randomUUID();

      // Resolve the saved team this session belongs to so the whole spawn tree stays
      // team-bound. An explicit request always wins (passing teamId: null clears it);
      // only when the request omits teamId do we inherit from the parent (recursive
      // spawn) and then fall back to the task's team.
      let effectiveTeamId: string | null =
        requestedTeamId !== undefined
          ? (requestedTeamId || null)
          : (parentSession?.teamId || verifiedTasks.find(t => t?.teamId)?.teamId || null);

      // Scope recursion: when a coordinator spawns a member who leads a sub-team within
      // the bound team, re-root the child to that sub-team so each level only sees and
      // delegates within its own branch (instead of re-rendering the whole org tree).
      // Gated to coordinator spawns — only there does a single team member reliably mean
      // "self" (a worker spawn could carry one member who merely happens to lead a sub-team).
      if (effectiveTeamId && requestedCoordinatorMode && effectiveTeamMemberIds.length === 1) {
        try {
          const subTeamId = await teamService.findSubTeamLedBy(
            projectId,
            effectiveTeamId,
            effectiveTeamMemberIds[0]
          );
          if (subTeamId) {
            effectiveTeamId = subTeamId;
          }
        } catch {
          // Non-fatal: keep the inherited team binding if sub-team lookup fails.
        }
      }

      const session = await sessionService.createSession({
        projectId,
        taskIds,
        name: sessionName || `${modeLabel} for ${taskIds[0]}`,
        claudeSessionId,
        status: 'spawning',
        env: {},
        teamId: effectiveTeamId,
        metadata: {
          skills: skillsToUse,
          spawnedBy: resolvedParentSessionId,
          spawnSource,
          mode: resolvedMode,
          agentTool: resolvedAgentToolFromMember || 'claude-code',
          model: resolvedModel || null,
          launchConfig: resolvedLaunchConfig || null,
          teamMemberId: effectiveTeamMemberIds.length === 1 ? effectiveTeamMemberIds[0] : null,
          teamMemberIds: effectiveTeamMemberIds.length > 0 ? effectiveTeamMemberIds : null,
          context: context || {},
          ...(normalizedMemberOverrides && Object.keys(normalizedMemberOverrides).length > 0 ? { memberOverrides: normalizedMemberOverrides } : {}),
          // Persist the RESOLVED permissionMode (request → parent-delegate → team-member)
          // so resume can faithfully reconstruct the session's access level.
          ...(resolvedPermissionMode ? { permissionMode: resolvedPermissionMode } : {}),
          ...(requestedDelegatePermissionMode ? { delegatePermissionMode: requestedDelegatePermissionMode } : {}),
        },
        parentSessionId: resolvedParentSessionId,
        rootSessionId: resolvedRootSessionId,
        teamSessionId: isSessionSpawned ? resolvedParentSessionId! : null,
        _suppressCreatedEvent: true
      });

      // Create git worktree if requested
      let worktreeResult: { worktreePath: string; branchName: string; baseCommit: string } | null = null;
      if (useWorktree) {
        try {
          // Use task title as slug when available for a readable branch name
          const taskSlug = verifiedTasks[0]?.title;
          worktreeResult = await gitService.createWorktree(project.workingDir, session.id, taskSlug);
          // Persist worktree metadata on session (deep merge via updateSession)
          await sessionService.updateSession(session.id, {
            metadata: {
              worktreePath: worktreeResult.worktreePath,
              worktreeBranch: worktreeResult.branchName,
              worktreeBaseCommit: worktreeResult.baseCommit,
            },
            env: {
              ...session.env,
              MAESTRO_WORKTREE_PATH: worktreeResult.worktreePath,
              MAESTRO_WORKTREE_BRANCH: worktreeResult.branchName,
              MAESTRO_PROJECT_DIR: project.workingDir,
            },
          });
        } catch (wtErr: unknown) {
          // Worktree creation failed — clean up session and return error
          try { await sessionService.deleteSession(session.id); } catch { /* ignore cleanup error */ }
          const msg = wtErr instanceof Error ? wtErr.message : 'Unknown error';
          return res.status(500).json({
            error: true,
            code: 'worktree_creation_failed',
            message: `Failed to create git worktree: ${msg}`
          });
        }
      }

      // Ensure coordinator session has teamSessionId = its own ID on first spawn
      if (isSessionSpawned) {
        try {
          const coordinatorSession = await sessionService.getSession(resolvedParentSessionId!);
          if (coordinatorSession && !coordinatorSession.teamSessionId) {
            await sessionService.updateSession(coordinatorSession.id, { teamSessionId: coordinatorSession.id });
          }
        } catch { /* coordinator update failed, non-critical */ }
      }

      // Set team member fields directly on session for UI display
      if (effectiveTeamMemberIds.length > 0) {
        (session as any).teamMemberIds = effectiveTeamMemberIds;
        (session as any).teamMemberSnapshots = teamMemberSnapshots;
        if (effectiveTeamMemberIds.length === 1) {
          (session as any).teamMemberId = effectiveTeamMemberIds[0];
          (session as any).teamMemberSnapshot = teamMemberSnapshots[0] || undefined;
        }
      }

      // Collect referenceTaskIds from already-verified tasks (no re-fetch needed)
      const allReferenceTaskIds: string[] = [];
      for (const task of verifiedTasks) {
        if (task?.referenceTaskIds && task.referenceTaskIds.length > 0) {
          for (const refId of task.referenceTaskIds) {
            if (!allReferenceTaskIds.includes(refId)) {
              allReferenceTaskIds.push(refId);
            }
          }
        }
      }

      // Flush pending task writes so the CLI subprocess can read them from disk
      await taskRepo.flush();

      // Generate manifest
      let manifestPath: string;
      let manifest: any;

      try {
        const result = await generateManifestViaCLI({
          mode: resolvedMode,
          projectId,
          taskIds,
          skills: skillsToUse,
          sessionId: session.id,
          launchConfig: resolvedLaunchConfig,
          agentTool: resolvedAgentToolFromMember,
          referenceTaskIds: allReferenceTaskIds.length > 0 ? allReferenceTaskIds : undefined,
          // Multi-identity: pass teamMemberIds for multi-member sessions
          teamMemberIds: effectiveTeamMemberIds.length > 1
            ? effectiveTeamMemberIds
            : (effectiveDelegateTeamMemberIds.length > 0 ? effectiveDelegateTeamMemberIds : undefined),
          // Single identity: backward compat
          teamMemberId: effectiveTeamMemberIds.length === 1 ? effectiveTeamMemberIds[0] : undefined,
          // Saved team this session belongs to (drives recursive team structure in manifest)
          teamId: effectiveTeamId || undefined,
          // Pass server URL so CLI subprocess can reach the API
          serverUrl: config.serverUrl,
          // Pass initial directive for guaranteed delivery in manifest
          initialDirective: initialDirective || undefined,
          coordinatorSessionId: resolvedParentSessionId || undefined,
          // Pass master flag so CLI includes cross-project data in manifest
          isMaster: project.isMaster === true,
          // Pass per-member launch overrides so CLI manifest reflects effective identity config
          memberOverrides: normalizedMemberOverrides && Object.keys(normalizedMemberOverrides).length > 0
            ? normalizedMemberOverrides
            : undefined,
          permissionMode: resolvedPermissionMode || undefined,
          delegatePermissionMode: resolvedDelegatePermissionMode || undefined,
          sessionDir: config.sessionDir,
          cliPathOverride: config.manifestGenerator.cliPath,
        });
        manifestPath = result.manifestPath;
        manifest = result.manifest;

      } catch (manifestError: unknown) {
        const msg = manifestError instanceof Error ? manifestError.message : 'Unknown error';
        return res.status(500).json({
          error: true,
          code: 'manifest_generation_failed',
          message: `Failed to generate manifest: ${msg}`
        });
      }

      // Prepare spawn data
      const resolvedAgentTool = resolvedAgentToolFromMember || 'claude-code';
      const initCommand = isCoordinatorMode(resolvedMode) ? 'orchestrator' : 'worker';
      const cwd = worktreeResult?.worktreePath || project.workingDir;
      const { maestroBin, monorepoRoot } = resolveMaestroCliRuntime(config.manifestGenerator.cliPath);
      // On Windows, cmd.exe may not find bare `maestro` even with PATH set,
      // so use `node <path>` to invoke the CLI entry point directly.
      const command = platform() === 'win32'
        ? `node ${maestroBin} ${initCommand} init`
        : `maestro ${initCommand} init`;

      // Pass through auth-related API keys from server environment
      const authEnvKeys = [
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'GOOGLE_GENAI_USE_VERTEXAI',
        'GOOGLE_GENAI_USE_GCA',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
      ];
      const authEnvVars: Record<string, string> = {};
      for (const key of authEnvKeys) {
        if (process.env[key]) {
          authEnvVars[key] = process.env[key]!;
        }
      }
      // Always enable GCA auth for Gemini CLI
      if (!authEnvVars['GOOGLE_GENAI_USE_GCA']) {
        authEnvVars['GOOGLE_GENAI_USE_GCA'] = 'true';
      }

      const finalEnvVars: Record<string, string> = {
        MAESTRO_SESSION_ID: session.id,
        MAESTRO_CLAUDE_SESSION_ID: claudeSessionId,
        MAESTRO_MANIFEST_PATH: manifestPath,
        MAESTRO_SERVER_URL: config.serverUrl,
        MAESTRO_MODE: resolvedMode,
        MAESTRO_COORDINATOR_SESSION_ID: resolvedParentSessionId || '',
        MAESTRO_ROOT_SESSION_ID: session.rootSessionId || '',
        // Pass storage paths so CLI reads/writes to the correct environment directories
        DATA_DIR: config.dataDir,
        SESSION_DIR: config.sessionDir,
        // Pass through auth API keys so spawned agents can authenticate
        ...authEnvVars,
      };

      // Add worktree env vars if worktree was created
      if (worktreeResult) {
        finalEnvVars.MAESTRO_WORKTREE_PATH = worktreeResult.worktreePath;
        finalEnvVars.MAESTRO_WORKTREE_BRANCH = worktreeResult.branchName;
        finalEnvVars.MAESTRO_PROJECT_DIR = project.workingDir;
      }

      // Ensure the init command resolves to the same CLI runtime used for manifest generation.
      const runtimePathForInit = buildRuntimePath(process.env.PATH, monorepoRoot);
      if (runtimePathForInit) {
        finalEnvVars.PATH = runtimePathForInit;
      }
      finalEnvVars.MAESTRO_CLI_PATH = maestroBin;

      // Propagate master session flag to spawned agent environment
      if (project.isMaster === true) {
        finalEnvVars.MAESTRO_IS_MASTER = 'true';
      }

      // Update session env
      await sessionService.updateSession(session.id, { env: finalEnvVars });

      // Emit session:spawn event (ALWAYS - for both UI and session spawns)
      const spawnEvent = {
        session: { ...session, env: finalEnvVars },
        command,
        cwd,
        envVars: finalEnvVars,
        manifest,
        projectId,
        taskIds,
        spawnSource,                        // NEW: 'ui' or 'session'
        parentSessionId: resolvedParentSessionId || null, // NEW: parent session ID if session-initiated
        rootSessionId: session.rootSessionId || undefined, // NEW: root session ID for nested spawn chains
        _isSpawnCreated: true               // Keep for backward compatibility
      };

      await eventBus.emit('session:spawn', spawnEvent);

      // When the server hosts PTYs (headless/web), spawn the agent process here.
      // The Tauri desktop path (ptyHost === 'tauri') relies on the event above instead.
      if (config.ptyHost === 'server') {
        try {
          ptyHostService.spawn({
            sessionId: session.id,
            command,
            cwd,
            env: finalEnvVars,
            // Boot the PTY at the browser's measured size (validated by
            // spawnSessionSchema) so the agent never renders at the 80x24
            // default and then desyncs against the wider xterm grid.
            cols: req.body.cols,
            rows: req.body.rows,
          });
        } catch (ptyErr) {
          return res.status(500).json({
            error: true,
            code: 'pty_spawn_failed',
            message: ptyErr instanceof Error ? ptyErr.message : 'Failed to spawn server PTY',
          });
        }
      }

      // Emit task:session_added events (parallelized)
      await Promise.all(
        taskIds.map((taskId: string) => eventBus.emit('task:session_added', { taskId, sessionId: session.id }))
      );

      res.status(201).json({
        success: true,
        sessionId: session.id,
        manifestPath,
        message: 'Spawn request sent to Agent Maestro',
        session: { ...session, env: finalEnvVars }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        error: true,
        code: 'spawn_error',
        message
      });
    }
  });

  // ==================== RESUME SESSION ====================

  router.post('/sessions/:id/resume', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      // Load session
      const session = await sessionService.getSession(id);
      if (!session) {
        return res.status(404).json({
          error: true,
          code: 'session_not_found',
          message: `Session ${id} not found`
        });
      }

      // Resume is allowed from ANY status. The server-side `status` field is an
      // unreliable, client-driven signal that frequently gets stuck at 'working'/
      // 'spawning' when a terminal dies without the UI reporting it. Gating resume
      // on it stranded ~24% of sessions. The terminal-exited state (UI) is the real
      // liveness signal; the server should never block a resume on stale status.

      // Generate claudeSessionId if missing (pre-feature sessions get a fresh spawn)
      const hadClaudeSessionId = !!session.claudeSessionId;
      if (!hadClaudeSessionId) {
        session.claudeSessionId = randomUUID();
        await sessionService.updateSession(session.id, {
          env: { ...session.env, MAESTRO_CLAUDE_SESSION_ID: session.claudeSessionId },
        });
      }

      // Validate agent tool is claude-code
      const agentTool = session.metadata?.agentTool || 'claude-code';
      if (agentTool !== 'claude-code') {
        return res.status(400).json({
          error: true,
          code: 'agent_tool_not_resumable',
          message: `Agent tool '${agentTool}' does not support resume. Only 'claude-code' sessions can be resumed.`
        });
      }

      // Load project for workingDir
      const project = await projectRepo.findById(session.projectId);
      if (!project) {
        return res.status(404).json({
          error: true,
          code: 'project_not_found',
          message: `Project ${session.projectId} not found`
        });
      }

      const cwd = session.metadata?.worktreePath || project.workingDir;
      const { maestroBin, monorepoRoot } = resolveMaestroCliRuntime(config.manifestGenerator.cliPath);

      // Regenerate manifest so MAESTRO_MANIFEST_PATH points to a valid file
      const mode = session.metadata?.mode || 'worker';
      const skillsToUse: string[] = session.metadata?.skills || [];
      // Prefer the full launchConfig stored at spawn time so accessMode and
      // reasoningEffort survive resume; fall back to the legacy model string.
      const storedLaunchConfig = session.metadata?.launchConfig
        ? sanitizeLaunchConfig(session.metadata.launchConfig as LaunchConfig)
        : undefined;
      const resolvedModel: string | undefined = storedLaunchConfig?.model || session.metadata?.model || undefined;
      const resumePermissionMode = (session.metadata?.permissionMode as string | undefined) || undefined;

      const resumeTasks = await Promise.all(session.taskIds.map((taskId: string) => taskRepo.findById(taskId)));
      const allReferenceTaskIds: string[] = [];
      for (const task of resumeTasks) {
        if (task?.referenceTaskIds && task.referenceTaskIds.length > 0) {
          for (const refId of task.referenceTaskIds) {
            if (!allReferenceTaskIds.includes(refId)) {
              allReferenceTaskIds.push(refId);
            }
          }
        }
      }

      // Flush pending task writes so the CLI subprocess can read them from disk
      await taskRepo.flush();

      let manifestPath: string | undefined;
      try {
        const manifestResult = await generateManifestViaCLI({
          mode,
          projectId: session.projectId,
          taskIds: session.taskIds,
          skills: skillsToUse,
          sessionId: session.id,
          launchConfig: storedLaunchConfig
            ?? (resolvedModel
              ? sanitizeLaunchConfig({
                  provider: providerForModel(resolvedModel) || providerForAgentTool(agentTool),
                  model: resolvedModel,
                })
              : undefined),
          agentTool: agentTool,
          referenceTaskIds: allReferenceTaskIds.length > 0 ? allReferenceTaskIds : undefined,
          teamMemberIds: session.metadata?.teamMemberIds || undefined,
          teamMemberId: session.metadata?.teamMemberId || undefined,
          teamId: session.teamId || undefined,
          permissionMode: resumePermissionMode,
          serverUrl: config.serverUrl,
          isMaster: project.isMaster === true,
          sessionDir: config.sessionDir,
          cliPathOverride: config.manifestGenerator.cliPath,
        });
        manifestPath = manifestResult.manifestPath;
      } catch (manifestErr) {
        // Non-fatal: resume can proceed without fresh manifest (hooks will handle gracefully)
        console.warn('[resume] Failed to regenerate manifest:', manifestErr instanceof Error ? manifestErr.message : manifestErr);
      }

      // Pass through auth-related API keys from server environment
      const authEnvKeys = [
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'GOOGLE_GENAI_USE_VERTEXAI',
        'GOOGLE_GENAI_USE_GCA',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
      ];
      const authEnvVars: Record<string, string> = {};
      for (const key of authEnvKeys) {
        if (process.env[key]) {
          authEnvVars[key] = process.env[key]!;
        }
      }
      if (!authEnvVars['GOOGLE_GENAI_USE_GCA']) {
        authEnvVars['GOOGLE_GENAI_USE_GCA'] = 'true';
      }

      // Determine command: resume if session had a Claude session ID, fresh spawn otherwise
      const initCommand = isCoordinatorMode(mode) ? 'orchestrator' : 'worker';
      const subcommand = hadClaudeSessionId ? 'resume' : 'init';
      const command = platform() === 'win32'
        ? `node ${maestroBin} ${initCommand} ${subcommand}`
        : `maestro ${initCommand} ${subcommand}`;

      // Reconstruct env vars — reuse stored env, refresh dynamic values
      const finalEnvVars: Record<string, string> = {
        ...session.env,
        MAESTRO_SESSION_ID: session.id,
        MAESTRO_CLAUDE_SESSION_ID: session.claudeSessionId!,
        MAESTRO_SERVER_URL: config.serverUrl,
        MAESTRO_MODE: mode,
        DATA_DIR: config.dataDir,
        SESSION_DIR: config.sessionDir,
        // Carry the stored permission mode forward so resumed agents keep their access level.
        ...(resumePermissionMode ? { MAESTRO_PERMISSION_MODE: resumePermissionMode } : {}),
        ...authEnvVars,
      };

      // Ensure CLI runtime path is correct
      const runtimePath = buildRuntimePath(process.env.PATH, monorepoRoot);
      if (runtimePath) {
        finalEnvVars.PATH = runtimePath;
      }
      finalEnvVars.MAESTRO_CLI_PATH = maestroBin;

      if (project.isMaster === true) {
        finalEnvVars.MAESTRO_IS_MASTER = 'true';
      }

      // Add worktree env vars if session has worktree metadata
      if (session.metadata?.worktreePath) {
        finalEnvVars.MAESTRO_WORKTREE_PATH = session.metadata.worktreePath;
        finalEnvVars.MAESTRO_WORKTREE_BRANCH = session.metadata.worktreeBranch || '';
        finalEnvVars.MAESTRO_PROJECT_DIR = project.workingDir;
      }

      // Update manifest path if regeneration succeeded
      if (manifestPath) {
        finalEnvVars.MAESTRO_MANIFEST_PATH = manifestPath;
      }

      // Update session status to spawning and add timeline event in one call
      await sessionService.updateSession(session.id, {
        status: 'spawning',
        env: finalEnvVars,
        timeline: [
          ...(session.timeline || []),
          {
            id: randomUUID(),
            type: 'progress' as const,
            timestamp: Date.now(),
            message: 'Session resumed',
          }
        ],
      });

      // Emit session:resume event (reuses SpawnRequestEvent shape)
      const resumeEvent = {
        session: { ...session, status: 'spawning' as SessionStatus, env: finalEnvVars },
        command,
        cwd,
        envVars: finalEnvVars,
        projectId: session.projectId,
        taskIds: session.taskIds,
        spawnSource: 'ui' as const,
        parentSessionId: session.parentSessionId || undefined,
        rootSessionId: session.rootSessionId || undefined,
      };

      await eventBus.emit('session:resume', resumeEvent);

      // When the server hosts PTYs (headless/web), spawn the agent process here.
      // The Tauri desktop path (ptyHost === 'tauri') relies on the event above instead.
      // Without this, the browser's PTY WebSocket attaches to a non-existent session
      // and is immediately closed (1011 "no live PTY"), so resume hangs on web-ui.
      if (config.ptyHost === 'server') {
        try {
          ptyHostService.spawn({
            sessionId: session.id,
            command,
            cwd,
            env: finalEnvVars,
            // Resume body is unvalidated — clamp the browser's measured size so
            // the resumed PTY boots at the real pane width, not the 80x24 default.
            cols: clampPtyDim(req.body?.cols),
            rows: clampPtyDim(req.body?.rows),
          });
        } catch (ptyErr) {
          return res.status(500).json({
            error: true,
            code: 'pty_spawn_failed',
            message: ptyErr instanceof Error ? ptyErr.message : 'Failed to spawn server PTY',
          });
        }
      }

      res.json({
        success: true,
        sessionId: session.id,
        claudeSessionId: session.claudeSessionId,
        message: 'Resume request sent to Agent Maestro',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        error: true,
        code: 'resume_error',
        message
      });
    }
  });

  return router;
}
