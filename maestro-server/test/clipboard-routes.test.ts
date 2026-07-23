import express from 'express';
import supertest from 'supertest';
import { promises as fs, realpathSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createClipboardRoutes } from '../src/api/clipboardRoutes';
import { ClipboardImageService } from '../src/application/services/ClipboardImageService';
import { FileSystemClipboardImageRepository } from '../src/infrastructure/repositories/FileSystemClipboardImageRepository';

/**
 * Route + service tests for the generic clipboard image transport.
 *
 * The contract these lock down (relied on by the UI worker):
 *   POST /api/clipboard/images        -> 201 { filename, path, url, mimeType, bytes }
 *   GET  /api/clipboard/images/:d/:f  -> streams the image
 */

// --- Minimal but structurally valid image fixtures (magic bytes matter) ---

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
// Smallest valid JPEG.
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'base64',
);
// GIF89a 1x1.
const GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
// WEBP (RIFF....WEBP) 1x1 lossy.
const WEBP_BYTES = Buffer.from(
  'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  'base64',
);

function buildApp(service: ClipboardImageService) {
  const app = express();
  app.use(express.json());
  app.use('/api', createClipboardRoutes(service));
  return app;
}

describe('clipboardRoutes', () => {
  let root: string;
  let dataDir: string;
  let service: ClipboardImageService;
  let app: express.Express;

  beforeEach(async () => {
    const raw = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-clipboard-'));
    dataDir = realpathSync(raw);
    const repo = new FileSystemClipboardImageRepository(dataDir);
    root = repo.root;
    service = new ClipboardImageService(repo);
    app = buildApp(service);
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  describe('POST /api/clipboard/images', () => {
    it('happy path: stores a PNG and returns the contract shape with an on-disk absolute path', async () => {
      const res = await supertest(app)
        .post('/api/clipboard/images')
        .attach('file', PNG_BYTES, { filename: 'pasted.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        filename: expect.stringMatching(/^clip_\d+_[a-f0-9]+\.png$/),
        path: expect.any(String),
        url: expect.any(String),
        mimeType: 'image/png',
        bytes: PNG_BYTES.length,
      });

      // path must be ABSOLUTE, under the configured data dir, and actually exist.
      expect(path.isAbsolute(res.body.path)).toBe(true);
      expect(res.body.path.startsWith(root + path.sep)).toBe(true);
      const onDisk = await fs.readFile(res.body.path);
      expect(onDisk.equals(PNG_BYTES)).toBe(true);

      // url is the GET route for the same file.
      expect(res.body.url).toBe(`/api/clipboard/images/${path.basename(path.dirname(res.body.path))}/${res.body.filename}`);
    });

    it('accepts JPEG, GIF and WEBP by their magic bytes', async () => {
      const cases: Array<[Buffer, string, string]> = [
        [JPEG_BYTES, 'image/jpeg', 'jpg'],
        [GIF_BYTES, 'image/gif', 'gif'],
        [WEBP_BYTES, 'image/webp', 'webp'],
      ];
      for (const [bytes, mime, ext] of cases) {
        const res = await supertest(app)
          .post('/api/clipboard/images')
          .attach('file', bytes, { filename: `x.${ext}`, contentType: mime });
        expect(res.status).toBe(201);
        expect(res.body.mimeType).toBe(mime);
        expect(res.body.filename.endsWith(`.${ext}`)).toBe(true);
      }
    });

    it('passes an optional sessionId without affecting storage layout', async () => {
      const res = await supertest(app)
        .post('/api/clipboard/images')
        .field('sessionId', 'sess_123')
        .attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' });
      expect(res.status).toBe(201);
      // sessionId never appears in the stored path.
      expect(res.body.path.includes('sess_123')).toBe(false);
    });

    it('returns 400 when no file is provided', async () => {
      const res = await supertest(app).post('/api/clipboard/images').field('sessionId', 'sess_1');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 413 when the upload exceeds the size cap', async () => {
      const tinyCapService = new ClipboardImageService(
        new FileSystemClipboardImageRepository(dataDir),
        { maxBytes: 10 },
      );
      const smallApp = buildApp(tinyCapService);
      const res = await supertest(smallApp)
        .post('/api/clipboard/images')
        .attach('file', PNG_BYTES, { filename: 'big.png', contentType: 'image/png' });
      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('returns 400 for a disallowed declared mime type', async () => {
      const res = await supertest(app)
        .post('/api/clipboard/images')
        .attach('file', PNG_BYTES, { filename: 'x.svg', contentType: 'image/svg+xml' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when declared mime does not match the actual bytes (magic-byte mismatch)', async () => {
      // Real PNG bytes, but the client lies and calls it a JPEG.
      const res = await supertest(app)
        .post('/api/clipboard/images')
        .attach('file', PNG_BYTES, { filename: 'lie.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toMatch(/does not match/i);
    });

    it('returns 400 when the bytes are not a recognized image at all', async () => {
      const res = await supertest(app)
        .post('/api/clipboard/images')
        .attach('file', Buffer.from('this is not an image'), {
          filename: 'x.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/clipboard/images/:date/:filename', () => {
    async function upload(): Promise<{ date: string; filename: string; bytes: number }> {
      const res = await supertest(app)
        .post('/api/clipboard/images')
        .attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' });
      const date = path.basename(path.dirname(res.body.path));
      return { date, filename: res.body.filename, bytes: res.body.bytes };
    }

    it('streams a stored image back with the correct Content-Type', async () => {
      const { date, filename, bytes } = await upload();
      const res = await supertest(app).get(`/api/clipboard/images/${date}/${filename}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.body).toBeInstanceOf(Buffer);
      expect((res.body as Buffer).length).toBe(bytes);
    });

    it('returns 404 for a well-formed filename that does not exist', async () => {
      const res = await supertest(app).get('/api/clipboard/images/2026-07-23/clip_1_deadbeef.png');
      expect(res.status).toBe(404);
    });

    it('rejects path traversal in the filename with 400', async () => {
      const res = await supertest(app)
        .get('/api/clipboard/images/2026-07-23/..%2f..%2f..%2fetc%2fpasswd');
      expect(res.status).toBe(400);
    });

    it('rejects path traversal in the date segment with 400', async () => {
      const res = await supertest(app)
        .get('/api/clipboard/images/..%2f..%2fsessions/clip_1_deadbeef.png');
      expect(res.status).toBe(400);
    });

    it('rejects a filename that does not match the server-generated pattern with 400', async () => {
      const res = await supertest(app).get('/api/clipboard/images/2026-07-23/evil.png');
      expect(res.status).toBe(400);
    });
  });
});
