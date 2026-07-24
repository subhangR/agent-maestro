import express, { Request, Response } from 'express';
import { CollabV2Service } from '../application/services/CollabV2Service';
import { ConfigError, ForbiddenError } from '../domain/common/Errors';
import { handleRouteError } from './middleware/errorHandler';
import { collabCollectionQuerySchema, collabCreateSpaceSchema, collabCreateTaskAxisSchema, collabCreateTaskSchema, collabEntityIdParamsSchema, collabEntityListQuerySchema, collabPointsSchema, collabPostMessageSchema, collabReactionSchema, collabSpaceIdParamsSchema, collabTaskIdParamsSchema, collabUpdateTaskSchema, extractPagination, paginationQuerySchema, validateBody, validateParams, validateQuery } from './validation';

/**
 * Stable V2 façade. The browser gives this local server its Firebase ID token in
 * X-Collab-Firebase-Token; the server forwards it to Supabase unchanged. This
 * preserves database RLS and deliberately avoids a server-side service role.
 */
export function createCollabV2Routes(service: CollabV2Service) {
  const router = express.Router();
  const credentials = (req: Request) => {
    const value = req.header('X-Collab-Firebase-Token');
    if (!value || value.length > 12_000) throw new ForbiddenError('X-Collab-Firebase-Token is required for Collab V2.');
    return { firebaseToken: value };
  };
  const ready = () => { if (!service.isConfigured()) throw new ConfigError('Collab V2 is disabled until Supabase configuration is supplied.'); };
  const route = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => { try { ready(); await fn(req, res); } catch (error) { handleRouteError(error, res); } };

  router.get('/collab/v2/health', (_req, res) => res.json({ enabled: service.isConfigured(), auth: 'firebase-token-forwarding', apiVersion: 'v2' }));
  router.get('/collab/v2/identity', route(async (req, res) => { res.json(await service.currentIdentity(credentials(req))); }));
  router.get('/collab/v2/spaces', route(async (req, res) => { res.json(await service.listSpaces(credentials(req))); }));
  router.post('/collab/v2/spaces', validateBody(collabCreateSpaceSchema), route(async (req, res) => { res.status(201).json(await service.createSpace(credentials(req), req.body)); }));
  router.post('/collab/v2/collections/query', validateBody(collabCollectionQuerySchema), route(async (req, res) => {
    const result = await service.queryCollection(credentials(req), { ...req.body, deleted: req.body.filters?.deleted });
    res.json({ data: result, requestId: req.get('X-Request-Id') || undefined });
  }));
  router.get('/collab/v2/spaces/:spaceId/entities', validateParams(collabSpaceIdParamsSchema), validateQuery(collabEntityListQuerySchema), route(async (req, res) => {
    const page = extractPagination(req.query); const parentId = req.query.parentId === 'null' ? null : typeof req.query.parentId === 'string' ? req.query.parentId : undefined;
    res.json(await service.listEntities(credentials(req), String(req.params.spaceId), { kind: req.query.kind as any, parentId, includeDeleted: String(req.query.includeDeleted) === 'true', ...page }));
  }));
  router.get('/collab/v2/spaces/:spaceId/activity', validateParams(collabSpaceIdParamsSchema), validateQuery(paginationQuerySchema), route(async (req, res) => { const page = extractPagination(req.query); res.json(await service.listActivity(credentials(req), String(req.params.spaceId), page.limit, page.offset)); }));
  router.get('/collab/v2/spaces/:spaceId/task-axes', validateParams(collabSpaceIdParamsSchema), route(async (req, res) => { res.json(await service.listTaskAxes(credentials(req), String(req.params.spaceId))); }));
  router.post('/collab/v2/spaces/:spaceId/task-axes', validateParams(collabSpaceIdParamsSchema), validateBody(collabCreateTaskAxisSchema), route(async (req, res) => { res.status(201).json(await service.createTaskAxis(credentials(req), String(req.params.spaceId), req.body)); }));
  router.post('/collab/v2/spaces/:spaceId/tasks', validateParams(collabSpaceIdParamsSchema), validateBody(collabCreateTaskSchema), route(async (req, res) => { res.status(201).json(await service.createTask(credentials(req), String(req.params.spaceId), req.body)); }));
  router.get('/collab/v2/entities/:entityId', validateParams(collabEntityIdParamsSchema), route(async (req, res) => { res.json(await service.getEntityView(credentials(req), String(req.params.entityId))); }));
  router.patch('/collab/v2/tasks/:taskId', validateParams(collabTaskIdParamsSchema), validateBody(collabUpdateTaskSchema), route(async (req, res) => { res.json(await service.updateTask(credentials(req), String(req.params.taskId), req.body)); }));
  router.post('/collab/v2/entities/:entityId/messages', validateParams(collabEntityIdParamsSchema), validateBody(collabPostMessageSchema), route(async (req, res) => { res.status(201).json(await service.postMessage(credentials(req), String(req.params.entityId), req.body)); }));
  router.post('/collab/v2/entities/:entityId/reactions', validateParams(collabEntityIdParamsSchema), validateBody(collabReactionSchema), route(async (req, res) => { res.json(await service.react(credentials(req), String(req.params.entityId), req.body)); }));
  router.post('/collab/v2/entities/:entityId/points', validateParams(collabEntityIdParamsSchema), validateBody(collabPointsSchema), route(async (req, res) => { res.status(201).json(await service.grantPoints(credentials(req), String(req.params.entityId), req.body)); }));
  return router;
}
