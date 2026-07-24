import express from 'express';
import request from 'supertest';
import { createCollabV2Routes } from '../src/api/collabV2Routes';
import { CollabV2Service } from '../src/application/services/CollabV2Service';

describe('Collab V2 façade routes', () => {
  const uuid = '01882d61-3b9f-7bad-8ce2-123456789abc';

  function app(service: Partial<CollabV2Service>) {
    const server = express();
    server.use(express.json());
    server.use('/api', createCollabV2Routes(service as CollabV2Service));
    return server;
  }

  it('reports configuration without exposing any database credentials', async () => {
    const response = await request(app({ isConfigured: () => false }))
      .get('/api/collab/v2/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false, auth: 'firebase-token-forwarding', apiVersion: 'v2' });
  });

  it('requires a Firebase token before forwarding an identity request', async () => {
    const response = await request(app({ isConfigured: () => true, currentIdentity: jest.fn() }))
      .get('/api/collab/v2/identity');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
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
});
