import express, { Request, Response } from 'express';
import { spawn as spawnProcess } from 'child_process';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, resolve as resolvePath, delimiter as pathDelimiter } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { SessionService } from '../application/services/SessionService';
import { GitWorktreeService } from '../application/services/GitWorktreeService';
import { LogDigestService } from '../application/services/LogDigestService';
import { IProjectRepository } from '../domain/repositories/IProjectRepository';
import { ITaskRepository } from '../domain/repositories/ITaskRepository';
import { IEventBus } from '../domain/events/IEventBus';
import { Config } from '../infrastructure/config';
import { AppError } from '../domain/common/Errors';
import { SessionStatus, AgentTool, AgentMode, TeamMember, TeamMemberSnapshot, MemberLaunchOverride, isCoordinatorMode, normalizeMode } from '../types';
import { ITeamMemberRepository } from '../domain/repositories/ITeamMemberRepository';
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
  idParamSchema,
  idAndTaskIdParamSchema,
  idAndModalIdParamSchema,
  paginationQuerySchema,
  extractPagination,
  paginate,
} from './validation';

function resolveMaestroCliRuntime(cliPathOverride?: string): { maestroBin: string; monorepoRoot: string | null } {
  const isPkg = __dirname.startsWith('/snapshot');
  if (cliPathOverride && cliPathOverride !== 'maestro') {
    return { maestroBin: cliPathOverride, monorepoRoot: null };
  }
  if (!isPkg) {
    const monorepoRoot = resolvePath(__dirname, '..', '..', '..');
    return {
      maestroBin: join(monorepoRoot, 'node_modules', '.bin', 'maestro'),
      monorepoRoot,
    };
  }
  return { maestroBin: 'maestro', monorepoRoot: null };
}

