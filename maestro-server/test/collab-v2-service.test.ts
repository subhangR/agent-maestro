import { CollabV2Service } from '../src/application/services/CollabV2Service';
import { ICollabV2Repository } from '../src/domain/collab/CollabV2';

describe('CollabV2Service RPC bridge', () => {
  const credentials = { firebaseToken: 'firebase-token' };
  const entityId = '01882d61-3b9f-7bad-8ce2-123456789abc';
  const actorId = '01882d61-3b9f-7bad-8ce2-123456789abd';
  const rpc = jest.fn();
  const select = jest.fn();
  const service = new CollabV2Service({ isConfigured: () => true, rpc, select } as unknown as ICollabV2Repository);

  beforeEach(() => { rpc.mockReset(); select.mockReset(); });

  it('uses the deployed react parameter names and normalizes the scalar response', async () => {
    rpc.mockResolvedValue(true);
    await expect(service.react(credentials, entityId, { actorId, type: 'likes', active: true })).resolves.toEqual({ active: true });
    expect(rpc).toHaveBeenCalledWith(credentials, 'react', { target_entity_id: entityId, author_member_id: actorId, reaction: 'likes', enabled: true });
  });

  it('uses grant_points reference/idempotency names from the SQL signature', async () => {
    rpc.mockResolvedValue(entityId);
    await service.grantPoints(credentials, entityId, { actorId, amount: 5, referenceId: entityId, clientEventId: 'points-1' });
    expect(rpc).toHaveBeenCalledWith(credentials, 'grant_points', expect.objectContaining({ reference_id: entityId, idempotency_key: 'points-1' }));
  });

  it('maps durable workspace event rows to the public discriminated contract', async () => {
    select.mockResolvedValue([{ id: entityId, event_type: 'edge.upsert', payload: { id: entityId, src_id: actorId, dst_id: entityId }, created_at: '2026-07-24T00:00:00Z' }]);
    await expect(service.events(credentials, entityId)).resolves.toEqual({ items: [{ type: 'edge.upsert', eventId: entityId, edge: { id: entityId, srcId: actorId, dstId: entityId } }], nextCursor: null });
    expect(select).toHaveBeenCalledWith(credentials, 'workspace_events', expect.objectContaining({ space_id: `eq.${entityId}` }));
  });

  it('defaults newly created spaces to public and forwards explicit privacy', async () => {
    rpc.mockResolvedValue(entityId);
    await service.createSpace(credentials, { name: 'Visible' });
    expect(rpc).toHaveBeenLastCalledWith(credentials, 'create_space', expect.objectContaining({ space_visibility: 'public' }));
    await service.createSpace(credentials, { name: 'Secret', visibility: 'private' });
    expect(rpc).toHaveBeenLastCalledWith(credentials, 'create_space', expect.objectContaining({ space_visibility: 'private' }));
  });
});
