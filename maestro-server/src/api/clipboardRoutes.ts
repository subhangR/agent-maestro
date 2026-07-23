import express, { NextFunction, Request, Response } from 'express';
import * as fs from 'fs';
import multer from 'multer';
import { ClipboardImageService } from '../application/services/ClipboardImageService';
import { handleRouteError } from './middleware/errorHandler';
import {
  clipboardImageParamsSchema,
  clipboardUploadFieldsSchema,
  validateBody,
  validateParams,
} from './validation';

/**
 * Generic clipboard image transport.
 *
 * When Maestro is served over a network the clipboard lives on the user's
 * machine and the agent process lives on the server. Every agent tool we
 * support reads images by *path*, so a pasted image has to make the trip:
 * upload the blob, write it to the server's filesystem, hand back the absolute
 * server-side path. Nothing here is specific to a task, a session, an agent or
 * a deployment.
 */
export function createClipboardRoutes(clipboardImageService: ClipboardImageService) {
  const router = express.Router();

  // Buffer in memory: clipboard images are small and capped, and the service
  // needs the whole buffer anyway to sniff magic bytes before anything is
  // written to disk.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: clipboardImageService.maxBytes,
      files: 1,
      fields: 4,
    },
  });

  /**
   * Translate multer's own failures into the documented status codes. Without
   * this they surface as a generic 500.
   */
  const handleUpload = (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({
          error: true,
          code: err.code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR',
          message:
            err.code === 'LIMIT_FILE_SIZE'
              ? `Image exceeds the maximum size of ${clipboardImageService.maxBytes} bytes`
              : err.message,
        });
      }
      return next(err);
    });
  };

  // Upload a pasted image; responds with the absolute server-side path.
  router.post(
    '/clipboard/images',
    handleUpload,
    validateBody(clipboardUploadFieldsSchema),
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({
            error: true,
            code: 'VALIDATION_ERROR',
            message: 'An image file is required in the "file" field',
          });
        }

        const stored = await clipboardImageService.store({
          data: file.buffer,
          declaredMimeType: file.mimetype,
          sessionId: req.body?.sessionId,
        });

        res.status(201).json({
          filename: stored.filename,
          path: stored.path,
          url: `/api/clipboard/images/${stored.date}/${stored.filename}`,
          mimeType: stored.mimeType,
          bytes: stored.bytes,
        });
      } catch (err: unknown) {
        handleRouteError(err, res);
      }
    },
  );

  // Stream a stored image back for preview.
  router.get(
    '/clipboard/images/:date/:filename',
    validateParams(clipboardImageParamsSchema),
    async (req: Request, res: Response) => {
      try {
        const resolved = await clipboardImageService.resolve(
          req.params.date as string,
          req.params.filename as string,
        );
        if (!resolved) {
          return res.status(404).json({
            error: true,
            code: 'NOT_FOUND',
            message: 'Clipboard image not found',
          });
        }

        res.setHeader('Content-Type', resolved.mimeType);
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        const stream = fs.createReadStream(resolved.path);
        stream.on('error', (err) => {
          if (!res.headersSent) handleRouteError(err, res);
          else res.destroy();
        });
        stream.pipe(res);
      } catch (err: unknown) {
        handleRouteError(err, res);
      }
    },
  );

  return router;
}
