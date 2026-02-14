import express, { Request, Response } from 'express';
import { ISkillLoader } from '../domain/services/ISkillLoader';

/**
 * Create skill routes using the ISkillLoader.
 */
export function createSkillRoutes(skillLoader: ISkillLoader): express.Router {
  const router = express.Router();

  /**
   * GET /api/skills
   * Returns array of available skills with full metadata (Claude Code format)
   */
  router.get('/skills', async (req: Request, res: Response) => {
    try {
      const skillIds = await skillLoader.listAvailable();

      // Load skill metadata for each skill
      const skills = [];

      for (const id of skillIds) {
        try {
          const skill = await skillLoader.load(id);
          if (skill && skill.manifest) {
            skills.push({
              id,
              name: skill.manifest.name || id,
              description: skill.manifest.description || '',
              version: skill.manifest.version || '1.0.0',
              // Extract Claude Code specific metadata from config
              triggers: skill.manifest.config?.triggers,
              role: skill.manifest.config?.role,
              scope: skill.manifest.config?.scope,
              outputFormat: skill.manifest.config?.outputFormat,
              language: skill.manifest.config?.language,
              framework: skill.manifest.config?.framework,
              tags: skill.manifest.config?.tags,
              category: skill.manifest.config?.category,
              license: skill.manifest.license,
              content: skill.instructions,
              // TODO: Check for references directory
              hasReferences: false,
              referenceCount: 0,
            });
          }
        } catch (err) {
          // Skip skills that fail to load
          console.warn(`[Skills API] Failed to load skill ${id}:`, err);
        }
      }

      res.json(skills);
    } catch (err) {
      console.error('[Skills API] Failed to list skills:', err);
      // Return empty array if skills directory is missing or error occurs
      res.json([]);
    }
  });

  /**
   * GET /api/skills/:id
   * Returns a single skill by ID
   */
  router.get('/skills/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const skill = await skillLoader.load(id);

      if (!skill) {
        return res.status(404).json({
          error: true,
          message: `Skill not found: ${id}`,
          code: 'NOT_FOUND'
        });
      }

      res.json({
        id,
        name: skill.manifest.name || id,
        description: skill.manifest.description || '',
        type: skill.manifest.type || 'system',
        version: skill.manifest.version || '1.0.0',
        instructions: skill.instructions
      });
    } catch (err: any) {
      console.error(`[Skills API] Failed to load skill:`, err);
      res.status(500).json({
        error: true,
        message: err.message,
        code: 'INTERNAL_ERROR'
      });
    }
  });

  /**
   * GET /api/skills/role/:role
   * Returns skills for a specific role (worker or orchestrator)
   */
  router.get('/skills/role/:role', async (req: Request, res: Response) => {
    try {
      const role = req.params.role as string;

      if (role !== 'worker' && role !== 'orchestrator') {
        return res.status(400).json({
          error: true,
          message: 'Role must be "worker" or "orchestrator"',
          code: 'VALIDATION_ERROR'
        });
      }

      const skills = await skillLoader.loadForRole(role);

      const result = skills.map(skill => ({
        id: skill.manifest.name,
        name: skill.manifest.name,
        description: skill.manifest.description || '',
        type: skill.manifest.type || 'system',
        version: skill.manifest.version || '1.0.0',
      }));

      res.json(result);
    } catch (err: any) {
      console.error('[Skills API] Failed to load role skills:', err);
      res.status(500).json({
        error: true,
        message: err.message,
        code: 'INTERNAL_ERROR'
      });
    }
  });

  /**
   * POST /api/skills/:id/reload
   * Reload a skill (clears cache and reloads from disk)
   */
  router.post('/skills/:id/reload', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;

      if (!skillLoader.reload) {
        return res.status(501).json({
          error: true,
          message: 'Reload not supported by this skill loader',
          code: 'NOT_IMPLEMENTED'
        });
      }

      const skill = await skillLoader.reload(id);

      if (!skill) {
        return res.status(404).json({
          error: true,
          message: `Skill not found: ${id}`,
          code: 'NOT_FOUND'
        });
      }

      res.json({
        id,
        name: skill.manifest.name || id,
        description: skill.manifest.description || '',
        type: skill.manifest.type || 'system',
        version: skill.manifest.version || '1.0.0',
        reloaded: true
      });
    } catch (err: any) {
      console.error(`[Skills API] Failed to reload skill:`, err);
      res.status(500).json({
        error: true,
        message: err.message,
        code: 'INTERNAL_ERROR'
      });
    }
  });

  return router;
}
