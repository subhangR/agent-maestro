import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { createContainer, Container } from './container';
import { createProjectRoutes } from './api/projectRoutes';
import { createTaskRoutes } from './api/taskRoutes';
import { createTaskListRoutes } from './api/taskListRoutes';
import { createTaskGraphRoutes } from './api/taskGraphRoutes';
import { createSessionRoutes } from './api/sessionRoutes';

import { createSkillRoutes } from './api/skillRoutes';
import { createOrderingRoutes } from './api/orderingRoutes';
import { createTeamMemberRoutes } from './api/teamMemberRoutes';
import { createTeamRoutes } from './api/teamRoutes';
import { createModelProfileRoutes } from './api/modelProfileRoutes';
import { createWorkflowTemplateRoutes } from './api/workflowTemplateRoutes';
import { createMasterRoutes } from './api/masterRoutes';
import { createSpellRoutes } from './api/spellRoutes';
import { createAlexaRoutes } from './api/alexaRoutes';
import { createGitRoutes } from './api/gitRoutes';
import { createAgentLogRoutes } from './api/agentLogRoutes';
import { WebSocketBridge } from './infrastructure/websocket/WebSocketBridge';
import { PtyWebSocketServer } from './infrastructure/websocket/PtyWebSocketServer';
import { errorHandler } from './api/middleware/errorHandler';
import { createAuthRoutes } from './api/authRoutes';
import { createAuthMiddleware, isTrustedLocalRequest } from './api/middleware/authMiddleware';
import { AuthService } from './infrastructure/auth/AuthService';

