import express, { Request, Response } from 'express';
import { TemplateService } from '../application/services/TemplateService';
import { AppError } from '../domain/common/Errors';
import { TemplateRole } from '../types';

interface TemplateRouteDependencies {
  templateService: TemplateService;
}

/**
 * Create template routes using the TemplateService.
 */
export function createTemplateRoutes(deps: TemplateRouteDependencies): express.Router {
  const { templateService } = deps;
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

  // List all templates
  router.get('/templates', async (req: Request, res: Response) => {
    try {
      const templates = await templateService.listTemplates();
      res.json(templates);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get template by ID
  router.get('/templates/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const template = await templateService.getTemplate(id);
      res.json(template);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get template by role
  router.get('/templates/role/:role', async (req: Request, res: Response) => {
    try {
      const role = req.params.role as TemplateRole;

      if (role !== 'worker' && role !== 'orchestrator') {
        return res.status(400).json({
          error: true,
          message: 'Invalid role. Must be "worker" or "orchestrator"',
          code: 'VALIDATION_ERROR'
        });
      }

      const template = await templateService.getTemplateByRole(role);
      res.json(template);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Create template
  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const { name, role, content } = req.body;

      if (!name || !role || !content) {
        return res.status(400).json({
          error: true,
          message: 'name, role, and content are required',
          code: 'VALIDATION_ERROR'
        });
      }

      if (role !== 'worker' && role !== 'orchestrator') {
        return res.status(400).json({
          error: true,
          message: 'Invalid role. Must be "worker" or "orchestrator"',
          code: 'VALIDATION_ERROR'
        });
      }

      const template = await templateService.createTemplate({ name, role, content });
      res.status(201).json(template);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Update template
  router.put('/templates/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, content } = req.body;

      if (!name && !content) {
        return res.status(400).json({
          error: true,
          message: 'At least one of name or content is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const updates: { name?: string; content?: string } = {};
      if (name !== undefined) updates.name = name;
      if (content !== undefined) updates.content = content;

      const template = await templateService.updateTemplate(id, updates);
      res.json(template);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Reset template to default
  router.post('/templates/:id/reset', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const template = await templateService.resetTemplate(id);
      res.json(template);
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Delete template
  router.delete('/templates/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await templateService.deleteTemplate(id);
      res.json({ success: true, id });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  // Get default content for a role (without creating a template)
  router.get('/templates/default/:role', async (req: Request, res: Response) => {
    try {
      const role = req.params.role as TemplateRole;

      if (role !== 'worker' && role !== 'orchestrator') {
        return res.status(400).json({
          error: true,
          message: 'Invalid role. Must be "worker" or "orchestrator"',
          code: 'VALIDATION_ERROR'
        });
      }

      const content = templateService.getDefaultContent(role);
      res.json({ role, content });
    } catch (err: any) {
      handleError(err, res);
    }
  });

  return router;
}
