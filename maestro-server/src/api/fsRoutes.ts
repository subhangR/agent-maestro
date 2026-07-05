import express, { Request, Response } from 'express';
import { z } from 'zod';
import { WorkspaceFsService, AllowedRootsProvider } from '../application/services/WorkspaceFsService';
import { handleRouteError } from './middleware/errorHandler';
import { validateQuery, validateBody } from './validation';

const listDirectoriesQuery = z.object({
  // Optional: omitted/empty → service defaults to the home directory.
  path: z.string().optional(),
});

const validateDirectoryBody = z.object({
  path: z.string(),
});

const rootPathQuery = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
});

const writeFileBody = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
  content: z.string(),
});

const renameBody = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
  newName: z.string().min(1),
});

const deleteBody = z.object({
  root: z.string().min(1),
  path: z.string().min(1),
});

/**
 * REST endpoints that expose host filesystem browsing/reading to the browser
 * web-ui, mirroring the Tauri Rust commands (persist.rs / files.rs). The desktop
 * shell uses native `invoke`; the browser has none, so these power the folder
 * picker ("Browse" in New Project / New Session) and the File Explorer + editor.
 *
 * Mounted behind the same auth middleware as every other /api route.
 *
 * @param getAllowedRoots server-derived allowlist of base dirs the client may
 * touch (home + registered project working dirs). Confines every operation so a
 * client cannot read/write/enumerate arbitrary host paths via these endpoints.
 */
export function createFsRoutes(getAllowedRoots?: AllowedRootsProvider) {
  const service = new WorkspaceFsService(getAllowedRoots);
  const router = express.Router();

  router.get('/fs/list-directories', validateQuery(listDirectoriesQuery), async (req: Request, res: Response) => {
    try {
      const { path } = listDirectoriesQuery.parse(req.query);
      res.json(await service.listDirectories(path ?? null));
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.post('/fs/validate-directory', validateBody(validateDirectoryBody), async (req: Request, res: Response) => {
    try {
      const { path } = validateDirectoryBody.parse(req.body);
      res.json({ path: await service.validateDirectory(path) });
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.get('/fs/list-entries', validateQuery(rootPathQuery), async (req: Request, res: Response) => {
    try {
      const { root, path } = rootPathQuery.parse(req.query);
      res.json(await service.listEntries(root, path));
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.get('/fs/read-file', validateQuery(rootPathQuery), async (req: Request, res: Response) => {
    try {
      const { root, path } = rootPathQuery.parse(req.query);
      res.json({ content: await service.readTextFile(root, path) });
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.post('/fs/write-file', validateBody(writeFileBody), async (req: Request, res: Response) => {
    try {
      const { root, path, content } = writeFileBody.parse(req.body);
      await service.writeTextFile(root, path, content);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.post('/fs/rename', validateBody(renameBody), async (req: Request, res: Response) => {
    try {
      const { root, path, newName } = renameBody.parse(req.body);
      res.json({ path: await service.renameEntry(root, path, newName) });
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  router.post('/fs/delete', validateBody(deleteBody), async (req: Request, res: Response) => {
    try {
      const { root, path } = deleteBody.parse(req.body);
      await service.deleteEntry(root, path);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res);
    }
  });

  return router;
}
