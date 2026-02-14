import express, { Request, Response, NextFunction } from 'express';
import { ProjectService } from '../application/services/ProjectService';
import { AppError } from '../domain/common/Errors';

/**
 * Create project routes using the ProjectService.
 */
export function createProjectRoutes(projectService: ProjectService): express.Router {
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

  // List projects
  router.get('/projects', async (req: Request, res: Response) => {
    try {
      const projects = await projectService.listProjects();
      res.json(projects);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Create project
  router.post('/projects', async (req: Request, res: Response) => {
    try {
      const project = await projectService.createProject(req.body);
      res.status(201).json(project);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get project by ID
  router.get('/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const project = await projectService.getProject(id);
      res.json(project);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Update project
  router.put('/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const project = await projectService.updateProject(id, req.body);
      res.json(project);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Delete project
  router.delete('/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await projectService.deleteProject(id);
      res.json({ success: true, id });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  return router;
}
