/**
 * Collab Space security-rules tests.
 *
 * Runs against the Firestore emulator via `bun run test` (which wraps
 * `firebase emulators:exec`). Every test seeds state with rules disabled,
 * then asserts what each identity can and cannot do through the rules.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  runTransaction,
} from 'firebase/firestore';

const __dir = dirname(fileURLToPath(import.meta.url));

const OWNER = 'alice';
const MEMBER = 'bob';
const OUTSIDER = 'eve';
const SPACE = 'space1';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-maestro-rules',
    firestore: {
      rules: readFileSync(resolve(__dir, '../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

function memberEntry(uid: string, role: 'owner' | 'admin' | 'member') {
  return {
    uid,
    displayName: uid,
    email: `${uid}@test.dev`,
    photoUrl: null,
    role,
    joinedAt: new Date(),
  };
}

/** Seeds a space owned by alice with bob as a plain member. */
async function seedSpace(visibility: 'public' | 'private', extra?: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'collabSpaces', SPACE), {
      name: 'Test space',
      description: '',
      githubUrl: 'https://github.com/acme/repo',
      githubHost: 'github.com',
      githubOwner: 'acme',
      githubRepo: 'repo',
      visibility,
      ownerId: OWNER,
      memberIds: [OWNER, MEMBER],
      members: {
        [OWNER]: memberEntry(OWNER, 'owner'),
        [MEMBER]: memberEntry(MEMBER, 'member'),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    });
  });
}

function dbAs(uid: string | null) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
}

beforeEach(async () => {
  await env.clearFirestore();
});

// ─── Space visibility & membership ──────────────────────────────────

describe('space read access', () => {
  it('members can read a private space; outsiders and anonymous cannot', async () => {
    await seedSpace('private');
    await assertSucceeds(getDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE)));
    await assertFails(getDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE)));
    await assertFails(getDoc(doc(dbAs(null), 'collabSpaces', SPACE)));
  });

  it('any signed-in user can read a public space without GitHub membership verification', async () => {
    await seedSpace('public');
    await assertSucceeds(getDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE)));
    await assertFails(getDoc(doc(dbAs(null), 'collabSpaces', SPACE)));
  });

  it('non-members cannot read subcollections of a private space', async () => {
    await seedSpace('private');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'tasks', 't1'), {
        spaceId: SPACE, title: 'secret', description: '', status: 'todo',
        priority: 'medium', createdBy: OWNER, createdAt: new Date(), updatedAt: new Date(),
      });
    });
    await assertFails(getDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE, 'tasks', 't1')));
    await assertSucceeds(getDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'tasks', 't1')));
  });
});

describe('space create', () => {
  it('creator must be sole initial member with owner role', async () => {
    const base = {
      name: 'New space', description: '', githubUrl: 'https://github.com/a/b',
      githubHost: 'github.com', githubOwner: 'a', githubRepo: 'b',
      visibility: 'public', ownerId: OWNER,
      createdAt: new Date(), updatedAt: new Date(),
    };
    await assertSucceeds(setDoc(doc(dbAs(OWNER), 'collabSpaces', 'ok'), {
      ...base, memberIds: [OWNER], members: { [OWNER]: memberEntry(OWNER, 'owner') },
    }));
    // Smuggling a second member in at create time is rejected.
    await assertFails(setDoc(doc(dbAs(OWNER), 'collabSpaces', 'bad1'), {
      ...base, memberIds: [OWNER, MEMBER],
      members: { [OWNER]: memberEntry(OWNER, 'owner'), [MEMBER]: memberEntry(MEMBER, 'member') },
    }));
    // Spoofed ownerId is rejected.
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', 'bad2'), {
      ...base, memberIds: [MEMBER], members: { [MEMBER]: memberEntry(MEMBER, 'owner') },
    }));
  });
});

