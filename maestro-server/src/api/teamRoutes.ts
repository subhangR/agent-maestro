import express, { Request, Response } from 'express';
import { TeamService } from '../application/services/TeamService';
import { handleRouteError } from './middleware/errorHandler';
import { validateParams, validateQuery, idParamSchema, paginationQuerySchema, extractPagination, paginate } from './validation';

/**
 * Create team routes using the TeamService.
 */
export function createTeamRoutes(teamService: TeamService) {
  const router = express.Router();

  /**
   * GET /teams?projectId=X
   * List all active teams for a project
   */
  router.get('/teams', validateQuery(paginationQuerySchema), async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId query parameter is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const teams = await teamService.getProjectTeams(projectId);
      if (req.query.limit || req.query.offset) {
        res.json(paginate(teams, extractPagination(req.query)));
      } else {
        res.json(teams);
      }
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /teams
   * Create a new team
   */
  router.post('/teams', async (req: Request, res: Response) => {
    try {
      const team = await teamService.createTeam(req.body);
      res.status(201).json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * GET /teams/:id?projectId=X
   * Get team by ID
   */
  router.get('/teams/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const projectId = req.query.projectId as string;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId query parameter is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.getTeam(projectId, id);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * GET /teams/:id/tree?projectId=X
   * Get the fully-resolved recursive team tree (hydrated members + nested sub-teams)
   */
  router.get('/teams/:id/tree', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const projectId = req.query.projectId as string;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId query parameter is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const tree = await teamService.getTeamTree(projectId, id);
      res.json(tree);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * PATCH /teams/:id
   * Update a team
   */
  router.patch('/teams/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, ...updates } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.updateTeam(projectId, id, updates);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * DELETE /teams/:id?projectId=X
   * Delete a team (must be archived first)
   */
  router.delete('/teams/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const projectId = req.query.projectId as string;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId query parameter is required',
          code: 'VALIDATION_ERROR'
        });
      }

      await teamService.deleteTeam(projectId, id);
      res.json({ success: true, id });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /teams/:id/archive
   * Archive a team
   */
  router.post('/teams/:id/archive', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.archiveTeam(projectId, id);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /teams/:id/unarchive
   * Unarchive a team
   */
  router.post('/teams/:id/unarchive', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.unarchiveTeam(projectId, id);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /teams/:id/members
   * Add members to a team
   */
  router.post('/teams/:id/members', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, memberIds } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({
          error: true,
          message: 'memberIds (string array) is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.addMembers(projectId, id, memberIds);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * DELETE /teams/:id/members
   * Remove members from a team
   */
  router.delete('/teams/:id/members', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, memberIds } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({
          error: true,
          message: 'memberIds (string array) is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.removeMembers(projectId, id, memberIds);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /teams/:id/sub-teams
   * Add a sub-team
   */
  router.post('/teams/:id/sub-teams', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, subTeamId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!subTeamId) {
        return res.status(400).json({
          error: true,
          message: 'subTeamId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.addSubTeam(projectId, id, subTeamId);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * DELETE /teams/:id/sub-teams
   * Remove a sub-team
   */
  router.delete('/teams/:id/sub-teams', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, subTeamId } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!subTeamId) {
        return res.status(400).json({
          error: true,
          message: 'subTeamId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      const team = await teamService.removeSubTeam(projectId, id, subTeamId);
      res.json(team);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  return router;
}
