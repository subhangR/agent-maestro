import express from 'express';
import request from 'supertest';
import { createCollabV2Routes } from '../src/api/collabV2Routes';
import { CollabV2Service } from '../src/application/services/CollabV2Service';

describe('Collab V2 façade routes', () => {
  const uuid = '01882d61-3b9f-7bad-8ce2-123456789abc';
  const secondUuid = '01882d61-3b9f-7bad-8ce2-123456789abd';
  const auth = { 'X-Collab-Firebase-Token': 'firebase-token' };

  function app(service: Partial<CollabV2Service>) {
    const server = express();
    server.use(express.json());
    server.use('/api', createCollabV2Routes(service as CollabV2Service));
    return server;
  }

  it('reports configuration without exposing any database credentials', async () => {
    const previousBypass = process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS;
    delete process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS;
    const response = await request(app({ isConfigured: () => false }))
      .get('/api/collab/v2/health');
    if (previousBypass === undefined) delete process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS;
    else process.env.MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS = previousBypass;
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false, auth: 'firebase-token-forwarding', apiVersion: 'v2' });
  });

  it('requires a Firebase token before forwarding an identity request', async () => {
    const response = await request(app({ isConfigured: () => true, currentIdentity: jest.fn() }))
      .get('/api/collab/v2/identity');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('forwards a valid Firebase UID for the explicit test bypass', async () => {
    const currentIdentity = jest.fn().mockResolvedValue({ firebaseUid: 'firebase-user-1' });
    const response = await request(app({ isConfigured: () => true, currentIdentity }))
      .get('/api/collab/v2/identity')
      .set(auth)
      .set('X-Collab-Firebase-Uid', 'firebase-user-1');
    expect(response.status).toBe(200);
    expect(currentIdentity).toHaveBeenCalledWith({ firebaseToken: 'firebase-token', firebaseUid: 'firebase-user-1' });
  });

  it('rejects a malformed claimed Firebase UID', async () => {
    const currentIdentity = jest.fn();
    const response = await request(app({ isConfigured: () => true, currentIdentity }))
      .get('/api/collab/v2/identity')
      .set(auth)
      .set('X-Collab-Firebase-Uid', 'bad uid');
    expect(response.status).toBe(403);
    expect(currentIdentity).not.toHaveBeenCalled();
  });

  it('validates task commands at the façade boundary', async () => {
    const createTask = jest.fn();
    const response = await request(app({ isConfigured: () => true, createTask }))
      .post(`/api/collab/v2/spaces/${uuid}/tasks`)
      .set('X-Collab-Firebase-Token', 'firebase-token')
      .send({ actorId: uuid, title: '' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('accepts saved-view metadata from older collection clients', async () => {
    const queryCollection = jest.fn().mockResolvedValue({ query: {}, page: { items: [], nextCursor: null } });
    const response = await request(app({ isConfigured: () => true, queryCollection }))
      .post('/api/collab/v2/collections/query')
      .set(auth)
      .send({ spaceId: uuid, kinds: ['task'], layout: 'board', title: 'My work', id: 'my-work' });
    expect(response.status).toBe(200);
    expect(queryCollection).toHaveBeenCalledWith(
      { firebaseToken: 'firebase-token' },
      expect.objectContaining({ spaceId: uuid, title: 'My work', id: 'my-work' }),
    );
  });

  it('exposes explicit public discovery, join, and space identity routes', async () => {
    const discoverSpaces = jest.fn().mockResolvedValue([{ id: uuid, isMember: false }]);
    const joinSpace = jest.fn().mockResolvedValue({ spaceId: uuid, memberId: secondUuid, joined: true });
    const currentSpaceIdentity = jest.fn().mockResolvedValue({ memberId: secondUuid, role: 'member' });
    const server = app({ isConfigured: () => true, discoverSpaces, joinSpace, currentSpaceIdentity });
    expect((await request(server).get('/api/collab/v2/spaces/discover?githubRepo=org%2Frepo').set(auth)).body[0].isMember).toBe(false);
    expect((await request(server).post(`/api/collab/v2/spaces/${uuid}/join`).set(auth).send({})).body.memberId).toBe(secondUuid);
    expect((await request(server).get(`/api/collab/v2/spaces/${uuid}/identity`).set(auth)).body.role).toBe('member');
    expect(discoverSpaces).toHaveBeenCalledWith({ firebaseToken: 'firebase-token' }, 'org/repo');
  });

  it('routes graph mutations with explicit semantic intent and optimistic correlation', async () => {
    const place = jest.fn().mockResolvedValue({ patches: [], undo: { kind: 'delete_edge' } });
    const completeTask = jest.fn().mockResolvedValue({ patches: [] });
    const server = app({ isConfigured: () => true, place, completeTask });
    const placement = await request(server).post('/api/collab/v2/placements').set(auth).send({ actorId: uuid, sourceId: uuid, targetId: secondUuid, intent: 'depend', clientMutationId: 'm1' });
    expect(placement.status).toBe(201);
    expect(place).toHaveBeenCalledWith({ firebaseToken: 'firebase-token' }, expect.objectContaining({ intent: 'depend' }));
    const completion = await request(server).post(`/api/collab/v2/tasks/${uuid}/complete`).set(auth).send({ actorId: uuid, expectedVersion: 2, completerIds: [secondUuid] });
    expect(completion.status).toBe(200);
  });

  it('validates versioned document metadata and exposes cursor event pages', async () => {
    const updateDocument = jest.fn().mockResolvedValue({ patches: [] });
    const events = jest.fn().mockResolvedValue({ items: [{ type: 'entity.upsert', eventId: uuid }], nextCursor: 'next' });
    const server = app({ isConfigured: () => true, updateDocument, events });
    const invalid = await request(server).patch(`/api/collab/v2/docs/${uuid}`).set(auth).send({ actorId: uuid, title: 'Changed' });
    expect(invalid.status).toBe(400);
    expect(updateDocument).not.toHaveBeenCalled();
    const page = await request(server).get(`/api/collab/v2/spaces/${uuid}/events?cursor=abc&limit=20`).set(auth);
    expect(page.body).toEqual({ items: [{ type: 'entity.upsert', eventId: uuid }], nextCursor: 'next' });
    expect(events).toHaveBeenCalledWith({ firebaseToken: 'firebase-token' }, uuid, 'abc', 20);
  });

  it('accepts explicit visibility and queues provider tracking refreshes', async () => {
    const createSpace = jest.fn().mockResolvedValue({ id: uuid });
    const refreshTracking = jest.fn().mockResolvedValue({ accepted: true, requestIds: [secondUuid] });
    const server = app({ isConfigured: () => true, createSpace, refreshTracking });
    const created = await request(server).post('/api/collab/v2/spaces').set(auth).send({ name: 'Public project', visibility: 'public' });
    expect(created.status).toBe(201);
    expect(createSpace).toHaveBeenCalledWith({ firebaseToken: 'firebase-token' }, expect.objectContaining({ visibility: 'public' }));
    const refresh = await request(server).post('/api/collab/v2/tracking/refresh').set(auth).send({});
    expect(refresh.status).toBe(202);
    expect(refresh.body.accepted).toBe(true);
  });
});
