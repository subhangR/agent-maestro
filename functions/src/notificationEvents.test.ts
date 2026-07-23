import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESOURCE_DEFINITIONS,
  deriveChannelEvent,
  deriveInviteEvent,
  deriveResourceEvent,
  deriveSpaceEvent,
} from './notificationEvents';

test('resource creates, fan-out writes, updates, and deletes have stable taxonomy', () => {
  const created = { title: 'Ship it', pulledByUids: [] };
  assert.equal(deriveResourceEvent(RESOURCE_DEFINITIONS.tasks, undefined, created, 'alice')?.type, 'task.shared');
  assert.equal(deriveResourceEvent(
    RESOURCE_DEFINITIONS.tasks,
    created,
    { ...created, pulledByUids: ['bob'] },
    'bob',
  )?.type, 'task.pulled');
  assert.equal(deriveResourceEvent(RESOURCE_DEFINITIONS.tasks, created, { ...created, status: 'done' }, 'alice')?.type, 'task.updated');
  assert.equal(deriveResourceEvent(RESOURCE_DEFINITIONS.tasks, created, undefined, 'alice')?.type, 'task.deleted');
});

test('message bookkeeping does not create a duplicate channel notification', () => {
  const before = { name: 'general', description: '', position: 1, lastMessageAt: 1 };
  assert.equal(deriveChannelEvent(before, { ...before, lastMessageAt: 2, updatedAt: 2 }), null);
  assert.equal(deriveChannelEvent(before, { ...before, name: 'launch' })?.type, 'channel.updated');
});

test('invite and membership actions are classified precisely', () => {
  const invite = { redeemedByUids: [], revokedAt: null };
  assert.equal(deriveInviteEvent(undefined, invite)?.type, 'invite.created');
  assert.equal(deriveInviteEvent(invite, { ...invite, redeemedByUids: ['bob'] })?.type, 'invite.redeemed');
  assert.equal(deriveInviteEvent(invite, { ...invite, revokedAt: {} })?.type, 'invite.revoked');

  const owner = { displayName: 'Alice', role: 'owner' };
  const bob = { displayName: 'Bob', role: 'member' };
  const before = { name: 'Space', memberIds: ['alice'], members: { alice: owner } };
  const joined = { ...before, memberIds: ['alice', 'bob'], members: { alice: owner, bob } };
  assert.equal(deriveSpaceEvent(before, joined, 'bob')?.type, 'member.joined');
  assert.equal(deriveSpaceEvent(joined, before, 'bob')?.type, 'member.left');
  assert.equal(deriveSpaceEvent(joined, before, 'alice')?.type, 'member.removed');
  assert.equal(deriveSpaceEvent(joined, {
    ...joined,
    members: { alice: owner, bob: { ...bob, role: 'admin' } },
  }, 'alice')?.type, 'member.role_changed');
});
