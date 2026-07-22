import { describe, expect, it, vi, afterEach } from 'vitest';
import { applyConflict, pullShape, shareShape } from '../../src/commands/collab.js';
import { api } from '../../src/api.js';

const identity = { uid: 'u1', displayName: 'Ada', email: 'ada@example.test', expiresAt: '2030-01-01T00:00:00.000Z' };

describe('Collab share/pull schemas', () => {
  afterEach(() => vi.restoreAllMocks());
  it('maps a local task to the immutable remote provenance shape', () => {
    const shared = shareShape('task', { title: 'Ship it', description: 'now', status: 'completed', priority: 'high', projectId: 'p1' }, identity, 'local-task');
    expect(shared).toMatchObject({ title: 'Ship it', status: 'completed', priority: 'high', sourceTaskId: 'local-task', sourceProjectId: 'p1', sourceUserId: 'u1', pulledByUids: [], linkedLocalIdsByUid: {} });
    expect(shared).not.toHaveProperty('id');
  });

  it('maps team members and spells without forwarding local-only identifiers', () => {
    expect(shareShape('member', { name: 'Reviewer', identity: 'Review code', skillIds: ['s1'], projectId: 'p1', id: 'ignored' }, identity, 'tm1')).toMatchObject({ sourceTeamMemberId: 'tm1', name: 'Reviewer', skillIds: ['s1'], adoptedByUids: [] });
    expect(shareShape('spell', { name: 'Lint', description: 'Run lint', rules: [], id: 'ignored' }, identity, 'sp1')).toMatchObject({ sourceSpellId: 'sp1', schemaVersion: 2, installedByUids: [] });
  });

  it('maps remote entities back to narrow local create payloads', () => {
    const task = pullShape('task', { title: 'Remote', description: 'd', priority: 'low', sourceUserId: 'other', pulledByUids: ['other'] }, 'p2');
    expect(task).toEqual(expect.objectContaining({ projectId: 'p2', title: 'Remote', priority: 'low' }));
    expect(task).not.toHaveProperty('sourceUserId');
    const spell = pullShape('spell', { name: 'Remote spell', description: 'd', rules: [] }, '');
    expect(spell).toMatchObject({ name: 'Remote spell', description: 'd', icon: undefined, color: 'violet', rules: [expect.objectContaining({ enabled: false })] });
  });

  it('coerces null member avatar and gives legacy spells a disabled safe rule', () => {
    expect(pullShape('member', { name: 'M', role: 'r', avatar: null }, 'p2')).toMatchObject({ avatar: '' });
    const legacy = pullShape('spell', { name: 'Old', description: 'legacy content', body: 'legacy body' }, '');
    expect(legacy.rules).toEqual([expect.objectContaining({ enabled: false, trigger: { type: 'hook', hookEvent: 'Stop' } })]);
  });

  it('omits status from strict task create payloads', () => {
    const payload = pullShape('task', { title: 'Done remotely', status: 'completed' }, 'p2');
    expect(payload).toMatchObject({ projectId: 'p2', title: 'Done remotely' });
    expect(payload).not.toHaveProperty('status');
  });

  it('fails on a local collision by default and makes an explicit copy when requested', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([{ id: 'local', title: 'Remote' }] as any);
    await expect(applyConflict('task', { title: 'Remote' }, 'p2', 'fail')).rejects.toMatchObject({ code: 'LOCAL_CONFLICT' });
    await expect(applyConflict('task', { title: 'Remote' }, 'p2', 'copy')).resolves.toEqual({ title: 'Remote (copy)' });
  });
});
