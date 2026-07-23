import { describe, expect, it } from 'vitest';
import { buildAtomicSpaceCommit, encode } from '../../src/collab/firestore.js';

describe('atomic Collab space creation', () => {
  it('builds one commit containing root and general channel writes', () => {
    const body = buildAtomicSpaceCommit({ firebase: { apiKey: 'key', projectId: 'demo', authDomain: 'demo.test' } }, { uid: 'u1', displayName: 'Ada', email: 'a@test', expiresAt: '2030-01-01T00:00:00Z' }, { id: 's1', name: 'Space', description: '', githubUrl: 'https://github.com/a/r', githubHost: 'github.com', githubOwner: 'a', githubRepo: 'r', visibility: 'private' });
    expect(body.writes).toHaveLength(2);
    expect(body.writes?.[0]?.update?.name).toContain('/collabSpaces/s1');
    expect(body.writes?.[1]?.update?.name).toContain('/collabSpaces/s1/channels/general');
    expect(body.writes?.[0]?.update?.fields?.createdAt).toEqual(encode(new Date(body.writes?.[0]?.update?.fields?.createdAt?.timestampValue)));
  });
});
