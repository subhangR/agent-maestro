import express, { Request, Response } from 'express';
import { EnsembleService } from '../application/services/EnsembleService';
import {
  validateBody,
  validateParams,
  idParamSchema,
  createEnsembleSchema,
  updateEnsembleSchema,
  ensembleMemberSchema,
  ensembleMessageSchema,
} from './validation';

export function createEnsembleRoutes(ensembleService: EnsembleService): express.Router {
  const router = express.Router();

  router.get('/ensembles', async (_req: Request, res: Response) => {
    try {
      res.json(await ensembleService.list());
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.get('/ensembles/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      res.json(await ensembleService.get(req.params.id as string));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.post('/ensembles', validateBody(createEnsembleSchema), async (req: Request, res: Response) => {
    try {
      const created = await ensembleService.create(req.body);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.put('/ensembles/:id', validateParams(idParamSchema), validateBody(updateEnsembleSchema), async (req: Request, res: Response) => {
    try {
      res.json(await ensembleService.update(req.params.id as string, req.body));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.post('/ensembles/:id/members', validateParams(idParamSchema), validateBody(ensembleMemberSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, castBy } = req.body as { sessionId: string; castBy?: string | null };
      res.json(await ensembleService.addMember(req.params.id as string, sessionId, castBy ?? null));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.delete('/ensembles/:id/members/:sessionId', async (req: Request, res: Response) => {
    try {
      // Two safe-id params — validate manually to keep the existing
      // idParamSchema (single-id) intact.
      const id = req.params.id as string;
      const sessionId = req.params.sessionId as string;
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
        return res.status(400).json({ error: true, code: 'VALIDATION_ERROR', message: 'Invalid id' });
      }
      res.json(await ensembleService.removeMember(id, sessionId));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.post('/ensembles/:id/disband', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      res.json(await ensembleService.disband(req.params.id as string));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  router.post('/ensembles/:id/message', validateParams(idParamSchema), validateBody(ensembleMessageSchema), async (req: Request, res: Response) => {
    try {
      res.json(await ensembleService.message(req.params.id as string, req.body));
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  return router;
}
