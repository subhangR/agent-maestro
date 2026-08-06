import express, { Request, Response } from 'express';
import { TeamMemberService } from '../application/services/TeamMemberService';
import { handleRouteError } from './middleware/errorHandler';
import { validateBody, validateParams, validateQuery, idParamSchema, createTeamMemberSchema, updateTeamMemberSchema, memoryEntryParamSchema, editMemoryEntrySchema, paginationQuerySchema, extractPagination, paginate } from './validation';

/**
 * Create team member routes using the TeamMemberService.
 */
export function createTeamMemberRoutes(teamMemberService: TeamMemberService) {
  const router = express.Router();


  /**
   * GET /team-members?projectId=X
   * GET /team-members?scope=global  (list only global members)
   * List all team members (defaults merged + custom + global)
   */
  router.get('/team-members', validateQuery(paginationQuerySchema), async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const scope = req.query.scope as string | undefined;

      let members;
      if (scope === 'global') {
        const allMembers = projectId
          ? await teamMemberService.getProjectTeamMembers(projectId)
          : await teamMemberService.getGlobalTeamMembers();
        members = allMembers.filter(m => m.scope === 'global');
      } else if (projectId) {
        members = await teamMemberService.getProjectTeamMembers(projectId);
      } else {
        members = await teamMemberService.getGlobalTeamMembers();
      }

      if (req.query.limit || req.query.offset) {
        res.json(paginate(members, extractPagination(req.query)));
      } else {
        res.json(members);
      }
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /team-members
   * Create a custom team member
   */
  router.post('/team-members', validateBody(createTeamMemberSchema), async (req: Request, res: Response) => {
    try {
      const member = await teamMemberService.createTeamMember(req.body);
      res.status(201).json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * GET /team-members/:id?projectId=X
   * Get team member by ID (projectId optional — IDs are globally unique)
   */
  router.get('/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const projectId = req.query.projectId as string | undefined;

      const member = projectId
        ? await teamMemberService.getTeamMember(projectId, id)
        : await teamMemberService.getTeamMemberById(id);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * PATCH /team-members/:id
   * Update team member (custom or default override)
   */
  router.patch('/team-members/:id', validateParams(idParamSchema), validateBody(updateTeamMemberSchema), async (req: Request, res: Response) => {
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

      const member = await teamMemberService.updateTeamMember(projectId, id, updates);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * DELETE /team-members/:id
   * Delete team member (403 if default, 400 if not archived)
   */
  router.delete('/team-members/:id', async (req: Request, res: Response) => {
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

      await teamMemberService.deleteTeamMember(projectId, id);
      res.json({ success: true, id });
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /team-members/:id/archive
   * Archive a team member
   */
  router.post('/team-members/:id/archive', async (req: Request, res: Response) => {
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

      const member = await teamMemberService.archiveTeamMember(projectId, id);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /team-members/:id/unarchive
   * Unarchive a team member
   */
  router.post('/team-members/:id/unarchive', async (req: Request, res: Response) => {
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

      const member = await teamMemberService.unarchiveTeamMember(projectId, id);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /team-members/:id/memory
   * Append entries to a team member's memory
   */
  router.post('/team-members/:id/memory', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, entries } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!entries || !Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({
          error: true,
          message: 'entries (string array) is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      // Filter out empty entries
      const validEntries = entries.map((e: string) => (typeof e === 'string' ? e.trim() : '')).filter((e: string) => e.length > 0);
      if (validEntries.length === 0) {
        return res.status(400).json({
          error: true,
          message: 'All entries are empty after trimming',
          code: 'VALIDATION_ERROR'
        });
      }

      const member = await teamMemberService.appendMemory(projectId, id, validEntries);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * PATCH /team-members/:id/memory/:index
   * Edit a single memory entry in place, addressed by its 0-based index.
   */
  router.patch('/team-members/:id/memory/:index', validateParams(memoryEntryParamSchema), validateBody(editMemoryEntrySchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const index = Number(req.params.index);
      const { projectId, entry } = req.body;

      const member = await teamMemberService.editMemoryEntry(projectId, id, index, entry);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * DELETE /team-members/:id/memory/:index?projectId=X
   * Remove a single memory entry, addressed by its 0-based index.
   */
  router.delete('/team-members/:id/memory/:index', validateParams(memoryEntryParamSchema), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const index = Number(req.params.index);
      const projectId = req.query.projectId as string;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId query parameter is required',
          code: 'VALIDATION_ERROR'
        });
      }

      const member = await teamMemberService.removeMemoryEntry(projectId, id, index);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * PATCH /team-members/:id/scope
   * Toggle team member scope between 'project' and 'global'
   */
  router.patch('/team-members/:id/scope', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { projectId, scope } = req.body;

      if (!projectId) {
        return res.status(400).json({
          error: true,
          message: 'projectId is required in request body',
          code: 'VALIDATION_ERROR'
        });
      }

      if (!scope || !['project', 'global'].includes(scope)) {
        return res.status(400).json({
          error: true,
          message: 'scope must be "project" or "global"',
          code: 'VALIDATION_ERROR'
        });
      }

      const member = await teamMemberService.updateTeamMember(projectId, id, { scope });
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  /**
   * POST /team-members/:id/reset
   * Reset default team member to code values (404 if not default)
   */
  router.post('/team-members/:id/reset', async (req: Request, res: Response) => {
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

      const member = await teamMemberService.resetDefault(projectId, id);
      res.json(member);
    } catch (err: unknown) {
      handleRouteError(err, res);
    }
  });

  return router;
}