describe('join / leave', () => {
  it('self-join on a public space works; adding someone else fails', async () => {
    await seedSpace('public', { memberIds: [OWNER], members: { [OWNER]: memberEntry(OWNER, 'owner') } });
    await assertSucceeds(updateDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE), {
      memberIds: arrayUnion(OUTSIDER),
      [`members.${OUTSIDER}`]: memberEntry(OUTSIDER, 'member'),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE), {
      memberIds: arrayUnion('mallory'),
      [`members.mallory`]: memberEntry('mallory', 'member'),
      updatedAt: serverTimestamp(),
    }));
  });

  it('self-join on a private space fails', async () => {
    await seedSpace('private');
    await assertFails(updateDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE), {
      memberIds: arrayUnion(OUTSIDER),
      [`members.${OUTSIDER}`]: memberEntry(OUTSIDER, 'member'),
      updatedAt: serverTimestamp(),
    }));
  });

  it('joining with an admin role is rejected', async () => {
    await seedSpace('public', { memberIds: [OWNER], members: { [OWNER]: memberEntry(OWNER, 'owner') } });
    await assertFails(updateDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE), {
      memberIds: arrayUnion(OUTSIDER),
      [`members.${OUTSIDER}`]: memberEntry(OUTSIDER, 'admin'),
      updatedAt: serverTimestamp(),
    }));
  });

  it('a member can leave; the owner cannot leave their own space', async () => {
    await seedSpace('private');
    await assertSucceeds(updateDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE), {
      memberIds: arrayRemove(MEMBER),
      [`members.${MEMBER}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbAs(OWNER), 'collabSpaces', SPACE), {
      memberIds: arrayRemove(OWNER),
      [`members.${OWNER}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }));
  });

  it('a plain member cannot promote themselves to admin', async () => {
    await seedSpace('private');
    await assertFails(updateDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE), {
      [`members.${MEMBER}.role`]: 'admin',
      updatedAt: serverTimestamp(),
    }));
  });
});

// ─── Private invitation redemption ─────────────────────────────────

function inviteData(extra?: Record<string, unknown>) {
  return {
    spaceId: SPACE,
    kind: 'link',
    maxUses: 1,
    useCount: 0,
    redeemedByUids: [],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    createdBy: OWNER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

async function seedInvite(inviteId = 'invite-token-abcdefghijklmnopqrstuvwxyz123456') {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'invites', inviteId), inviteData());
  });
  return inviteId;
}

/** Mirrors the client transaction: it deliberately does not read the private space root. */
async function redeem(
  uid: string,
  inviteId: string,
  memberUid = uid,
  invitePatch: Record<string, unknown> = {},
) {
  const db = dbAs(uid);
  const spaceRef = doc(db, 'collabSpaces', SPACE);
  const inviteRef = doc(db, 'collabSpaces', SPACE, 'invites', inviteId);
  const claimRef = doc(db, 'collabSpaces', SPACE, 'inviteClaims', uid);
  return runTransaction(db, async (tx) => {
    const invite = await tx.get(inviteRef);
    if (!invite.exists()) throw new Error('missing invite');
    const data = invite.data();
    tx.update(inviteRef, {
      useCount: data.useCount + 1,
      redeemedByUids: [...data.redeemedByUids, uid],
      updatedAt: serverTimestamp(),
      ...invitePatch,
    });
    tx.set(claimRef, { spaceId: SPACE, inviteId, uid, createdAt: serverTimestamp() });
    tx.update(spaceRef, {
      memberIds: arrayUnion(memberUid),
      [`members.${memberUid}`]: memberEntry(memberUid, 'member'),
      updatedAt: serverTimestamp(),
    });
  });
}

