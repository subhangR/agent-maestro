import express, { Request, Response } from 'express';
import { TaskService } from '../application/services/TaskService';
import { SessionService } from '../application/services/SessionService';
import { TaskStatus } from '../types';
import { AppError } from '../domain/common/Errors';

/**
 * Create task routes using the TaskService.
 */
export function createTaskRoutes(taskService: TaskService, sessionService?: SessionService): express.Router {
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

  // List tasks
  router.get('/tasks', async (req: Request, res: Response) => {
    try {
      const filter: any = {};

      if (req.query.projectId) {
        filter.projectId = req.query.projectId as string;
      }

      if (req.query.status) {
        filter.status = req.query.status as TaskStatus;
      }

      if (req.query.parentId !== undefined) {
        filter.parentId = req.query.parentId === 'null' ? null : req.query.parentId as string;
      }

      const tasks = await taskService.listTasks(filter);
      res.json(tasks);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Create task
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const task = await taskService.createTask(req.body);
      res.status(201).json(task);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get task by ID
  router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const task = await taskService.getTask(id);
      res.json(task);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Update task
  router.patch('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      // If a session reports status for a task it is not yet linked to,
      // auto-associate it so UI/session queries remain consistent.
      if (sessionService && req.body?.updateSource === 'session' && req.body?.sessionId) {
        const sessionId = req.body.sessionId as string;
        const session = await sessionService.getSession(sessionId);
        if (!session.taskIds.includes(id)) {
          await sessionService.addTaskToSession(sessionId, id);
        }
      }

      const task = await taskService.updateTask(id, req.body);
      res.json(task);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Add timeline event to task (proxies to session timeline)
  router.post('/tasks/:id/timeline', async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;
      const { type = 'progress', message, sessionId } = req.body;

      if (!message) {
        return res.status(400).json({
          error: true,
          message: 'message is required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!sessionId) {
        return res.status(400).json({
          error: true,
          message: 'sessionId is required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Verify task exists
      await taskService.getTask(taskId);

      // Forward to session timeline if sessionService is available
      if (sessionService) {
        const session = await sessionService.addTimelineEvent(
          sessionId,
          type,
          message,
          taskId
        );
        res.json({ success: true, taskId, sessionId, message, type });
      } else {
        // No session service available, return success without persisting
        res.json({ success: true, taskId, message, type });
      }
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get docs for a task (aggregated from all sessions working on this task)
  router.get('/tasks/:id/docs', async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id as string;

      // Verify task exists
      await taskService.getTask(taskId);

      // Get all sessions for this task and aggregate docs
      const docs: any[] = [];
      if (sessionService) {
        const sessions = await sessionService.listSessionsByTask(taskId);
        for (const session of sessions) {
          if (session.docs) {
            for (const doc of session.docs) {
              if (!doc.taskId || doc.taskId === taskId) {
                docs.push({ ...doc, sessionId: session.id, sessionName: session.name });
              }
            }
          }
        }
      }

      // Sort by addedAt
      docs.sort((a, b) => a.addedAt - b.addedAt);
      res.json(docs);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Delete task
  router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await taskService.deleteTask(id);
      res.json({ success: true, id });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get child tasks
  router.get('/tasks/:id/children', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      // First verify parent exists
      await taskService.getTask(id);

      const childTasks = await taskService.listChildTasks(id);
      res.json(childTasks);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  return router;
}
