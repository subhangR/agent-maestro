/**
 * Tests for workspace-global model profiles: repository seeding + CRUD,
 * service events, and the REST routes.
 */

import express from 'express';
import supertest from 'supertest';

import { TestDataDir, silentLogger } from './helpers';
import { TimestampIdGenerator } from '../src/infrastructure/common/TimestampIdGenerator';
import { InMemoryEventBus } from '../src/infrastructure/events/InMemoryEventBus';
import { FileSystemModelProfileRepository } from '../src/infrastructure/repositories/FileSystemModelProfileRepository';
import { ModelProfileService } from '../src/application/services/ModelProfileService';
import { createModelProfileRoutes } from '../src/api/modelProfileRoutes';

function buildStack(dataDir: string) {
  const idGenerator = new TimestampIdGenerator();
  const eventBus = new InMemoryEventBus(silentLogger);
  const repo = new FileSystemModelProfileRepository(dataDir, idGenerator, silentLogger);
  const service = new ModelProfileService(repo, eventBus, idGenerator);
  const app = express();
  app.use(express.json());
  app.use('/api', createModelProfileRoutes(service));
  return { repo, service, eventBus, app };
}

describe('Model profiles', () => {
  let testDataDir: TestDataDir;

  beforeEach(() => {
    testDataDir = new TestDataDir();
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('seeds the four default tiers on first init', async () => {
    const { repo } = buildStack(testDataDir.getPath());
    await repo.initialize();
    const profiles = await repo.findAll();
    const byId = new Map(profiles.map((p) => [p.id, p]));

    expect(profiles.length).toBe(4);
    expect(byId.get('mp_ultra')?.launchConfig.model).toBe('claude-fable-5');
    expect(byId.get('mp_heavy')?.launchConfig.model).toBe('claude-opus-4-8');
    expect(byId.get('mp_balanced')?.launchConfig.model).toBe('claude-sonnet-4-6');
    expect(byId.get('mp_fast')?.launchConfig.model).toBe('claude-haiku-4-5');
    expect(byId.get('mp_heavy')?.isDefault).toBe(true);
  });

  it('does not re-seed when at least one profile exists', async () => {
    const dataDir = testDataDir.getPath();
    const first = buildStack(dataDir);
    await first.repo.initialize();
    await first.service.deleteModelProfile('mp_ultra');
    await first.service.deleteModelProfile('mp_heavy');
    await first.service.deleteModelProfile('mp_balanced');
    // one profile (mp_fast) remains → a fresh repo must not re-seed

    const second = buildStack(dataDir);
    await second.repo.initialize();
    const profiles = await second.repo.findAll();
    expect(profiles.map((p) => p.id).sort()).toEqual(['mp_fast']);
  });

  it('creates, updates and deletes a profile and emits events', async () => {
    const { service, eventBus } = buildStack(testDataDir.getPath());
    const events: string[] = [];
    eventBus.on('model_profile:created', () => { events.push('created'); });
    eventBus.on('model_profile:updated', () => { events.push('updated'); });
    eventBus.on('model_profile:deleted', () => { events.push('deleted'); });

    const created = await service.createModelProfile({
      name: 'Custom',
      description: 'My tier',
      launchConfig: { provider: 'claude', model: 'claude-opus-4-8', reasoningEffort: 'high' },
    });
    expect(created.id).toMatch(/^mp/);
    expect(created.launchConfig.reasoningEffort).toBe('high');

    const updated = await service.updateModelProfile(created.id, {
      launchConfig: { provider: 'claude', model: 'claude-sonnet-4-6' },
    });
    expect(updated.launchConfig.model).toBe('claude-sonnet-4-6');
    expect(updated.createdAt).toBe(created.createdAt);

    await service.deleteModelProfile(created.id);
    expect(await service.getModelProfile(created.id)).toBeNull();
    expect(events).toEqual(['created', 'updated', 'deleted']);
  });

  it('exposes REST CRUD with validation', async () => {
    const { app } = buildStack(testDataDir.getPath());

    const list = await supertest(app).get('/api/model-profiles');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(4);

    const create = await supertest(app)
      .post('/api/model-profiles')
      .send({ name: 'REST tier', launchConfig: { provider: 'claude', model: 'claude-opus-4-8' } });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const bad = await supertest(app).post('/api/model-profiles').send({ name: 'No config' });
    expect(bad.status).toBe(400);

    const put = await supertest(app)
      .put(`/api/model-profiles/${id}`)
      .send({ name: 'Renamed' });
    expect(put.status).toBe(200);
    expect(put.body.name).toBe('Renamed');

    const del = await supertest(app).delete(`/api/model-profiles/${id}`);
    expect(del.status).toBe(200);

    const missing = await supertest(app).get(`/api/model-profiles/${id}`);
    expect(missing.status).toBe(404);
  });
});
