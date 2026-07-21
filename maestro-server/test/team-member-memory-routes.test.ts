/**
 * REST route coverage for per-entry team-member memory edit/remove:
 *   PATCH  /api/team-members/:id/memory/:index   (edit one entry in place)
 *   DELETE /api/team-members/:id/memory/:index    (remove one entry)
 * Exercises the happy path, Zod param/body validation, and out-of-range handling.
 */

import express from 'express';
import supertest from 'supertest';

import { TestDataDir, createTestContainer, createTestProject } from './helpers';
import { createTeamMemberRoutes } from '../src/api/teamMemberRoutes';

describe('Team member memory entry routes', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let app: express.Express;
  let projectId: string;
  let memberId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    projectId = project.id;
    const member = await container.teamMemberService.createTeamMember({
      projectId, name: 'Steward', role: 'worker', avatar: '🤖',
    });
    memberId = member.id;
    await container.teamMemberService.appendMemory(projectId, memberId, ['first', 'second', 'third']);

    app = express();
    app.use(express.json());
    app.use('/api', createTeamMemberRoutes(container.teamMemberService));
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  describe('PATCH /team-members/:id/memory/:index', () => {
    it('edits a single entry in place', async () => {
      const res = await supertest(app)
        .patch(`/api/team-members/${memberId}/memory/1`)
        .send({ projectId, entry: 'SECOND (edited)' });

      expect(res.status).toBe(200);
      expect(res.body.memory).toEqual(['first', 'SECOND (edited)', 'third']);
    });

    it('rejects an empty entry with 400', async () => {
      const res = await supertest(app)
        .patch(`/api/team-members/${memberId}/memory/0`)
        .send({ projectId, entry: '   ' });

      expect(res.status).toBe(400);
    });

    it('rejects a non-numeric index with 400', async () => {
      const res = await supertest(app)
        .patch(`/api/team-members/${memberId}/memory/abc`)
        .send({ projectId, entry: 'x' });

      expect(res.status).toBe(400);
    });

    it('returns 404 for an out-of-range index', async () => {
      const res = await supertest(app)
        .patch(`/api/team-members/${memberId}/memory/9`)
        .send({ projectId, entry: 'x' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /team-members/:id/memory/:index', () => {
    it('removes a single entry', async () => {
      const res = await supertest(app)
        .delete(`/api/team-members/${memberId}/memory/0?projectId=${projectId}`);

      expect(res.status).toBe(200);
      expect(res.body.memory).toEqual(['second', 'third']);
    });

    it('requires projectId', async () => {
      const res = await supertest(app)
        .delete(`/api/team-members/${memberId}/memory/0`);

      expect(res.status).toBe(400);
    });

    it('returns 404 for an out-of-range index', async () => {
      const res = await supertest(app)
        .delete(`/api/team-members/${memberId}/memory/9?projectId=${projectId}`);

      expect(res.status).toBe(404);
    });
  });
});
