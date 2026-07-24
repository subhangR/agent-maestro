import express, { Request, Response } from 'express';
import { CollabV2Service } from '../application/services/CollabV2Service';
import { ConfigError, ForbiddenError } from '../domain/common/Errors';
import { handleRouteError } from './middleware/errorHandler';
import { collabActorCommandSchema, collabCollectionQuerySchema, collabCompleteTaskSchema, collabCreateChannelSchema, collabCreateDocumentSchema, collabCreateFileSchema, collabCreateSpaceSchema, collabCreateTaskAxisSchema, collabCreateTaskSchema, collabDiscoverQuerySchema, collabEdgeCreateSchema, collabEdgeIdParamsSchema, collabEdgeUpdateSchema, collabEntityIdParamsSchema, collabEntityListQuerySchema, collabEventsQuerySchema, collabGraphQuerySchema, collabInboxQuerySchema, collabNotificationIdParamsSchema, collabPlacementSchema, collabPointsSchema, collabPostMessageSchema, collabPullSchema, collabReactionSchema, collabSpaceIdParamsSchema, collabTaskIdParamsSchema, collabTrackingRefreshSchema, collabUpdateDocumentSchema, collabUpdateFileSchema, collabUpdateTaskSchema, collabWorkSchema, collabMoveSchema, extractPagination, paginationQuerySchema, validateBody, validateParams, validateQuery } from './validation';

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
    const firebaseUid = req.header('X-Collab-Firebase-Uid')?.trim();
    if (firebaseUid && (firebaseUid.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(firebaseUid))) {
      throw new ForbiddenError('X-Collab-Firebase-Uid is invalid.');
    }
    return { firebaseToken: value, ...(firebaseUid ? { firebaseUid } : {}) };
  };
  const ready = () => { if (!service.isConfigured()) throw new ConfigError('Collab V2 is disabled until Supabase configuration is supplied.'); };
  const route = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => { try { ready(); await fn(req, res); } catch (error) { handleRouteError(error, res); } };

  router.get('/collab/v2/health', (_req, res) => res.json({
    enabled: service.isConfigured(),
    auth: process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS === 'true' ? 'insecure-firebase-uid-bypass' : 'firebase-token-forwarding',
    apiVersion: 'v2',
  }));
  router.get('/collab/v2/identity', route(async (req, res) => { res.json(await service.currentIdentity(credentials(req))); }));
  router.get('/collab/v2/spaces/discover', validateQuery(collabDiscoverQuerySchema), route(async (req, res) => { res.json(await service.discoverSpaces(credentials(req), typeof req.query.githubRepo === 'string' ? req.query.githubRepo : undefined)); }));
  router.get('/collab/v2/spaces', route(async (req, res) => { res.json(await service.listSpaces(credentials(req))); }));
  router.post('/collab/v2/spaces', validateBody(collabCreateSpaceSchema), route(async (req, res) => { res.status(201).json(await service.createSpace(credentials(req), req.body)); }));
  router.post('/collab/v2/spaces/:spaceId/join', validateParams(collabSpaceIdParamsSchema), route(async (req, res) => { res.json(await service.joinSpace(credentials(req), String(req.params.spaceId))); }));
  router.get('/collab/v2/spaces/:spaceId/identity', validateParams(collabSpaceIdParamsSchema), route(async (req, res) => { res.json(await service.currentSpaceIdentity(credentials(req), String(req.params.spaceId))); }));
  router.get('/collab/v2/spaces/:spaceId/navigation', validateParams(collabSpaceIdParamsSchema), route(async (req, res) => { res.json(await service.navigation(credentials(req), String(req.params.spaceId))); }));
  router.get('/collab/v2/spaces/:spaceId/events', validateParams(collabSpaceIdParamsSchema), validateQuery(collabEventsQuerySchema), route(async (req, res) => { res.json(await service.events(credentials(req), String(req.params.spaceId), typeof req.query.cursor === 'string' ? req.query.cursor : undefined, Number(req.query.limit) || 100)); }));
  router.post('/collab/v2/collections/query', validateBody(collabCollectionQuerySchema), route(async (req, res) => {
    const result = await service.queryCollection(credentials(req), { ...req.body, deleted: req.body.filters?.deleted });
    res.json({ data: result, requestId: req.get('X-Request-Id') || undefined });
  }));
  router.post('/collab/v2/graph/query', validateBody(collabGraphQuerySchema), route(async (req, res) => { res.json({ data: await service.graph(credentials(req), req.body), requestId: req.get('X-Request-Id') || undefined }); }));
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
  router.post('/collab/v2/edges', validateBody(collabEdgeCreateSchema), route(async (req, res) => { res.status(201).json(await service.writeEdge(credentials(req), req.body)); }));
  router.patch('/collab/v2/edges/:edgeId', validateParams(collabEdgeIdParamsSchema), validateBody(collabEdgeUpdateSchema), route(async (req, res) => { res.json(await service.updateEdge(credentials(req), String(req.params.edgeId), req.body)); }));
  router.delete('/collab/v2/edges/:edgeId', validateParams(collabEdgeIdParamsSchema), validateBody(collabActorCommandSchema), route(async (req, res) => { res.json(await service.deleteEdge(credentials(req), String(req.params.edgeId), req.body)); }));
  router.post('/collab/v2/placements', validateBody(collabPlacementSchema), route(async (req, res) => { res.status(201).json(await service.place(credentials(req), req.body)); }));
  router.post('/collab/v2/entities/:entityId/move', validateParams(collabEntityIdParamsSchema), validateBody(collabMoveSchema), route(async (req, res) => { res.json(await service.move(credentials(req), String(req.params.entityId), req.body)); }));
  router.post('/collab/v2/tasks/:taskId/complete', validateParams(collabTaskIdParamsSchema), validateBody(collabCompleteTaskSchema), route(async (req, res) => { res.json(await service.completeTask(credentials(req), String(req.params.taskId), req.body)); }));
  router.post('/collab/v2/entities/:entityId/pulls', validateParams(collabEntityIdParamsSchema), validateBody(collabPullSchema), route(async (req, res) => { res.json(await service.setPull(credentials(req), String(req.params.entityId), req.body)); }));
  router.post('/collab/v2/entities/:entityId/work', validateParams(collabEntityIdParamsSchema), validateBody(collabWorkSchema), route(async (req, res) => { res.json(await service.setWork(credentials(req), String(req.params.entityId), req.body)); }));
  router.post('/collab/v2/spaces/:spaceId/docs', validateParams(collabSpaceIdParamsSchema), validateBody(collabCreateDocumentSchema), route(async (req, res) => { res.status(201).json(await service.createDocument(credentials(req), String(req.params.spaceId), req.body)); }));
  router.post('/collab/v2/spaces/:spaceId/files', validateParams(collabSpaceIdParamsSchema), validateBody(collabCreateFileSchema), route(async (req, res) => { res.status(201).json(await service.createFile(credentials(req), String(req.params.spaceId), req.body)); }));
  router.post('/collab/v2/spaces/:spaceId/channels', validateParams(collabSpaceIdParamsSchema), validateBody(collabCreateChannelSchema), route(async (req, res) => { res.status(201).json(await service.createChannel(credentials(req), String(req.params.spaceId), req.body)); }));
  router.patch('/collab/v2/docs/:entityId', validateParams(collabEntityIdParamsSchema), validateBody(collabUpdateDocumentSchema), route(async (req, res) => { res.json(await service.updateDocument(credentials(req), String(req.params.entityId), req.body)); }));
  router.patch('/collab/v2/files/:entityId', validateParams(collabEntityIdParamsSchema), validateBody(collabUpdateFileSchema), route(async (req, res) => { res.json(await service.updateFile(credentials(req), String(req.params.entityId), req.body)); }));
  router.get('/collab/v2/inbox', validateQuery(collabInboxQuerySchema), route(async (req, res) => { res.json(await service.inbox(credentials(req), String(req.query.spaceId), typeof req.query.cursor === 'string' ? req.query.cursor : undefined, Number(req.query.limit) || 50)); }));
  router.put('/collab/v2/inbox/:notificationId/read', validateParams(collabNotificationIdParamsSchema), route(async (req, res) => { res.json(await service.markNotificationRead(credentials(req), String(req.params.notificationId))); }));
  router.put('/collab/v2/read-marks/:entityId', validateParams(collabEntityIdParamsSchema), route(async (req, res) => { res.json(await service.markRead(credentials(req), String(req.params.entityId))); }));
  router.post('/collab/v2/tracking/refresh', validateBody(collabTrackingRefreshSchema), route(async (req, res) => { res.status(202).json(await service.refreshTracking(credentials(req), req.body)); }));
  return router;
}
