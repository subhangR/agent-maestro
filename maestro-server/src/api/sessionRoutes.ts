import express, { Request, Response } from 'express';
import { spawn as spawnProcess } from 'child_process';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, resolve as resolvePath } from 'path';
import { homedir } from 'os';
import { SessionService } from '../application/services/SessionService';
import { TemplateService } from '../application/services/TemplateService';
import { QueueService } from '../application/services/QueueService';
import { IProjectRepository } from '../domain/repositories/IProjectRepository';
import { ITaskRepository } from '../domain/repositories/ITaskRepository';
import { IEventBus } from '../domain/events/IEventBus';
import { Config } from '../infrastructure/config';
import { AppError } from '../domain/common/Errors';
import { SessionStatus, TemplateRole, WorkerStrategy, AgentTool } from '../types';

/**
 * Generate manifest via CLI command
 */
async function generateManifestViaCLI(options: {
  role: 'worker' | 'orchestrator';
  projectId: string;
  taskIds: string[];
  skills: string[];
  sessionId: string;
  strategy?: WorkerStrategy;
  model?: string;
  orchestratorStrategy?: string;
  agentTool?: AgentTool;
  referenceTaskIds?: string[];
}): Promise<{ manifestPath: string; manifest: any }> {
  const { role, projectId, taskIds, skills, sessionId, strategy, model, orchestratorStrategy, agentTool, referenceTaskIds } = options;

  console.log('\n   📋 GENERATING MANIFEST VIA CLI:');
  console.log(`      • Session ID: ${sessionId}`);
  console.log(`      • Role: ${role}`);

  const sessionDir = process.env.SESSION_DIR
    ? (process.env.SESSION_DIR.startsWith('~') ? join(homedir(), process.env.SESSION_DIR.slice(1)) : process.env.SESSION_DIR)
    : join(homedir(), '.maestro', 'sessions');
  const maestroDir = join(sessionDir, sessionId);
  await mkdir(maestroDir, { recursive: true });

  const manifestPath = join(maestroDir, 'manifest.json');

  const args = [
    'manifest', 'generate',
    '--role', role,
    '--project-id', projectId,
    '--task-ids', taskIds.join(','),
    '--skills', skills.join(','),
    '--strategy', strategy || 'simple',
    '--output', manifestPath,
    ...(model ? ['--model', model] : []),
    ...(orchestratorStrategy ? ['--orchestrator-strategy', orchestratorStrategy] : []),
    ...(agentTool && agentTool !== 'claude-code' ? ['--agent-tool', agentTool] : []),
    ...(referenceTaskIds && referenceTaskIds.length > 0 ? ['--reference-task-ids', referenceTaskIds.join(',')] : []),
  ];

  // Resolve maestro binary: use env var, monorepo path, or fall back to PATH
  let maestroBin: string;
  const isPkg = __dirname.startsWith('/snapshot');
  if (process.env.MAESTRO_CLI_PATH) {
    maestroBin = process.env.MAESTRO_CLI_PATH;
  } else if (!isPkg) {
    const monorepoRoot = resolvePath(__dirname, '..', '..', '..');
    maestroBin = join(monorepoRoot, 'node_modules', '.bin', 'maestro');
  } else {
    maestroBin = 'maestro';
  }

  console.log(`   🔧 CLI: ${maestroBin} ${args.join(' ')}`);

  const spawnEnv = { ...process.env };
  if (!isPkg) {
    const monorepoRoot = resolvePath(__dirname, '..', '..', '..');
    const nodeModulesBin = join(monorepoRoot, 'node_modules', '.bin');
    spawnEnv.PATH = `${nodeModulesBin}:${spawnEnv.PATH || ''}`;
  }

  return new Promise((resolve, reject) => {
    const child = spawnProcess(maestroBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: spawnEnv,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('exit', async (code) => {
      if (code === 0) {
        try {
          const manifestContent = await readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          console.log(`   ✅ Manifest generated: ${manifestPath}`);
          resolve({ manifestPath, manifest });
        } catch (error: any) {
          reject(new Error(`Failed to read manifest: ${error.message}`));
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
      reject(new Error(`Failed to spawn maestro CLI: ${error.message}`));
    });
  });
}

interface SessionRouteDependencies {
  sessionService: SessionService;
  templateService: TemplateService;
  queueService: QueueService;
  projectRepo: IProjectRepository;
  taskRepo: ITaskRepository;
  eventBus: IEventBus;
  config: Config;
}

/**
 * Create session routes using the SessionService.
 */
export function createSessionRoutes(deps: SessionRouteDependencies): express.Router {
  const { sessionService, templateService, queueService, projectRepo, taskRepo, eventBus, config } = deps;
  const router = express.Router();

  // Error handler helper
  const handleError = (err: any, res: Response) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json(err.toJSON());
    }
    return res.status(500).json({
      error: true,
      message: err.message,
      code: 'INTERNAL_ERROR'
    });
  };

  // Create session
  router.post('/sessions', async (req: Request, res: Response) => {
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
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // List sessions
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const filter: any = {};

      if (req.query.projectId) {
        filter.projectId = req.query.projectId as string;
      }
      if (req.query.taskId) {
        filter.taskId = req.query.taskId as string;
      }
      if (req.query.status) {
        filter.status = req.query.status as SessionStatus;
      }

      let sessions = await sessionService.listSessions(filter);

      if (req.query.active === 'true') {
        sessions = sessions.filter(s => s.status !== 'completed');
      }

      res.json(sessions);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get session by ID
  router.get('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = await sessionService.getSession(id);
      res.json(session);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Update session
  router.patch('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = await sessionService.updateSession(id, req.body);
      res.json(session);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Delete session
  router.delete('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await sessionService.deleteSession(id);
      res.json({ success: true, id });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Add event to session
  router.post('/sessions/:id/events', async (req: Request, res: Response) => {
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
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Add timeline event to session
  router.post('/sessions/:id/timeline', async (req: Request, res: Response) => {
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
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Add doc to session
  router.post('/sessions/:id/docs', async (req: Request, res: Response) => {
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
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get docs for a session
  router.get('/sessions/:id/docs', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const session = await sessionService.getSession(sessionId);
      res.json(session.docs || []);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Add task to session
  router.post('/sessions/:id/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const taskId = req.params.taskId as string;
      await sessionService.addTaskToSession(sessionId, taskId);
      const session = await sessionService.getSession(sessionId);
      res.json(session);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Remove task from session
  router.delete('/sessions/:id/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const taskId = req.params.taskId as string;
      await sessionService.removeTaskFromSession(sessionId, taskId);
      const session = await sessionService.getSession(sessionId);
      res.json(session);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Spawn session (complex endpoint - uses CLI for manifest generation)
  router.post('/sessions/spawn', async (req: Request, res: Response) => {
    try {
      const {
        projectId,
        taskIds,
        sessionName,
        skills,
        sessionId,              // NEW: parent session ID when spawnSource === 'session'
        spawnSource = 'ui',     // CHANGED: default to 'ui'
        role = 'worker',
        strategy = 'simple',    // Worker strategy: 'simple' or 'queue'
        context,
        model,                  // Model selection: 'sonnet' | 'opus' | 'haiku'
        orchestratorStrategy,   // Orchestrator strategy: 'default' | 'intelligent-batching' | 'dag'
        agentTool,              // Agent tool: 'claude-code' | 'codex'
      } = req.body;

      console.log('\n🚀 SESSION SPAWN EVENT RECEIVED');
      console.log(`   • projectId: ${projectId}`);
      console.log(`   • taskIds: [${taskIds?.join(', ') || 'NONE'}]`);
      console.log(`   • role: ${role}`);
      console.log(`   • strategy: ${strategy}`);
      console.log(`   • model: ${model || '(not set - will default to sonnet)'}`);
      console.log(`   • agentTool: ${agentTool || '(not set - will default to claude-code)'}`);
      console.log(`   • orchestratorStrategy: ${orchestratorStrategy || '(not set)'}`);

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

      // NEW: Validate sessionId when spawnSource === 'session'
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
          const parentSession = await sessionService.getSession(sessionId);
          if (!parentSession) {
            return res.status(404).json({
              error: true,
              code: 'parent_session_not_found',
              message: `Parent session ${sessionId} not found`
            });
          }
          console.log(`   ✓ Parent session verified: ${sessionId}`);
        } catch (err: any) {
          return res.status(404).json({
            error: true,
            code: 'parent_session_not_found',
            message: `Parent session ${sessionId} not found`
          });
        }
      }

      if (role !== 'worker' && role !== 'orchestrator') {
        return res.status(400).json({
          error: true,
          code: 'invalid_role',
          message: 'role must be "worker" or "orchestrator"'
        });
      }

      // Verify all tasks exist
      for (const taskId of taskIds) {
        const task = await taskRepo.findById(taskId);
        if (!task) {
          return res.status(404).json({
            error: true,
            code: 'task_not_found',
            message: `Task ${taskId} not found`,
            details: { taskId }
          });
        }
      }

      // Get project
      const project = await projectRepo.findById(projectId);
      if (!project) {
        return res.status(404).json({
          error: true,
          code: 'project_not_found',
          message: `Project ${projectId} not found`
        });
      }

      const skillsToUse = skills && Array.isArray(skills) ? skills : [];

      // Validate orchestratorStrategy (only when role is orchestrator)
      const validOrchestratorStrategies = ['default', 'intelligent-batching', 'dag'];
      const resolvedOrchestratorStrategy = role === 'orchestrator'
        ? (orchestratorStrategy || 'default')
        : orchestratorStrategy;
      if (resolvedOrchestratorStrategy && !validOrchestratorStrategies.includes(resolvedOrchestratorStrategy)) {
        return res.status(400).json({
          error: true,
          code: 'invalid_orchestrator_strategy',
          message: `orchestratorStrategy must be one of: ${validOrchestratorStrategies.join(', ')}`
        });
      }

      // Validate strategy
      if (strategy !== 'simple' && strategy !== 'queue' && strategy !== 'tree') {
        return res.status(400).json({
          error: true,
          code: 'invalid_strategy',
          message: 'strategy must be "simple", "queue", or "tree"'
        });
      }

      // Create session with suppressed created event
      const session = await sessionService.createSession({
        projectId,
        taskIds,
        name: sessionName || `${role.charAt(0).toUpperCase() + role.slice(1)} for ${taskIds[0]}`,
        strategy,                            // Worker strategy
        status: 'spawning',
        env: {},
        metadata: {
          skills: skillsToUse,
          spawnedBy: sessionId || null,      // CHANGED: use sessionId (parent session)
          spawnSource,                        // 'ui' or 'session'
          role,
          strategy,                           // Also store in metadata for easy access
          ...(resolvedOrchestratorStrategy && { orchestratorStrategy: resolvedOrchestratorStrategy }),
          context: context || {}
        },
        _suppressCreatedEvent: true
      });

      console.log(`   ✓ Session created: ${session.id}`);

      // If queue strategy, initialize queue
      if (strategy === 'queue') {
        try {
          await queueService.initializeQueue(session.id, taskIds);
          console.log(`   ✓ Queue initialized with ${taskIds.length} items`);
        } catch (queueErr: any) {
          console.error(`   ❌ Failed to initialize queue: ${queueErr.message}`);
          // Don't fail spawn if queue init fails - session is still valid
        }
      }

      // Collect referenceTaskIds from all tasks being spawned
      const allReferenceTaskIds: string[] = [];
      for (const taskId of taskIds) {
        const task = await taskRepo.findById(taskId);
        if (task?.referenceTaskIds && task.referenceTaskIds.length > 0) {
          for (const refId of task.referenceTaskIds) {
            if (!allReferenceTaskIds.includes(refId)) {
              allReferenceTaskIds.push(refId);
            }
          }
        }
      }

      // Generate manifest
      let manifestPath: string;
      let manifest: any;

      try {
        const result = await generateManifestViaCLI({
          role,
          projectId,
          taskIds,
          skills: skillsToUse,
          sessionId: session.id,
          strategy,
          model,
          orchestratorStrategy: resolvedOrchestratorStrategy,
          agentTool,
          referenceTaskIds: allReferenceTaskIds.length > 0 ? allReferenceTaskIds : undefined,
        });
        manifestPath = result.manifestPath;
        manifest = result.manifest;

        // Add templateId to manifest (server is source of truth for templates)
        try {
          const template = await templateService.getTemplateByRole(role as TemplateRole);
          manifest.templateId = template.id;
          // Write updated manifest back to file
          await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
          console.log(`   ✓ Added templateId to manifest: ${template.id}`);
        } catch (templateError: any) {
          console.warn(`   ⚠ Could not add templateId: ${templateError.message}`);
          // Continue without templateId - CLI will fall back to bundled template
        }
      } catch (manifestError: any) {
        console.error(`   ❌ Manifest generation failed: ${manifestError.message}`);
        return res.status(500).json({
          error: true,
          code: 'manifest_generation_failed',
          message: `Failed to generate manifest: ${manifestError.message}`
        });
      }

      // Prepare spawn data
      const resolvedAgentTool = agentTool || 'claude-code';
      const command = `maestro ${role} init`;
      const cwd = project.workingDir;

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

      const finalEnvVars = {
        MAESTRO_SESSION_ID: session.id,
        MAESTRO_MANIFEST_PATH: manifestPath,
        MAESTRO_SERVER_URL: config.serverUrl,
        MAESTRO_STRATEGY: strategy,
        // Pass storage paths so CLI reads/writes to the correct environment directories
        DATA_DIR: config.dataDir,
        SESSION_DIR: config.sessionDir,
        // Pass through auth API keys so spawned agents can authenticate
        ...authEnvVars,
      };

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
        parentSessionId: sessionId || null, // NEW: parent session ID if session-initiated
        _isSpawnCreated: true               // Keep for backward compatibility
      };

      await eventBus.emit('session:spawn', spawnEvent);
      console.log(`   ✓ session:spawn event emitted (source: ${spawnSource}${sessionId ? `, parent: ${sessionId}` : ''})`);

      // Emit task:session_added events
      for (const taskId of taskIds) {
        await eventBus.emit('task:session_added', { taskId, sessionId: session.id });
      }

      console.log('✅ SESSION SPAWN COMPLETED\n');

      res.status(201).json({
        success: true,
        sessionId: session.id,
        manifestPath,
        message: 'Spawn request sent to Agent Maestro',
        session: { ...session, env: finalEnvVars }
      });
    } catch (err: any) {
      console.error(`❌ SESSION SPAWN ERROR: ${err.message}`);
      res.status(500).json({
        error: true,
        code: 'spawn_error',
        message: err.message
      });
    }
  });

  return router;
}
