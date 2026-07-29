import express, { Request, Response } from 'express';
import { z } from 'zod';
import { TokenAnalyticsService } from '../application/services/TokenAnalyticsService';
import { handleRouteError } from './middleware/errorHandler';
import { validateParams, validateQuery, idParamSchema } from './validation';

const windowQuerySchema = z.object({
  windowMs: z.coerce.number().int().min(60_000).max(30 * 24 * 60 * 60 * 1000)
    .optional().default(24 * 60 * 60 * 1000),
});

export function createTokenAnalyticsRoutes(service: TokenAnalyticsService) {
  const router = express.Router();

  router.get('/analytics/tokens/global', validateQuery(windowQuerySchema),
    async (req: Request, res: Response) => {
      try {
        const { windowMs } = windowQuerySchema.parse(req.query);
        res.json(await service.getGlobalSummary(windowMs));
      } catch (err) { handleRouteError(err, res); }
    },
  );

  router.get('/analytics/tokens/tasks/:id', validateParams(idParamSchema),
    async (req: Request, res: Response) => {
      try {
        res.json(await service.getTaskTokenSummary(req.params.id as string));
      } catch (err) { handleRouteError(err, res); }
    },
  );

  return router;
}
