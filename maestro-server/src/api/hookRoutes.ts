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
      // C2: a dry-run is side-effect-free (matching + composition only, executes
      // nothing), so the self-only guard is bypassed — any client (incl. the UI)
      // may probe any session's rules. Live dispatch keeps the guard below.
      if (!req.body.dryRun) {
        // Inter-session isolation: the CLI's hook command already sends
        // X-Session-Id (hook.ts) with the same value it puts in the body.
        // Require them to match so one session can't drive another session's
        // continue-loop/inject/notify side effects. Mirrors the mode_self_only
        // gate on POST /sessions/:id/mode.
        const callerSessionId = req.headers['x-session-id'];
        const caller = Array.isArray(callerSessionId) ? callerSessionId[0] : callerSessionId;
        if (!caller || caller !== req.body.sessionId) {
          return res.status(403).json({
            error: true,
            code: 'hook_self_only',
            message: 'Hook dispatch is only permitted for your own session',
          });
        }
      }
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
