import express, { Request, Response } from 'express';
import { QueueService } from '../application/services/QueueService';
import { SessionService } from '../application/services/SessionService';
import { AppError, ValidationError } from '../domain/common/Errors';

interface QueueRouteDependencies {
  queueService: QueueService;
  sessionService: SessionService;
}

/**
 * Create queue routes for managing session task queues.
 */
export function createQueueRoutes(deps: QueueRouteDependencies): express.Router {
  const { queueService, sessionService } = deps;
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

  // Helper to verify session has queue strategy
  const verifyQueueStrategy = async (sessionId: string): Promise<void> => {
    const session = await sessionService.getSession(sessionId);
    if (session.strategy !== 'queue') {
      throw new ValidationError(`Session ${sessionId} does not use queue strategy`);
    }
  };

  // Get queue state for a session
  router.get('/sessions/:id/queue', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await verifyQueueStrategy(sessionId);

      const queue = await queueService.getQueue(sessionId);
      const stats = await queueService.getStats(sessionId);

      res.json({ queue, stats });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get next item in queue (peek)
  router.get('/sessions/:id/queue/top', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await verifyQueueStrategy(sessionId);

      const item = await queueService.getTopItem(sessionId);

      if (!item) {
        return res.json({
          hasMore: false,
          item: null,
          message: 'Queue is empty - all tasks processed'
        });
      }

      res.json({
        hasMore: true,
        item
      });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Start processing next item
  router.post('/sessions/:id/queue/start', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await verifyQueueStrategy(sessionId);

      // Check if there's a next item before attempting start
      const topItem = await queueService.getTopItem(sessionId);
      if (!topItem) {
        return res.json({
          success: true,
          item: null,
          empty: true,
          message: 'Queue is empty — no items to process'
        });
      }

      const item = await queueService.startItem(sessionId);

      res.json({
        success: true,
        item,
        message: `Started processing task ${item.taskId}`
      });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Complete current item
  router.post('/sessions/:id/queue/complete', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await verifyQueueStrategy(sessionId);

      const item = await queueService.completeItem(sessionId);
      const nextItem = await queueService.getTopItem(sessionId);

      res.json({
        success: true,
        completedItem: item,
        nextItem,
        hasMore: nextItem !== null,
        message: nextItem
          ? `Completed ${item.taskId}. Next: ${nextItem.taskId}`
          : `Completed ${item.taskId}. Queue is empty.`
      });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Fail current item
  router.post('/sessions/:id/queue/fail', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { reason } = req.body;

      await verifyQueueStrategy(sessionId);

      const item = await queueService.failItem(sessionId, reason);
      const nextItem = await queueService.getTopItem(sessionId);

      res.json({
        success: true,
        failedItem: item,
        nextItem,
        hasMore: nextItem !== null,
        message: nextItem
          ? `Failed ${item.taskId}. Next: ${nextItem.taskId}`
          : `Failed ${item.taskId}. Queue is empty.`
      });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Skip current/next item
  router.post('/sessions/:id/queue/skip', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await verifyQueueStrategy(sessionId);

      const item = await queueService.skipItem(sessionId);
      const nextItem = await queueService.getTopItem(sessionId);

      res.json({
        success: true,
        skippedItem: item,
        nextItem,
        hasMore: nextItem !== null,
        message: nextItem
          ? `Skipped ${item.taskId}. Next: ${nextItem.taskId}`
          : `Skipped ${item.taskId}. Queue is empty.`
      });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // List all items in queue
  router.get('/sessions/:id/queue/items', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      await verifyQueueStrategy(sessionId);

      const items = await queueService.listItems(sessionId);
      const stats = await queueService.getStats(sessionId);

      res.json({ items, stats });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Push a new task into the queue
  router.post('/sessions/:id/queue/push', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.id as string;
      const { taskId } = req.body;
      await verifyQueueStrategy(sessionId);

      if (!taskId) {
        throw new ValidationError('taskId is required');
      }

      const item = await queueService.pushItem(sessionId, taskId);
      res.json({ success: true, item });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  return router;
}