describe('private invitation redemption', () => {
  beforeEach(async () => {
    await seedSpace('private', {
      memberIds: [OWNER],
      members: { [OWNER]: memberEntry(OWNER, 'owner') },
    });
  });

  it('atomically redeems an active invite without granting a pre-join private read', async () => {
    const inviteId = await seedInvite();
    await assertFails(getDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE)));
    await assertSucceeds(redeem(OUTSIDER, inviteId));
    await assertSucceeds(getDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE)));
  });

  it('rejects replay and a standalone claim or invite increment', async () => {
    const inviteId = await seedInvite();
    await assertSucceeds(redeem(OUTSIDER, inviteId));
    await assertFails(redeem(OUTSIDER, inviteId));
    const db = dbAs(MEMBER);
    await assertFails(setDoc(doc(db, 'collabSpaces', SPACE, 'inviteClaims', MEMBER), {
      spaceId: SPACE, inviteId, uid: MEMBER, createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, 'collabSpaces', SPACE, 'invites', inviteId), {
      useCount: 2, redeemedByUids: [OUTSIDER, MEMBER], updatedAt: serverTimestamp(),
    }));
  });

  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 1) }],
    ['revoked', { revokedAt: new Date() }],
  ])('rejects a %s invite', async (_name, extra) => {
    const inviteId = await seedInvite('invite-token-abcdefghijklmnopqrstuvwxyz123457');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'invites', inviteId), extra);
    });
    await assertFails(redeem(OUTSIDER, inviteId));
  });

  it('rejects cross-space and cross-user membership attempts', async () => {
    const inviteId = await seedInvite();
    const db = dbAs(OUTSIDER);
    const crossSpaceInvite = await seedInvite('invite-token-abcdefghijklmnopqrstuvwxyz123458');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'invites', crossSpaceInvite), {
        spaceId: 'another-space',
      });
    });
    await assertFails(redeem(OUTSIDER, crossSpaceInvite));
    await assertFails(redeem(OUTSIDER, inviteId, MEMBER));
    // The original invite remains unused after both rejected transactions.
    await assertSucceeds(redeem(OUTSIDER, inviteId));
    await assertFails(getDoc(doc(db, 'collabSpaces', SPACE, 'inviteClaims', MEMBER)));
  });

  it('preserves an optional management id during redemption while accepting legacy invites without one', async () => {
    const managedInvite = await seedInvite('invite-token-abcdefghijklmnopqrstuvwxyz123459');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'invites', managedInvite), {
        managementId: 'manager_12345678901234567890',
      });
    });
    await assertFails(redeem(OUTSIDER, managedInvite, OUTSIDER, {
      managementId: 'manager_replaced_1234567890',
    }));
    await assertSucceeds(redeem(OUTSIDER, managedInvite));

    // This remains deliberately valid: old UI-created invites have no safe
    // management id, but are still redeemable until reissued or revoked.
    await env.clearFirestore();
    await seedSpace('private', { memberIds: [OWNER], members: { [OWNER]: memberEntry(OWNER, 'owner') } });
    const legacyInvite = await seedInvite('invite-token-abcdefghijklmnopqrstuvwxyz123460');
    await assertSucceeds(redeem(OUTSIDER, legacyInvite));
  });

  it('caps an optional management id at creation', async () => {
    await assertFails(setDoc(doc(dbAs(OWNER), 'collabSpaces', SPACE, 'invites', 'invite-token-abcdefghijklmnopqrstuvwxyz123461'), {
      ...inviteData({ managementId: 'x'.repeat(129) }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(dbAs(OWNER), 'collabSpaces', SPACE, 'invites', 'invite-token-abcdefghijklmnopqrstuvwxyz123462'), {
      ...inviteData({ managementId: 'not an opaque management id' }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });
});

describe('admin boundaries', () => {
  it('admin can rename the space but cannot demote or remove the owner', async () => {
    await seedSpace('private', {
      memberIds: [OWNER, MEMBER],
      members: { [OWNER]: memberEntry(OWNER, 'owner'), [MEMBER]: memberEntry(MEMBER, 'admin') },
    });
    await assertSucceeds(updateDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE), {
      name: 'Renamed by admin', updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE), {
      [`members.${OWNER}.role`]: 'member', updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE), {
      memberIds: arrayRemove(OWNER),
      [`members.${OWNER}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }));
  });

  it('only the owner can delete the space', async () => {
    await seedSpace('private');
    await assertFails(deleteDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE)));
    await assertSucceeds(deleteDoc(doc(dbAs(OWNER), 'collabSpaces', SPACE)));
  });
});

describe('repository identity', () => {
  it('rejects an owner attempt to rebind an existing space to another repository', async () => {
    await seedSpace('private');

    for (const field of ['githubUrl', 'githubHost', 'githubOwner', 'githubRepo'] as const) {
      await assertFails(updateDoc(doc(dbAs(OWNER), 'collabSpaces', SPACE), {
        [field]: `changed-${field}`,
        updatedAt: serverTimestamp(),
      }));
    }
  });

  it('allows an owner to update a profile field without changing repository identity', async () => {
    await seedSpace('private');
    await assertSucceeds(updateDoc(doc(dbAs(OWNER), 'collabSpaces', SPACE), {
      name: 'Renamed by owner',
      updatedAt: serverTimestamp(),
    }));
  });
});

// ─── Messages ───────────────────────────────────────────────────────

describe('messages', () => {
  async function seedChannel() {
    await seedSpace('private');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'channels', 'general'), {
        spaceId: SPACE, name: 'general', description: '', createdBy: OWNER,
        createdAt: new Date(), updatedAt: new Date(), lastMessageAt: null,
        position: 0, isDefault: true,
      });
    });
  }

  function msg(authorUid: string, content: string, extra?: Record<string, unknown>) {
    return {
      spaceId: SPACE, channelId: 'general', authorUid,
      authorDisplayName: authorUid, authorPhotoUrl: null, content,
      createdAt: serverTimestamp(), editedAt: null, deletedAt: null,
      threadId: null, replyCount: 0, mentions: [], attachments: [],
      clientMsgId: null, ...extra,
    };
  }

  it('author uid cannot be spoofed', async () => {
    await seedChannel();
    const path = ['collabSpaces', SPACE, 'channels', 'general', 'messages'] as const;
    await assertSucceeds(setDoc(doc(dbAs(MEMBER), ...path, 'm1'), msg(MEMBER, 'hello')));
    await assertFails(setDoc(doc(dbAs(MEMBER), ...path, 'm2'), msg(OWNER, 'spoofed')));
    await assertFails(setDoc(doc(dbAs(OUTSIDER), ...path, 'm3'), msg(OUTSIDER, 'not a member')));
  });

  it('content is capped at 10k; attachment-only messages are allowed', async () => {
    await seedChannel();
    const path = ['collabSpaces', SPACE, 'channels', 'general', 'messages'] as const;
    await assertFails(setDoc(doc(dbAs(MEMBER), ...path, 'm1'), msg(MEMBER, 'x'.repeat(10001))));
    await assertFails(setDoc(doc(dbAs(MEMBER), ...path, 'm2'), msg(MEMBER, '')));
    await assertSucceeds(setDoc(doc(dbAs(MEMBER), ...path, 'm3'), msg(MEMBER, '', {
      attachments: [{ fileId: 'f1', name: 'a.png', mimeType: 'image/png', size: 10 }],
    })));
  });

  it('only the author can edit, and only content/editedAt/deletedAt', async () => {
    await seedChannel();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'channels', 'general', 'messages', 'm1'),
        msg(MEMBER, 'original'));
    });
    const ref = (uid: string) => doc(dbAs(uid), 'collabSpaces', SPACE, 'channels', 'general', 'messages', 'm1');
    await assertSucceeds(updateDoc(ref(MEMBER), { content: 'edited', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(OWNER), { content: 'moderated', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(MEMBER), { authorUid: OWNER }));
  });
});

// ─── Shared tasks: fan-out pinning ──────────────────────────────────

describe('shared tasks', () => {
  async function seedTask() {
    await seedSpace('private');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'tasks', 't1'), {
        spaceId: SPACE, title: 'Shared task', description: '', status: 'todo',
        priority: 'medium', assigneeUids: [], parentTaskId: null, childrenIds: [],
        position: 0, sourceTaskId: 'local1', sourceProjectId: 'proj1', sourceUserId: OWNER,
        linkedLocalIdsByUid: {}, pulledByUids: [], createdBy: OWNER,
        createdAt: new Date(), updatedAt: new Date(),
      });
    });
  }
  const taskRef = (uid: string) => doc(dbAs(uid), 'collabSpaces', SPACE, 'tasks', 't1');

  it('create validates shape and createdBy', async () => {
    await seedSpace('private');
    const base = {
      spaceId: SPACE, title: 'ok', description: '', status: 'todo', priority: 'low',
      createdBy: MEMBER, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'tasks', 'a'), base));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'tasks', 'b'),
      { ...base, title: 'x'.repeat(201) }));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'tasks', 'c'),
      { ...base, createdBy: OWNER }));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'tasks', 'd'),
      { ...base, status: 'bogus' }));
  });

  it('a member records their own pull (uid array + own map key)', async () => {
    await seedTask();
    await assertSucceeds(updateDoc(taskRef(MEMBER), {
      pulledByUids: arrayUnion(MEMBER),
      [`linkedLocalIdsByUid.${MEMBER}`]: 'localTask9',
      updatedAt: serverTimestamp(),
    }));
  });

  it('a member cannot record a pull for someone else', async () => {
    await seedTask();
    await assertFails(updateDoc(taskRef(MEMBER), {
      pulledByUids: arrayUnion(OUTSIDER),
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(taskRef(MEMBER), {
      pulledByUids: arrayUnion(MEMBER),
      [`linkedLocalIdsByUid.${OWNER}`]: 'hijacked',
      updatedAt: serverTimestamp(),
    }));
  });

  it('a non-creator member cannot edit content fields', async () => {
    await seedTask();
    await assertFails(updateDoc(taskRef(MEMBER), {
      title: 'defaced', updatedAt: serverTimestamp(),
    }));
  });

  it('creator can edit content but never provenance, and sizes are re-validated', async () => {
    await seedTask();
    await assertSucceeds(updateDoc(taskRef(OWNER), {
      title: 'Renamed', status: 'in_progress', updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(taskRef(OWNER), {
      title: 'x'.repeat(201), updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(taskRef(OWNER), {
      createdBy: MEMBER, updatedAt: serverTimestamp(),
    }));
  });
});

// ─── Shared spells ──────────────────────────────────────────────────

describe('shared spells', () => {
  it('rules payload is capped at 20 entries', async () => {
    await seedSpace('private');
    const base = {
      spaceId: SPACE, name: 'spell', description: '', body: '', icon: null,
      schemaVersion: 2, color: 'violet',
      sourceSpellId: null, sourceProjectId: null, sourceUserId: MEMBER,
      installedByUids: [], linkedLocalIdsByUid: {},
      createdBy: MEMBER, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    const rule = {
      enabled: true,
      trigger: { type: 'hook', hookEvent: 'Stop' },
      action: { type: 'inject-prompt', prompt: 'go' },
    };
    await assertSucceeds(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'spells', 'ok'),
      { ...base, rules: Array(20).fill(rule) }));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'spells', 'over'),
      { ...base, rules: Array(21).fill(rule) }));
  });

  it('install fan-out is pinned to the caller', async () => {
    await seedSpace('private');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'spells', 's1'), {
        spaceId: SPACE, name: 'spell', description: '', body: '', icon: null,
        installedByUids: [], linkedLocalIdsByUid: {}, createdBy: OWNER,
        createdAt: new Date(), updatedAt: new Date(),
      });
    });
    const ref = doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'spells', 's1');
    await assertSucceeds(updateDoc(ref, {
      installedByUids: arrayUnion(MEMBER),
      [`linkedLocalIdsByUid.${MEMBER}`]: 'spellLocal1',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, {
      installedByUids: arrayUnion(OUTSIDER),
      updatedAt: serverTimestamp(),
    }));
  });
});

// ─── Shared docs & files ────────────────────────────────────────────

describe('shared docs', () => {
  it('create validates kind and content cap', async () => {
    await seedSpace('private');
    const base = {
      spaceId: SPACE, title: 'Doc', kind: 'markdown', content: '# hi',
      sourceDocId: null, sourceProjectId: null, sourceUserId: MEMBER,
      linkedLocalIdsByUid: {}, pulledByUids: [],
      createdBy: MEMBER, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'docs', 'ok'), base));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'docs', 'k'),
      { ...base, kind: 'pdf' }));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'docs', 'big'),
      { ...base, content: 'x'.repeat(200001) }));
    await assertFails(setDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE, 'docs', 'ev'), base));
  });
});

describe('shared files', () => {
  it('create enforces size caps and membership', async () => {
    await seedSpace('private');
    const base = {
      spaceId: SPACE, name: 'notes.txt', mimeType: 'text/plain', size: 100,
      data: 'aGVsbG8=', caption: null, sourceUserId: MEMBER, downloadedByUids: [],
      createdBy: MEMBER, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'files', 'ok'), base));
    await assertFails(setDoc(doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'files', 'big'),
      { ...base, size: 614401 }));
    await assertFails(setDoc(doc(dbAs(OUTSIDER), 'collabSpaces', SPACE, 'files', 'ev'), base));
  });

  it('download fan-out appends own uid only; content fields locked to creator', async () => {
    await seedSpace('private');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'files', 'f1'), {
        spaceId: SPACE, name: 'a.png', mimeType: 'image/png', size: 10,
        data: 'aGVsbG8=', caption: null, sourceUserId: OWNER, downloadedByUids: [],
        createdBy: OWNER, createdAt: new Date(), updatedAt: new Date(),
      });
    });
    const ref = doc(dbAs(MEMBER), 'collabSpaces', SPACE, 'files', 'f1');
    await assertSucceeds(updateDoc(ref, {
      downloadedByUids: arrayUnion(MEMBER), updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, {
      downloadedByUids: arrayUnion(OUTSIDER), updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref, { name: 'defaced.png', updatedAt: serverTimestamp() }));
  });
});

// ─── Channels & default deny ────────────────────────────────────────

describe('channels', () => {
  it('members bump lastMessageAt only; owner renames; members cannot rename', async () => {
    await seedSpace('private');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'collabSpaces', SPACE, 'channels', 'general'), {
        spaceId: SPACE, name: 'general', description: '', createdBy: OWNER,
        createdAt: new Date(), updatedAt: new Date(), lastMessageAt: null,
        position: 0, isDefault: true,
      });
    });
    const ref = (uid: string) => doc(dbAs(uid), 'collabSpaces', SPACE, 'channels', 'general');
    await assertSucceeds(updateDoc(ref(MEMBER), {
      lastMessageAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(ref(MEMBER), { name: 'hijacked', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref(OWNER), { name: 'renamed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(OWNER), { createdBy: MEMBER, updatedAt: serverTimestamp() }));
  });
});

describe('default deny', () => {
  it('unknown top-level collections are unreadable and unwritable', async () => {
    await assertFails(getDoc(doc(dbAs(OWNER), 'users', 'alice')));
    await assertFails(setDoc(doc(dbAs(OWNER), 'anything', 'x'), { a: 1 }));
  });
});
