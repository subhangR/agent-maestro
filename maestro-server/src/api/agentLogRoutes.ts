import express, { Request, Response } from 'express';
import { z } from 'zod';
import { AgentLogService } from '../application/services/AgentLogService';
import { handleRouteError } from './middleware/errorHandler';
import { validateQuery } from './validation';

const providerSchema = z.enum(['claude', 'codex']).default('claude');

const listQuerySchema = z.object({
  provider: providerSchema,
  cwd: z.string().min(1),
});

const readQuerySchema = z.object({
  provider: providerSchema,
  cwd: z.string().min(1),
  filename: z.string().min(1),
});

const tailQuerySchema = z.object({
  provider: providerSchema,
  cwd: z.string().min(1),
  filename: z.string().min(1),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * REST endpoints that expose agent session logs to the browser web-ui, mirroring
 * the Tauri Rust commands (list/read/tail for claude & codex). These let the
 * Session Log strip render outside the Tauri desktop shell.
 */
export function createAgentLogRoutes() {
  const service = new AgentLogService();
  const router = express.Router();

  router.get('/agent-logs/list', validateQuery(listQuerySchema), async (req: Request, res: Response) => {
    try {
      const { provider, cwd } = listQuerySchema.parse(req.query);
      res.json(await service.list(provider, cwd));
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.get('/agent-logs/read', validateQuery(readQuerySchema), async (req: Request, res: Response) => {
    try {
      const { provider, cwd, filename } = readQuerySchema.parse(req.query);
      const content = await service.read(provider, cwd, filename);
      res.json({ content });
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.get('/agent-logs/tail', validateQuery(tailQuerySchema), async (req: Request, res: Response) => {
    try {
      const { provider, cwd, filename, offset } = tailQuerySchema.parse(req.query);
      res.json(await service.tail(provider, cwd, filename, offset));
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  return router;
}
