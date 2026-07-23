import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch,
  runTransaction,
  Unsubscribe,
  DocumentSnapshot,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { getDb } from './firestore';
import {
  CollabSpace,
  CollabSpaceVisibility,
  CreateCollabSpaceInput,
  CollabSpaceMember,
  CollabSpaceInvite,
  CreateCollabSpaceInviteInput,
} from './collabSpaceTypes';
import { asString, asStringOrNull, asStringArray, asEnum, withRetry } from './firestoreUtils';
import { buildInviteLink, generateInviteId, isInviteId, normalizeInviteId } from './spaceInvite';

const COLLECTION = 'collabSpaces';

const VISIBILITIES: readonly CollabSpaceVisibility[] = ['public', 'private'];
const MEMBER_ROLES: readonly CollabSpaceMember['role'][] = ['owner', 'admin', 'member'];

function membersFromData(v: unknown): Record<string, CollabSpaceMember> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, CollabSpaceMember> = {};
  for (const [uid, raw] of Object.entries(v as Record<string, unknown>)) {
    // Skip tombstoned/malformed entries (older builds wrote `null` on leave).
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    out[uid] = {
      uid: asString(m.uid, uid),
      displayName: asStringOrNull(m.displayName),
      email: asStringOrNull(m.email),
      photoUrl: asStringOrNull(m.photoUrl),
      role: asEnum(m.role, MEMBER_ROLES, 'member'),
      joinedAt: m.joinedAt as CollabSpaceMember['joinedAt'],
    };
  }
  return out;
}

