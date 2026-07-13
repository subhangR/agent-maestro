import express, { Request, Response } from 'express';
import { SpellService } from '../application/services/SpellService';
import { SpellEntityType } from '../types';
import {
  validateBody,
  validateParams,
  validateQuery,
  invokeSpellSchema,
  listSpellEntitiesQuerySchema,
  listSpellDefinitionsQuerySchema,
  createCustomPromptSchema,
  updateCustomPromptSchema,
  createSpellSchema,
  updateSpellSchema,
  spellActivationSchema,
  toggleSpellSchema,
  resetLoopSchema,
  idParamSchema,
} from './validation';

export function createSpellRoutes(spellService: SpellService): express.Router {
  const router = express.Router();

  // GET /api/spells/definitions
  router.get('/spells/definitions', validateQuery(listSpellDefinitionsQuerySchema), async (req: Request, res: Response) => {
    try {
      const entityType = req.query.entityType as SpellEntityType | undefined;
      const definitions = spellService.getSpellDefinitions(entityType);
      res.json(definitions);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // GET /api/spells/entities/:type
  router.get('/spells/entities/:type', validateQuery(listSpellEntitiesQuerySchema), async (req: Request, res: Response) => {
    try {
      const type = req.params.type as SpellEntityType;
      const projectId = req.query.projectId as string;
      const entities = await spellService.listEntities(type, projectId);
      res.json(entities);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells/invoke
  router.post('/spells/invoke', validateBody(invokeSpellSchema), async (req: Request, res: Response) => {
    try {
      const result = await spellService.invoke(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // GET /api/spells/custom-prompts
  router.get('/spells/custom-prompts', async (_req: Request, res: Response) => {
    try {
      const prompts = await spellService.listCustomPrompts();
      res.json(prompts);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells/custom-prompts
  router.post('/spells/custom-prompts', validateBody(createCustomPromptSchema), async (req: Request, res: Response) => {
    try {
      const prompt = await spellService.createCustomPrompt(req.body);
      res.status(201).json(prompt);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // PUT /api/spells/custom-prompts/:id
  router.put('/spells/custom-prompts/:id', validateParams(idParamSchema), validateBody(updateCustomPromptSchema), async (req: Request, res: Response) => {
    try {
      const prompt = await spellService.updateCustomPrompt(req.params.id as string, req.body);
      res.json(prompt);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // DELETE /api/spells/custom-prompts/:id
  router.delete('/spells/custom-prompts/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      await spellService.deleteCustomPrompt(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // --- Spell (first-class entity) CRUD + activation (P1 foundation) ---

  // GET /api/spells — list curated library + user-created spells
  router.get('/spells', async (_req: Request, res: Response) => {
    try {
      const spells = await spellService.listSpells();
      res.json(spells);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // GET /api/spells/:id
  router.get('/spells/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const spell = await spellService.getSpell(req.params.id as string);
      res.json(spell);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells — create a custom spell
  router.post('/spells', validateBody(createSpellSchema), async (req: Request, res: Response) => {
    try {
      const spell = await spellService.createSpell(req.body);
      res.status(201).json(spell);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // PUT /api/spells/:id — update a spell (seed spells keep isDefault)
  router.put('/spells/:id', validateParams(idParamSchema), validateBody(updateSpellSchema), async (req: Request, res: Response) => {
    try {
      const spell = await spellService.updateSpell(req.params.id as string, req.body);
      res.json(spell);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // DELETE /api/spells/:id — guarded for seed-library spells
  router.delete('/spells/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      await spellService.deleteSpell(req.params.id as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells/:id/activate — body: { targetSessionIds[], invokerSessionId?, castMode?, ensembleName? }
  router.post('/spells/:id/activate', validateParams(idParamSchema), validateBody(spellActivationSchema), async (req: Request, res: Response) => {
    try {
      const { targetSessionIds, invokerSessionId, castMode, ensembleName } = req.body as {
        targetSessionIds: string[];
        invokerSessionId?: string;
        castMode?: 'single' | 'broadcast' | 'coordinate';
        ensembleName?: string;
      };
      const result = await spellService.activateSpell(
        req.params.id as string,
        targetSessionIds,
        invokerSessionId ?? null,
        { castMode, ensembleName },
      );
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells/:id/toggle — body: { sessionId, enabled, ruleId? } (C4)
  router.post('/spells/:id/toggle', validateParams(idParamSchema), validateBody(toggleSpellSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, enabled, ruleId } = req.body as { sessionId: string; enabled: boolean; ruleId?: string };
      const result = await spellService.toggleSpell(req.params.id as string, sessionId, enabled, ruleId);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells/:id/deactivate — body: { targetSessionIds[] }
  router.post('/spells/:id/deactivate', validateParams(idParamSchema), validateBody(spellActivationSchema), async (req: Request, res: Response) => {
    try {
      const { targetSessionIds } = req.body as { targetSessionIds: string[] };
      const result = await spellService.deactivateSpell(req.params.id as string, targetSessionIds);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        error: true,
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Unknown error',
      });
    }
  });

  // POST /api/spells/:id/reset-loop — body: { sessionId, ruleId? }
  router.post('/spells/:id/reset-loop', validateParams(idParamSchema), validateBody(resetLoopSchema), async (req: Request, res: Response) => {
    try {
      const { sessionId, ruleId } = req.body as { sessionId: string; ruleId?: string };
      const result = await spellService.resetLoop(req.params.id as string, sessionId, ruleId);
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
