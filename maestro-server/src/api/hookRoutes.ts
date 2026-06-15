import express, { Request, Response } from 'express';
import { HookDispatcherService } from '../application/services/HookDispatcherService';
import { validateBody, hookDispatchSchema } from './validation';

/**
 * POST /api/hooks/dispatch — the single endpoint every Claude hook hits.
 *
 * Request:  { sessionId, event, payload? }
 * Response: DispatchResult — see types.ts. The CLI maps that into:
 *   - exit 0 + stdout when blocked=false && continued=false
 *   - exit 2 + stderr "reason" + (stdout when continued) when blocked || continued
 */
export function createHookRoutes(dispatcher: HookDispatcherService): express.Router {
  const router = express.Router();

  router.post('/hooks/dispatch', validateBody(hookDispatchSchema), async (req: Request, res: Response) => {
    try {
      const result = await dispatcher.dispatch(req.body);
      res.json(result);
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
