import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createContainer, Container } from './container';
import { createProjectRoutes } from './api/projectRoutes';
import { createTaskRoutes } from './api/taskRoutes';
import { createTaskListRoutes } from './api/taskListRoutes';
import { createSessionRoutes } from './api/sessionRoutes';

import { createSkillRoutes } from './api/skillRoutes';
import { createOrderingRoutes } from './api/orderingRoutes';
import { createTeamMemberRoutes } from './api/teamMemberRoutes';
import { createTeamRoutes } from './api/teamRoutes';
import { createWorkflowTemplateRoutes } from './api/workflowTemplateRoutes';
import { createMasterRoutes } from './api/masterRoutes';
import { createSpellRoutes } from './api/spellRoutes';
import { WebSocketBridge } from './infrastructure/websocket/WebSocketBridge';
import { errorHandler } from './api/middleware/errorHandler';

async function startServer() {
  // Create and initialize dependency container
  const container = await createContainer();
  await container.initialize();

  const { config, logger, eventBus, projectService, taskService, taskListService, sessionService, logDigestService, orderingService, teamMemberService, teamService, projectRepo, taskRepo, teamMemberRepo, skillLoader } = container;

  // Create Express app
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS configuration for Tauri app and web clients
  // NOTE: CORS must be registered before rate limiting so preflight OPTIONS
  // requests always get proper CORS headers and are not blocked by 429.
  app.use(cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'tauri://localhost',
        'http://localhost:1420',
        'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:4567',
        'http://localhost:4568',
        'http://localhost:4569',
        'http://localhost:5173',
        'http://127.0.0.1:1420',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:4567',
        'http://127.0.0.1:4568',
        'http://127.0.0.1:4569',
        'http://127.0.0.1:5173'
      ];

      // Allow requests with no origin (like mobile apps or curl)
      if (!origin || allowedOrigins.includes(origin)) {
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
  const projectRoutes = createProjectRoutes(projectService);
  const taskRoutes = createTaskRoutes(taskService, sessionService, config.dataDir);
  const taskListRoutes = createTaskListRoutes(taskListService);
  const sessionRoutes = createSessionRoutes({
    sessionService,
    logDigestService,
    projectRepo,
    taskRepo,
    teamMemberRepo,
    eventBus,
    config
  });

  // Ordering routes
  const orderingRoutes = createOrderingRoutes(orderingService);

  // Team member routes
  const teamMemberRoutes = createTeamMemberRoutes(teamMemberService);

  // Team routes
  const teamRoutes = createTeamRoutes(teamService);

  // Skills route using async FileSystemSkillLoader
  const skillRoutes = createSkillRoutes(skillLoader);

  app.use('/api', projectRoutes);
  app.use('/api', taskRoutes);
  app.use('/api', taskListRoutes);
  app.use('/api', sessionRoutes);
  app.use('/api', skillRoutes);
  app.use('/api', orderingRoutes);
  app.use('/api', teamMemberRoutes);
  app.use('/api', teamRoutes);
  app.use('/api/workflow-templates', createWorkflowTemplateRoutes());

  // Spell routes
  const spellRoutes = createSpellRoutes(container.spellService);
  app.use('/api', spellRoutes);

  // Master project cross-project routes
  const masterRoutes = createMasterRoutes(projectService, taskService, sessionService);
  app.use('/api', masterRoutes);

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

  // Start WebSocket server with event bus bridge
  const MAX_WS_CLIENTS = parseInt(process.env.MAX_WS_CLIENTS || '50', 10);
  const wss = new WebSocketServer({
    server,
    maxPayload: 1024 * 1024, // 1MB max inbound message
    verifyClient: (_info: any, cb: (result: boolean, code?: number, message?: string) => void) => {
      if (wss.clients.size >= MAX_WS_CLIENTS) {
        logger.warn('WebSocket connection rejected: max clients reached', {
          current: wss.clients.size,
          max: MAX_WS_CLIENTS,
        });
        cb(false, 429, 'Too many WebSocket connections');
      } else {
        cb(true);
      }
    },
  });
  wsBridge = new WebSocketBridge(wss, eventBus, logger);

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

      // Clean up WebSocket bridge event listeners
      wsBridge.shutdown();

      wss.close(() => {});

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