function spaceFromData(id: string, d: DocumentData): CollabSpace {
  return {
    id,
    name: asString(d.name),
    description: asString(d.description),
    githubUrl: asString(d.githubUrl),
    githubHost: asString(d.githubHost),
    githubOwner: asString(d.githubOwner),
    githubRepo: asString(d.githubRepo),
    // Fail closed: an unrecognized visibility value is treated as private.
    visibility: asEnum(d.visibility, VISIBILITIES, 'private'),
    ownerId: asString(d.ownerId),
    memberIds: asStringArray(d.memberIds),
    members: membersFromData(d.members),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function fromSnapshot(snap: DocumentSnapshot): CollabSpace | null {
  if (!snap.exists()) return null;
  return spaceFromData(snap.id, snap.data());
}

function fromQuery(snap: QuerySnapshot): CollabSpace[] {
  return snap.docs.map((d) => spaceFromData(d.id, d.data()));
}

function inviteFromData(id: string, d: DocumentData): CollabSpaceInvite {
  return {
    id,
    spaceId: asString(d.spaceId),
    kind: asEnum(d.kind, ['link', 'code'] as const, 'link'),
    maxUses: typeof d.maxUses === 'number' ? d.maxUses : 1,
    useCount: typeof d.useCount === 'number' ? d.useCount : 0,
    redeemedByUids: asStringArray(d.redeemedByUids),
    expiresAt: d.expiresAt ?? null,
    revokedAt: d.revokedAt ?? null,
    createdBy: asString(d.createdBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function memberFromUser(user: User, role: CollabSpaceMember['role']): Omit<CollabSpaceMember, 'joinedAt'> {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoUrl: user.photoURL,
    role,
  };
}

function logSubError(scope: string, err: Error): void {
  // eslint-disable-next-line no-console
  console.warn(`[CollabSpaces] ${scope} subscription failed:`, err);
}

export const CollabSpaceClient = {
  async create(user: User, input: CreateCollabSpaceInput): Promise<CollabSpace> {
    const db = getDb();
    const now = serverTimestamp();
    const owner = memberFromUser(user, 'owner');

    // Pre-allocate the space doc id so we can write the default #general
    // channel in the same atomic batch as the space itself — and so retrying
    // a transient commit failure is idempotent (same ids).
    const spaceRef = doc(collection(db, COLLECTION));
    const channelRef = doc(collection(db, COLLECTION, spaceRef.id, 'channels'));

    await withRetry(() => {
      const batch = writeBatch(db);
      batch.set(spaceRef, {
        name: input.name,
        description: input.description ?? '',
        githubUrl: input.githubUrl,
        githubHost: input.githubHost,
        githubOwner: input.githubOwner,
        githubRepo: input.githubRepo,
        visibility: input.visibility,
        ownerId: user.uid,
        memberIds: [user.uid],
        members: { [user.uid]: { ...owner, joinedAt: now } },
        createdAt: now,
        updatedAt: now,
      });
      batch.set(channelRef, {
        spaceId: spaceRef.id,
        name: 'general',
        description: 'Default channel for this space',
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        position: 0,
        isDefault: true,
      });
      return batch.commit();
    });

    const fresh = await withRetry(() => getDoc(spaceRef));
    const space = fromSnapshot(fresh);
    if (!space) throw new Error('Space was created but could not be read back.');
    return space;
  },

  async getById(spaceId: string): Promise<CollabSpace | null> {
    const db = getDb();
    const snap = await withRetry(() => getDoc(doc(db, COLLECTION, spaceId)));
    return fromSnapshot(snap);
  },

  async listPublicForRepo(githubUrl: string): Promise<CollabSpace[]> {
    const db = getDb();
    const q = query(
      collection(db, COLLECTION),
      where('githubUrl', '==', githubUrl),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const snap = await withRetry(() => getDocs(q));
    return fromQuery(snap);
  },

  async listMineForRepo(uid: string, githubUrl: string): Promise<CollabSpace[]> {
    const db = getDb();
    const q = query(
      collection(db, COLLECTION),
      where('githubUrl', '==', githubUrl),
      where('memberIds', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const snap = await withRetry(() => getDocs(q));
    return fromQuery(snap);
  },

  subscribeToRepo(
    githubUrl: string,
    uid: string,
    handlers: {
      onMine: (spaces: CollabSpace[]) => void;
      onPublic: (spaces: CollabSpace[]) => void;
      onError?: (err: Error) => void;
    },
  ): Unsubscribe {
    const db = getDb();
    const mineQ = query(
      collection(db, COLLECTION),
      where('githubUrl', '==', githubUrl),
      where('memberIds', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const publicQ = query(
      collection(db, COLLECTION),
      where('githubUrl', '==', githubUrl),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsubMine = onSnapshot(
      mineQ,
      (snap) => handlers.onMine(fromQuery(snap)),
      (err) => {
        logSubError('mine-for-repo', err);
        handlers.onError?.(err);
      },
    );
    const unsubPublic = onSnapshot(
      publicQ,
      (snap) => handlers.onPublic(fromQuery(snap)),
      (err) => {
        logSubError('public-for-repo', err);
        handlers.onError?.(err);
      },
    );
    return () => {
      unsubMine();
      unsubPublic();
    };
  },

  subscribeToSpace(
    spaceId: string,
    cb: (space: CollabSpace | null) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    const db = getDb();
    return onSnapshot(
      doc(db, COLLECTION, spaceId),
      (snap) => cb(fromSnapshot(snap)),
      (err) => {
        logSubError('space', err);
        onError?.(err);
      },
    );
  },

  /**
   * Subscribes to every space the user is a member of, across all repos.
   * Note: intentionally omits a server-side `orderBy` so this query does NOT
   * require a composite index. Callers sort client-side.
   */
  subscribeToAllForUser(
    uid: string,
    cb: (spaces: CollabSpace[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    const db = getDb();
    const q = query(
      collection(db, COLLECTION),
      where('memberIds', 'array-contains', uid),
      limit(200),
    );
    return onSnapshot(
      q,
      (snap) => cb(fromQuery(snap)),
      (err) => {
        logSubError('all-for-user', err);
        onError?.(err);
      },
    );
  },

  async join(user: User, spaceId: string): Promise<void> {
    const db = getDb();
    const now = serverTimestamp();
    const member = memberFromUser(user, 'member');
    await withRetry(() => updateDoc(doc(db, COLLECTION, spaceId), {
      memberIds: arrayUnion(user.uid),
      [`members.${user.uid}`]: { ...member, joinedAt: now },
      updatedAt: now,
    }));
  },

  async leave(user: User, spaceId: string): Promise<void> {
    const db = getDb();
    await withRetry(() => updateDoc(doc(db, COLLECTION, spaceId), {
      memberIds: arrayRemove(user.uid),
      // deleteField (not null) — a null tombstone lingers in the members map
      // and every reader would have to filter it out forever.
      [`members.${user.uid}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }));
  },

  /**
   * Update editable space fields (name / description / visibility).
   * Allowed only for the owner / admins by Firestore rules.
   */
  async update(
    spaceId: string,
    patch: Partial<Pick<CollabSpace, 'name' | 'description' | 'visibility'>>,
  ): Promise<void> {
    const db = getDb();
    await withRetry(() => updateDoc(doc(db, COLLECTION, spaceId), {
      ...patch,
      updatedAt: serverTimestamp(),
    }));
  },

  /**
   * Delete the space root doc. Subcollections are NOT cleaned up here — that
   * is left for a Cloud Function (or future client-side batched walk). v1
   * accepts the orphaned-subcollection cost since members can no longer
   * access them once the root doc is gone.
   */
  async delete(spaceId: string): Promise<void> {
    const db = getDb();
    await withRetry(() => deleteDoc(doc(db, COLLECTION, spaceId)));
  },

  /**
   * Set a member's role. Allowed only for owner / admin by Firestore rules.
   * The owner cannot be demoted via this method (the rules will reject it).
   */
  async setMemberRole(
    spaceId: string,
    targetUid: string,
    role: 'admin' | 'member',
  ): Promise<void> {
    const db = getDb();
    await withRetry(() => updateDoc(doc(db, COLLECTION, spaceId), {
      [`members.${targetUid}.role`]: role,
      updatedAt: serverTimestamp(),
    }));
  },

  /**
   * Remove a member from the space. Allowed only for owner / admin by rules.
   * The owner cannot be removed.
   */
  async removeMember(spaceId: string, targetUid: string): Promise<void> {
    const db = getDb();
    await withRetry(() => updateDoc(doc(db, COLLECTION, spaceId), {
      memberIds: arrayRemove(targetUid),
      [`members.${targetUid}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }));
  },

  /**
   * Creates an opaque, revocable invitation for a private space. The invite id
   * is deliberately the only bearer secret and is never stored in plaintext in
   * a field, so Firestore backups/logs cannot expose a second reusable token.
   */
  async createInvite(
    user: User,
    spaceId: string,
    input: CreateCollabSpaceInviteInput,
  ): Promise<CollabSpaceInvite> {
    if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 1000) {
      throw new Error('Invite use limit must be between 1 and 1,000.');
    }
    const db = getDb();
    const inviteRef = doc(
      db,
      COLLECTION,
      spaceId,
      'invites',
      generateInviteId(input.kind),
    );
    const now = serverTimestamp();
    await withRetry(() => writeBatch(db)
      .set(inviteRef, {
        spaceId,
        kind: input.kind,
        maxUses: input.maxUses,
        useCount: 0,
        redeemedByUids: [],
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      })
      .commit());
    const fresh = await withRetry(() => getDoc(inviteRef));
    if (!fresh.exists()) throw new Error('Invite was created but could not be read back.');
    return inviteFromData(fresh.id, fresh.data());
  },

  async listInvites(spaceId: string): Promise<CollabSpaceInvite[]> {
    const db = getDb();
    const invites = await withRetry(() => getDocs(query(
      collection(db, COLLECTION, spaceId, 'invites'),
      orderBy('createdAt', 'desc'),
      limit(100),
    )));
    return invites.docs.map((snap) => inviteFromData(snap.id, snap.data()));
  },

  async revokeInvite(spaceId: string, inviteId: string): Promise<void> {
    const db = getDb();
    await withRetry(() => updateDoc(doc(db, COLLECTION, spaceId, 'invites', inviteId), {
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  },

  /**
   * Redeems one private invitation in a single Firestore transaction. The
   * rules require the invite increment, immutable claim, and membership write
   * to be committed together, preventing link replay or a client-side bypass.
   */
  async redeemInvite(user: User, spaceId: string, rawInviteId: string): Promise<void> {
    const inviteId = normalizeInviteId(rawInviteId);
    if (!isInviteId(inviteId)) throw new Error('Enter a valid invite link or join code.');
    const db = getDb();
    const spaceRef = doc(db, COLLECTION, spaceId);
    const inviteRef = doc(db, COLLECTION, spaceId, 'invites', inviteId);
    const claimRef = doc(db, COLLECTION, spaceId, 'inviteClaims', user.uid);
    const member = memberFromUser(user, 'member');

    await withRetry(() => runTransaction(db, async (transaction) => {
      const inviteSnap = await transaction.get(inviteRef);
      if (!inviteSnap.exists()) throw new Error('This invitation is invalid or has been revoked.');

      const invite = inviteFromData(inviteSnap.id, inviteSnap.data());
      const expiresAt = invite.expiresAt?.toDate().getTime() ?? null;
      if (invite.revokedAt || (expiresAt !== null && expiresAt <= Date.now())) {
        throw new Error('This invitation has expired or was revoked.');
      }
      if (invite.useCount >= invite.maxUses || invite.redeemedByUids.includes(user.uid)) {
        throw new Error('This invitation has reached its use limit.');
      }

      const now = serverTimestamp();
      transaction.update(inviteRef, {
        useCount: invite.useCount + 1,
        redeemedByUids: [...invite.redeemedByUids, user.uid],
        updatedAt: now,
      });
      transaction.set(claimRef, {
        spaceId,
        inviteId,
        uid: user.uid,
        createdAt: now,
      });
      transaction.update(spaceRef, {
        memberIds: arrayUnion(user.uid),
        [`members.${user.uid}`]: { ...member, joinedAt: now },
        updatedAt: now,
      });
    }));
  },

  /** Builds a signed-in browser/deep-link route for an opaque invite id. */
  buildInviteLink(spaceId: string, inviteId: string): string {
    return buildInviteLink(spaceId, inviteId);
  },
};