async function startServer() {
  // Create and initialize dependency container
  const container = await createContainer();
  await container.initialize();

  // Auth service — reads env vars; throws on misconfiguration before any port is bound
  const authService = new AuthService(container.config.dataDir);

  const { config, logger, eventBus, projectService, taskService, taskListService, taskGraphService, sessionService, logDigestService, orderingService, teamMemberService, teamService, modelProfileService, sessionPromptService, huddleService, commandUsageService, projectRepo, taskRepo, teamMemberRepo, modelProfileRepo, skillLoader, ptyHostService } = container;

  // Create Express app
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration for Tauri app and web clients
  // NOTE: CORS must be registered before rate limiting so preflight OPTIONS
  // requests always get proper CORS headers and are not blocked by 429.
  app.use(cors({
    origin: (origin, callback) => {
      // Extra origins for web/VPS deployments (e.g. the Tailscale/HTTPS host the
      // browser loads the SPA from). Comma-separated, set via env at deploy time.
      const envOrigins = (process.env.MAESTRO_ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowedOrigins = [
        'tauri://localhost',
        ...envOrigins,
      ];
      // In development, allow any localhost origin
      if (!origin || allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '')) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-Id'],
    exposedHeaders: ['Content-Length', 'X-Request-Id']
  }));
  // JSON body parser with size limit (50mb for image uploads)
  app.use(express.json({ limit: '50mb' }));

  // Compression middleware (skip SSE streams)
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers.accept === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  }));

  // Auth routes (always public — mounted before the guard)
  app.use('/api', createAuthRoutes(authService));

  // Auth guard — protects all /api/* except /api/auth/* and health endpoints
  app.use(createAuthMiddleware(authService));

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime()
    });
  });

  // WebSocket status endpoint (populated after wss is created)
  let wsBridge: WebSocketBridge;
  app.get('/ws-status', (req: Request, res: Response) => {
    if (!wsBridge) {
      return res.json({
        error: 'WebSocket server not initialized yet'
      });
    }
    res.json({
      connectedClients: wsBridge.getClientCount(),
      clients: wsBridge.getClientStatus()
    });
  });

  // API routes using services
  const projectRoutes = createProjectRoutes(projectService, sessionService);
  const taskRoutes = createTaskRoutes(taskService, sessionService, config.dataDir);
  const taskListRoutes = createTaskListRoutes(taskListService);
  const taskGraphRoutes = createTaskGraphRoutes(taskGraphService);
  const sessionRoutes = createSessionRoutes({
    sessionService,
    sessionPromptService,
    huddleService,
    commandUsageService,
    logDigestService,
    teamService,
    projectRepo,
    taskRepo,
    teamMemberRepo,
    modelProfileRepo,
    eventBus,
    config,
    ptyHostService
  });

  // Ordering routes
  const orderingRoutes = createOrderingRoutes(orderingService);

  // Team member routes
  const teamMemberRoutes = createTeamMemberRoutes(teamMemberService);

  // Team routes
  const teamRoutes = createTeamRoutes(teamService);

  // Model profile routes (workspace-global)
  const modelProfileRoutes = createModelProfileRoutes(modelProfileService);

  // Skills route using async FileSystemSkillLoader
  const skillRoutes = createSkillRoutes(skillLoader);

  app.use('/api', projectRoutes);
  app.use('/api', taskRoutes);
  app.use('/api', taskListRoutes);
  app.use('/api', taskGraphRoutes);
  app.use('/api', sessionRoutes);
  app.use('/api', skillRoutes);
  app.use('/api', orderingRoutes);
  app.use('/api', teamMemberRoutes);
  app.use('/api', teamRoutes);
  app.use('/api', modelProfileRoutes);
  app.use('/api/workflow-templates', createWorkflowTemplateRoutes());

  // Spell routes
  const spellRoutes = createSpellRoutes(container.spellService);
  app.use('/api', spellRoutes);

  // Master project cross-project routes
  const masterRoutes = createMasterRoutes(projectService, taskService, sessionService);
  app.use('/api', masterRoutes);

  // Voice / Alexa routes
  const alexaRoutes = createAlexaRoutes({
    announcementService: container.announcementService,
    alexaIngressService: container.alexaIngressService,
    logger,
  });
  app.use('/api', alexaRoutes);

  // Git integration routes
  const gitRoutes = createGitRoutes({
    sessionService,
    projectRepo,
    taskRepo,
    eventBus,
  });
  app.use('/api', gitRoutes);

  // Agent session-log routes — let the browser web-ui read claude/codex logs
  // (the Tauri shell uses Rust invoke commands; the browser has none).
  app.use('/api', createAgentLogRoutes());

  // Browser SPA static serve — mounted AFTER all API/WS/PTY routes.
  // Serves maestro-ui/dist so a browser can access the full app from the server origin.
  // Skipped gracefully if the dist folder hasn't been built yet.
  const uiDistPath = join(__dirname, '../../maestro-ui/dist');
  if (existsSync(uiDistPath)) {
    app.use(express.static(uiDistPath));
    // SPA fallback: serve index.html for any route that isn't /api, /ws, or /pty
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path.startsWith('/pty')) {
        return next();
      }
      res.sendFile(join(uiDistPath, 'index.html'));
    });
  } else {
    logger.info('maestro-ui/dist not found — browser SPA static serve skipped (run build:web to enable)');
  }

  // Global error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Server error:', err);
    errorHandler(err, req, res, next);
  });

  // Start HTTP server
  const server = app.listen(config.port, () => {
    // Write server URL to data dir so CLI can auto-discover it
    try {
      const serverUrlFile = `${config.dataDir}/server-url`;
      mkdirSync(dirname(serverUrlFile), { recursive: true });
      writeFileSync(serverUrlFile, config.serverUrl, 'utf-8');
    } catch (err) {
      // Ignore write failures
    }
  });

  // Start WebSocket servers. We route HTTP upgrades by path so the high-frequency
  // PTY stream (/pty) is isolated from the entity-sync bridge (everything else).
  const MAX_WS_CLIENTS = parseInt(process.env.MAX_WS_CLIENTS || '50', 10);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024, // 1MB max inbound message
  });
  // PTY channel allows larger inbound frames (e.g. pasted input) and never batches.
  const ptyWss = new WebSocketServer({
    noServer: true,
    maxPayload: 10 * 1024 * 1024,
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Auth gate for WS upgrades — same logic as the HTTP guard. Local CLI/tooling
    // on the loopback interface (no proxy headers) is trusted and bypasses auth.
    if (authService.enabled && !isTrustedLocalRequest(req)) {
      const cookieToken = authService.extractTokenFromCookie(req.headers.cookie as string | undefined);
      const queryToken = url.searchParams.get('token');
      const token = cookieToken || queryToken;
      if (!token || !authService.verifyToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    if (pathname === '/pty') {
      ptyWss.handleUpgrade(req, socket, head, (ws) => {
        ptyWss.emit('connection', ws, req);
      });
      return;
    }
    // Bridge channel: enforce the max-clients cap that verifyClient used to handle.
    if (wss.clients.size >= MAX_WS_CLIENTS) {
      logger.warn('WebSocket connection rejected: max clients reached', {
        current: wss.clients.size,
        max: MAX_WS_CLIENTS,
      });
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wsBridge = new WebSocketBridge(wss, eventBus, logger);
  new PtyWebSocketServer(ptyWss, ptyHostService, logger);

  // Graceful shutdown handler
  let isShuttingDown = false;
  const gracefulShutdown = async () => {
    if (isShuttingDown) {
      process.exit(1);
    }

    isShuttingDown = true;

    const forceExitTimeout = setTimeout(() => {
      process.exit(1);
    }, 5000);

    try {
      // Close WebSocket connections
      wss.clients.forEach(client => {
        client.close();
      });
      ptyWss.clients.forEach(client => {
        client.close();
      });

      // Clean up WebSocket bridge event listeners
      wsBridge.shutdown();

      wss.close(() => {});
      ptyWss.close(() => {});

      // Shutdown container (cleans up event bus)
      await container.shutdown();

      // Close HTTP server
      server.close(() => {
        clearTimeout(forceExitTimeout);
        process.exit(0);
      });
    } catch (err) {
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  };

  process.once('SIGINT', gracefulShutdown);
  process.once('SIGTERM', gracefulShutdown);

  return { app, server, container };
}

// Start server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
