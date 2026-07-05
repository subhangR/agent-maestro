import express from 'express';
import supertest from 'supertest';
import { promises as fs, realpathSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createFsRoutes } from '../src/api/fsRoutes';

/**
 * Route-level tests for the browser web-ui filesystem endpoints. These wrap
 * WorkspaceFsService with Zod validation and HTTP status mapping.
 */
describe('fsRoutes', () => {
  let app: express.Express;
  let root: string;

  beforeEach(async () => {
    const raw = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-fsroutes-'));
    root = realpathSync(raw);
    app = express();
    app.use(express.json());
    // Allowlist the temp workspace + home (server-derived in production).
    app.use('/api', createFsRoutes(() => [root, os.homedir()]));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('GET /api/fs/list-directories lists subdirectories', async () => {
    await fs.mkdir(path.join(root, 'sub'));
    const res = await supertest(app).get('/api/fs/list-directories').query({ path: root });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe(root);
    expect(res.body.entries.map((e: { name: string }) => e.name)).toContain('sub');
  });

  it('POST /api/fs/validate-directory creates a missing directory', async () => {
    const target = path.join(root, 'made');
    const res = await supertest(app).post('/api/fs/validate-directory').send({ path: target });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe(target);
    expect((await fs.stat(target)).isDirectory()).toBe(true);
  });

  it('GET /api/fs/list-entries lists files and dirs within root', async () => {
    await fs.writeFile(path.join(root, 'a.txt'), 'hi');
    const res = await supertest(app).get('/api/fs/list-entries').query({ root, path: root });
    expect(res.status).toBe(200);
    expect(res.body.map((e: { name: string }) => e.name)).toContain('a.txt');
  });

  it('GET /api/fs/read-file returns file content', async () => {
    const file = path.join(root, 'note.md');
    await fs.writeFile(file, 'body text');
    const res = await supertest(app).get('/api/fs/read-file').query({ root, path: file });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('body text');
  });

  it('GET /api/fs/read-file rejects a path outside root with 400', async () => {
    const outside = path.join(realpathSync(os.tmpdir()), `maestro-outside-${process.pid}.txt`);
    await fs.writeFile(outside, 'secret');
    try {
      const res = await supertest(app).get('/api/fs/read-file').query({ root, path: outside });
      expect(res.status).toBe(400);
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it('POST /api/fs/write-file overwrites an existing file', async () => {
    const file = path.join(root, 'edit.txt');
    await fs.writeFile(file, 'old');
    const res = await supertest(app).post('/api/fs/write-file').send({ root, path: file, content: 'new' });
    expect(res.status).toBe(200);
    expect(await fs.readFile(file, 'utf8')).toBe('new');
  });

  it('POST /api/fs/rename renames an entry', async () => {
    const file = path.join(root, 'before.txt');
    await fs.writeFile(file, 'x');
    const res = await supertest(app).post('/api/fs/rename').send({ root, path: file, newName: 'after.txt' });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe(path.join(root, 'after.txt'));
  });

  it('POST /api/fs/delete removes an entry', async () => {
    const file = path.join(root, 'gone.txt');
    await fs.writeFile(file, 'x');
    const res = await supertest(app).post('/api/fs/delete').send({ root, path: file });
    expect(res.status).toBe(200);
    await expect(fs.stat(file)).rejects.toThrow();
  });

  it('returns 400 when a required query param is missing', async () => {
    const res = await supertest(app).get('/api/fs/list-entries').query({ root });
    expect(res.status).toBe(400);
  });
});
