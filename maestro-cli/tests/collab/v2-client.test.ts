import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-fetch', () => ({
  default: (...args: unknown[]) => (globalThis as { __collabV2Fetch?: (...values: unknown[]) => unknown }).__collabV2Fetch?.(...args),
}));

import { CollabV2Client, parseJsonObject, queryString } from '../../src/collab/v2.js';

afterEach(() => {
  delete (globalThis as { __collabV2Fetch?: unknown }).__collabV2Fetch;
});

describe('Collab V2 façade client', () => {
  it('forwards only the Firebase ID token to the local V2 route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [] }),
    });
    (globalThis as { __collabV2Fetch?: unknown }).__collabV2Fetch = fetchMock;

    await new CollabV2Client('firebase-id-token', 'http://127.0.0.1:4567/').post('/collections/query', { spaceId: 'space-1' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4567/api/collab/v2/collections/query');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-Collab-Firebase-Token': 'firebase-id-token',
      'Content-Type': 'application/json',
    });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('preserves normalized façade error codes and status details', async () => {
    (globalThis as { __collabV2Fetch?: unknown }).__collabV2Fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: { code: 'version_conflict', message: 'Refresh first.', details: { currentVersion: 4 } } }),
    });

    await expect(new CollabV2Client('token', 'http://local').patch('/tasks/t1', {})).rejects.toMatchObject({
      code: 'version_conflict',
      message: 'Refresh first.',
      details: { status: 409, currentVersion: 4 },
    });
  });

  it('parses inline command payloads and encodes query values', () => {
    expect(parseJsonObject('{"actorId":"a1"}')).toEqual({ actorId: 'a1' });
    expect(() => parseJsonObject('[]')).toThrow(/JSON object/);
    expect(queryString({ githubRepo: 'https://github.com/acme/repo', cursor: undefined, limit: 20 }))
      .toBe('?githubRepo=https%3A%2F%2Fgithub.com%2Facme%2Frepo&limit=20');
  });
});
