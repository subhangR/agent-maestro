import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('node-fetch', () => ({ default: (...args: unknown[]) => (globalThis as any).__collabFetch(...args) }));
import { CollabFirestore } from '../../src/collab/firestore.js';

const profile = { firebase: { apiKey: 'k', projectId: 'demo', authDomain: 'demo.test' } };
const identity = { uid: 'u1', displayName: 'Ada', email: 'a@test', expiresAt: '2030-01-01T00:00:00Z' };

afterEach(() => vi.unstubAllGlobals());

describe('Firestore REST contracts', () => {
  it('uses the root :runQuery endpoint and composite where body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    (globalThis as any).__collabFetch = fetchMock;
    await new CollabFirestore(profile, 'token', identity).list('', 'collabSpaces', { filters: [{ field: 'visibility', op: 'EQUAL', value: 'private' }, { field: 'memberIds', op: 'ARRAY_CONTAINS', value: 'u1' }] });
    expect(fetchMock.mock.calls[0][0]).toContain('/documents:runQuery');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.structuredQuery.where.compositeFilter.filters).toHaveLength(2);
  });

  it('preserves invite timestamp typing in redemption commit', async () => {
    const timestamp = '2030-01-01T00:00:00.000Z';
    const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
    const responses = [{ ok: false, status: 403, json: async () => ({}) }, ok({ transaction: 'tx' }), ok([{ found: { name: 'x', fields: { spaceId: { stringValue: 's1' }, expiresAt: { timestampValue: timestamp }, useCount: { integerValue: '0' }, maxUses: { integerValue: '1' }, redeemedByUids: { arrayValue: { values: [] } }, revokedAt: { nullValue: null } } } }]), ok({})];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    (globalThis as any).__collabFetch = fetchMock;
    await new CollabFirestore(profile, 'token', identity).redeemInvite('s1', 'invite').catch(() => undefined);
    const commit = fetchMock.mock.calls.find((c) => String(c[0]).endsWith(':commit'));
    if (commit) expect(JSON.parse(commit[1].body).writes[0].update.fields.expiresAt.timestampValue).toBe(timestamp);
  });
});