function prependNodeModulesBin(pathValue: string | undefined, monorepoRoot: string | null): string | undefined {
  if (!monorepoRoot) {
    return pathValue;
  }
  const nodeModulesBin = join(monorepoRoot, 'node_modules', '.bin');
  return `${nodeModulesBin}${pathDelimiter}${pathValue || ''}`;
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
  model?: string;
  agentTool?: AgentTool;
  referenceTaskIds?: string[];
  teamMemberIds?: string[];
  teamMemberId?: string;
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
  const { mode, projectId, taskIds, skills, sessionId, model, agentTool, referenceTaskIds, teamMemberIds, teamMemberId, serverUrl, initialDirective, memberOverrides, cliPathOverride } = options;

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
    ...(model ? ['--model', model] : []),
    ...(agentTool && agentTool !== 'claude-code' ? ['--agent-tool', agentTool] : []),
    ...(referenceTaskIds && referenceTaskIds.length > 0 ? ['--reference-task-ids', referenceTaskIds.join(',')] : []),
    ...(teamMemberIds && teamMemberIds.length > 0 ? ['--team-member-ids', teamMemberIds.join(',')] : []),
    ...(teamMemberId ? ['--team-member-id', teamMemberId] : []),
  ];

  const { maestroBin, monorepoRoot } = resolveMaestroCliRuntime(cliPathOverride);

  const spawnEnv: Record<string, string | undefined> = { ...process.env };
  // Ensure CLI subprocess can reach the server API (CLI reads MAESTRO_SERVER_URL, not SERVER_URL)
  if (serverUrl) {
    spawnEnv.MAESTRO_SERVER_URL = serverUrl;
  }
  const runtimePath = prependNodeModulesBin(spawnEnv.PATH, monorepoRoot);
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
    // Raise file descriptor limit before spawning to prevent "low max file
    // descriptors" errors from Claude Code (macOS default of 2560 is too low).
    // Explicitly set cwd to $HOME so the shell can getcwd() during init —
    // when launched from Finder the process cwd may be "/" which is
    // inaccessible due to macOS SIP/TCC restrictions.
    const child = spawnProcess(
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

    // Timeout: SIGTERM then SIGKILL if still alive
    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
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

interface SessionRouteDependencies {
  sessionService: SessionService;
  logDigestService: LogDigestService;
  projectRepo: IProjectRepository;
  taskRepo: ITaskRepository;
  teamMemberRepo: ITeamMemberRepository;
  eventBus: IEventBus;
  config: Config;
}

/**
 * Create session routes using the SessionService.
 */
export function createSessionRoutes(deps: SessionRouteDependencies) {
  const { sessionService, logDigestService, projectRepo, taskRepo, teamMemberRepo, eventBus, config } = deps;
  const gitWorktreeService = new GitWorktreeService();
  const router = express.Router();

  const resolveSessionMode = (session: any): string => {
    const metadataMode = session?.metadata?.mode;
    const envMode = session?.env?.MAESTRO_MODE;
    return String(metadataMode || envMode || '').trim();
  };

  const canCommunicateWithinTeamBoundary = (sender: any, target: any): boolean => {
    if (!sender || !target) return false;
    if (sender.id === target.id) return false;

    // Spawned sessions can message their parent coordinator and siblings (same parent).
    if (sender.parentSessionId) {
      if (target.id === sender.parentSessionId) {
        return true;
      }
      return Boolean(target.parentSessionId && target.parentSessionId === sender.parentSessionId);
    }

    // Root coordinators can message their direct team sessions.
    return Boolean(target.parentSessionId && target.parentSessionId === sender.id);
  };

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
      if (req.query.status) {
        filter.status = req.query.status as SessionStatus;
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

      if (req.query.active === 'true') {
        sessions = sessions.filter(s => s.status !== 'completed');
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
      const { title, filePath, content, taskId } = req.body;

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
  router.post('/sessions/:id/prompt', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const { content, mode = 'send', senderSessionId } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content is required and must be a string' });
      }
      if (!['send', 'paste'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be "send" or "paste"' });
      }
      if (!senderSessionId || typeof senderSessionId !== 'string') {
        return res.status(400).json({ error: 'senderSessionId is required and must be a string' });
      }

      const sessionId = req.params.id as string;
      const [session, senderSession] = await Promise.all([
        sessionService.getSession(sessionId),
        sessionService.getSession(senderSessionId),
      ]);

      if (!canCommunicateWithinTeamBoundary(senderSession, session)) {
        return res.status(403).json({
          error: true,
          code: 'prompt_scope_violation',
          message: 'Session prompt is limited to parent/sibling sessions (or direct team sessions for a root coordinator).',
          details: {
            senderSessionId,
            targetSessionId: sessionId,
          },
        });
      }

      const senderName = resolveSenderName(senderSession);
      const contentWithSender = prependSenderIdentity(content, senderName, senderSessionId);

      await eventBus.emit('session:prompt_send', {
        sessionId,
        content: contentWithSender,
        mode,
        senderSessionId,
        timestamp: Date.now(),
      });

      await sessionService.addTimelineEvent(
        sessionId,
        'prompt_received',
        `Received prompt from session ${senderSessionId}: "${contentWithSender.substring(0, 100)}${contentWithSender.length > 100 ? '...' : ''}"`,
        undefined,
        { senderSessionId, mode }
      );

      res.json({ success: true });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });


  // Spawn session (complex endpoint - uses CLI for manifest generation)
  router.post('/sessions/spawn', validateBody(spawnSessionSchema), async (req: Request, res: Response) => {
    try {
      const {
        projectId,
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
        agentTool: requestedAgentTool,   // Override agent tool for this run
        model: requestedModel,           // Override model for this run
        initialDirective,                // { subject, message, fromSessionId } for guaranteed delivery
        memberOverrides,                 // Per-member launch overrides: Record<string, MemberLaunchOverride>
        permissionMode: requestedPermissionMode,           // Session-level permission mode override
        delegatePermissionMode: requestedDelegatePermissionMode, // Permission mode for spawned workers
        useWorktree: requestedUseWorktree,  // Spawn in an isolated git worktree
      } = req.body;

      let normalizedMemberOverrides: Record<string, MemberLaunchOverride> | undefined =
        memberOverrides && typeof memberOverrides === 'object' && !Array.isArray(memberOverrides)
          ? memberOverrides
          : undefined;

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

      // Validation
      if (!projectId) {
        return res.status(400).json({
          error: true,
          code: 'missing_project_id',
          message: 'projectId is required'
        });
      }

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
          normalizedMemberOverrides = parentOverrides;
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
        }
      }

      const resolvedParentSessionId = spawnSource === 'session' && parentSession
        ? parentSession.id
        : null;
      const resolvedRootSessionId = resolvedParentSessionId
        ? (parentSession?.rootSessionId || parentSession?.id)
        : null;

      if (resolvedParentSessionId) {
        const parentMode = resolveSessionMode(parentSession);
        if (parentMode === 'coordinated-coordinator') {
          return res.status(403).json({
            error: true,
            code: 'spawn_forbidden_for_mode',
            message: 'coordinated-coordinator sessions cannot spawn new sessions. Coordinate only with existing team members.',
            details: {
              parentSessionId: resolvedParentSessionId,
              parentMode,
            },
          });
        }
      }

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
          normalizedMemberOverrides = taskOverrides;
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
      const MODEL_POWER: Record<string, number> = { 'opus[1m]': 4, 'opus': 3, 'sonnet[1m]': 2.5, 'sonnet': 2, 'haiku': 1 };
      let teamMemberDefaults: { mode?: AgentMode; model?: string; agentTool?: AgentTool; permissionMode?: string } = {};
      const teamMemberSnapshots: TeamMemberSnapshot[] = [];

      if (effectiveTeamMemberIds.length > 0 && projectId) {
        let highestModelPower = 0;
        for (const tmId of effectiveTeamMemberIds) {
          const teamMember = teamMemberMap.get(tmId);
          if (teamMember && teamMember.status !== 'archived') {
              // Apply per-member overrides if provided
              const override = normalizedMemberOverrides && normalizedMemberOverrides[tmId];
              const effectiveModel = override?.model || teamMember.model;
              const effectiveAgentTool = override?.agentTool || teamMember.agentTool;
              const effectivePermissionMode = override?.permissionMode || teamMember.permissionMode;
              const effectiveSkillIds = override?.skillIds || teamMember.skillIds;
              const effectiveCommandPermissions = override?.commandPermissions
                ? { ...teamMember.commandPermissions, ...override.commandPermissions }
                : teamMember.commandPermissions;

              // Mode: use first member's mode (or most capable)
              if (!teamMemberDefaults.mode && teamMember.mode) {
                teamMemberDefaults.mode = teamMember.mode as AgentMode;
              }
              // Model: most powerful wins (using overridden model)
              const power = MODEL_POWER[effectiveModel || ''] || 0;
              if (power > highestModelPower) {
                highestModelPower = power;
                teamMemberDefaults.model = effectiveModel;
              } else if (!teamMemberDefaults.model && effectiveModel) {
                // Fallback: use any model if none resolved yet (handles non-standard model names)
                teamMemberDefaults.model = effectiveModel;
              }
              // AgentTool: first non-default wins (using overridden tool)
              if (!teamMemberDefaults.agentTool && effectiveAgentTool) {
                teamMemberDefaults.agentTool = effectiveAgentTool;
              }
              // PermissionMode: first non-null wins (using overridden permission)
              if (!teamMemberDefaults.permissionMode && effectivePermissionMode) {
                teamMemberDefaults.permissionMode = effectivePermissionMode;
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

      // Resolve model and agentTool: request overrides > team member defaults
      const resolvedModel = requestedModel || teamMemberDefaults.model;
      const resolvedAgentToolFromMember = requestedAgentTool || teamMemberDefaults.agentTool;

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
        const isGit = await gitWorktreeService.isGitRepo(project.workingDir);
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

      const session = await sessionService.createSession({
        projectId,
        taskIds,
        name: sessionName || `${modeLabel} for ${taskIds[0]}`,
        claudeSessionId,
        status: 'spawning',
        env: {},
        metadata: {
          skills: skillsToUse,
          spawnedBy: resolvedParentSessionId,
          spawnSource,
          mode: resolvedMode,
          agentTool: resolvedAgentToolFromMember || 'claude-code',
          model: resolvedModel || null,
          teamMemberId: effectiveTeamMemberIds.length === 1 ? effectiveTeamMemberIds[0] : null,
          teamMemberIds: effectiveTeamMemberIds.length > 0 ? effectiveTeamMemberIds : null,
          context: context || {},
          ...(normalizedMemberOverrides && Object.keys(normalizedMemberOverrides).length > 0 ? { memberOverrides: normalizedMemberOverrides } : {}),
          ...(requestedPermissionMode ? { permissionMode: requestedPermissionMode } : {}),
          ...(requestedDelegatePermissionMode ? { delegatePermissionMode: requestedDelegatePermissionMode } : {}),
        },
        parentSessionId: resolvedParentSessionId,
        rootSessionId: resolvedRootSessionId,
        teamSessionId: isSessionSpawned ? resolvedParentSessionId! : null,
        _suppressCreatedEvent: true
      });

      // Create git worktree if requested
      let worktreeResult: { worktreePath: string; branchName: string } | null = null;
      if (useWorktree) {
        try {
          worktreeResult = await gitWorktreeService.createWorktree(project.workingDir, session.id);
          // Store worktree metadata on session
          await sessionService.updateSession(session.id, {
            env: {
              ...session.env,
              MAESTRO_WORKTREE_PATH: worktreeResult.worktreePath,
              MAESTRO_WORKTREE_BRANCH: worktreeResult.branchName,
              MAESTRO_PROJECT_DIR: project.workingDir,
            },
          });
          // Also update in-memory metadata
          if (!session.metadata) (session as any).metadata = {};
          (session as any).metadata.worktreePath = worktreeResult.worktreePath;
          (session as any).metadata.worktreeBranch = worktreeResult.branchName;
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
          model: resolvedModel,
          agentTool: resolvedAgentToolFromMember,
          referenceTaskIds: allReferenceTaskIds.length > 0 ? allReferenceTaskIds : undefined,
          // Multi-identity: pass teamMemberIds for multi-member sessions
          teamMemberIds: effectiveTeamMemberIds.length > 1
            ? effectiveTeamMemberIds
            : (effectiveDelegateTeamMemberIds.length > 0 ? effectiveDelegateTeamMemberIds : undefined),
          // Single identity: backward compat
          teamMemberId: effectiveTeamMemberIds.length === 1 ? effectiveTeamMemberIds[0] : undefined,
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
      const command = `maestro ${initCommand} init`;
      const cwd = worktreeResult?.worktreePath || project.workingDir;
      const { maestroBin, monorepoRoot } = resolveMaestroCliRuntime(config.manifestGenerator.cliPath);

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
      const runtimePathForInit = prependNodeModulesBin(process.env.PATH, monorepoRoot);
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

      // Validate session is resumable
      const resumableStatuses: SessionStatus[] = ['completed', 'stopped', 'failed', 'idle'];
      if (!resumableStatuses.includes(session.status)) {
        return res.status(400).json({
          error: true,
          code: 'session_not_resumable',
          message: `Session status '${session.status}' is not resumable. Must be one of: ${resumableStatuses.join(', ')}`
        });
      }

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
      const resolvedModel: string | undefined = session.metadata?.model || undefined;

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
          model: resolvedModel,
          agentTool: agentTool,
          referenceTaskIds: allReferenceTaskIds.length > 0 ? allReferenceTaskIds : undefined,
          teamMemberIds: session.metadata?.teamMemberIds || undefined,
          teamMemberId: session.metadata?.teamMemberId || undefined,
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
      const command = hadClaudeSessionId
        ? `maestro ${initCommand} resume`
        : `maestro ${initCommand} init`;

      // Reconstruct env vars — reuse stored env, refresh dynamic values
      const finalEnvVars: Record<string, string> = {
        ...session.env,
        MAESTRO_SESSION_ID: session.id,
        MAESTRO_CLAUDE_SESSION_ID: session.claudeSessionId!,
        MAESTRO_SERVER_URL: config.serverUrl,
        MAESTRO_MODE: mode,
        DATA_DIR: config.dataDir,
        SESSION_DIR: config.sessionDir,
        ...authEnvVars,
      };

      // Ensure CLI runtime path is correct
      const runtimePath = prependNodeModulesBin(process.env.PATH, monorepoRoot);
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
