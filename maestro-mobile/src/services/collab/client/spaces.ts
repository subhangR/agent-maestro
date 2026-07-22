// src/services/collab/client/spaces.ts — space CRUD + membership, ported from
// maestro-ui/src/firebase/CollabSpaceClient.ts to the @react-native-firebase
// namespaced API. Same collection + field shapes → interoperates with desktop/CLI.
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

import {
  type CollabSpace,
  type CollabSpaceMember,
  type CollabSpaceVisibility,
  type CreateCollabSpaceInput,
  type MemberRole,
} from '../types';
import {
  COLLAB,
  type DocData,
  type DocumentSnapshot,
  type QuerySnapshot,
  arrayRemove,
  arrayUnion,
  asEnum,
  asString,
  asStringArray,
  asStringOrNull,
  db,
  deleteField,
  logSubError,
  millis,
  serverTimestamp,
  withRetry,
} from './firestore';

const VISIBILITIES: readonly CollabSpaceVisibility[] = ['public', 'private'];
const ROLES: readonly MemberRole[] = ['owner', 'admin', 'member'];

type User = Pick<FirebaseAuthTypes.User, 'uid' | 'displayName' | 'email' | 'photoURL'>;

function membersFromData(v: unknown): Record<string, CollabSpaceMember> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, CollabSpaceMember> = {};
  for (const [uid, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue; // skip legacy null tombstones
    const m = raw as Record<string, unknown>;
    out[uid] = {
      uid: asString(m.uid, uid),
      displayName: asStringOrNull(m.displayName),
      email: asStringOrNull(m.email),
      photoUrl: asStringOrNull(m.photoUrl),
      role: asEnum(m.role, ROLES, 'member'),
      joinedAtMs: millis(m.joinedAt),
    };
  }
  return out;
}

export function spaceFromData(id: string, d: DocData): CollabSpace {
  return {
    id,
    name: asString(d.name),
    description: asString(d.description),
    githubUrl: asString(d.githubUrl),
    githubHost: asString(d.githubHost),
    githubOwner: asString(d.githubOwner),
    githubRepo: asString(d.githubRepo),
    visibility: asEnum(d.visibility, VISIBILITIES, 'private'), // fail closed
    ownerId: asString(d.ownerId),
    memberIds: asStringArray(d.memberIds),
    members: membersFromData(d.members),
    createdAtMs: millis(d.createdAt),
    updatedAtMs: millis(d.updatedAt),
  };
}

function fromSnapshot(snap: DocumentSnapshot): CollabSpace | null {
  const data = snap.data();
  if (!snap.exists() || !data) return null;
  return spaceFromData(snap.id, data);
}

function fromQuery(snap: QuerySnapshot): CollabSpace[] {
  return snap.docs.map((d) => spaceFromData(d.id, d.data() as DocData));
}

function memberFromUser(user: User, role: MemberRole): Omit<CollabSpaceMember, 'joinedAtMs'> {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoUrl: user.photoURL,
    role,
  };
}

export const SpacesClient = {
  async create(user: User, input: CreateCollabSpaceInput): Promise<CollabSpace> {
    const now = serverTimestamp();
    const owner = memberFromUser(user, 'owner');
    // Pre-allocate ids so the space + default #general channel land in one atomic,
    // idempotent-on-retry batch.
    const spaceRef = db().collection(COLLAB).doc();
    const channelRef = spaceRef.collection('channels').doc();

    await withRetry(() => {
      const batch = db().batch();
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

    const fresh = await withRetry(() => spaceRef.get());
    const space = fromSnapshot(fresh);
    if (!space) throw new Error('Space was created but could not be read back.');
    return space;
  },

  async getById(spaceId: string): Promise<CollabSpace | null> {
    const snap = await withRetry(() => db().collection(COLLAB).doc(spaceId).get());
    return fromSnapshot(snap);
  },

  async listPublicForRepo(githubUrl: string): Promise<CollabSpace[]> {
    const snap = await withRetry(() =>
      db()
        .collection(COLLAB)
        .where('githubUrl', '==', githubUrl)
        .where('visibility', '==', 'public')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
    );
    return fromQuery(snap);
  },

  /**
   * Every space the user is a member of, across ALL repos. No orderBy → no
   * composite index needed; the mobile Spaces tab sorts + groups client-side.
   * This is the mobile home query (phone has no local git checkout to scope by).
   */
  subscribeToAllForUser(
    uid: string,
    cb: (spaces: CollabSpace[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return db()
      .collection(COLLAB)
      .where('memberIds', 'array-contains', uid)
      .limit(200)
      .onSnapshot(
        (snap) => cb(snap ? fromQuery(snap) : []),
        (err) => {
          logSubError('all-for-user', err);
          onError?.(err);
        },
      );
  },

  /** Public spaces for a repo (discover flow after the user picks a repo). */
  subscribeToPublicForRepo(
    githubUrl: string,
    cb: (spaces: CollabSpace[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return db()
      .collection(COLLAB)
      .where('githubUrl', '==', githubUrl)
      .where('visibility', '==', 'public')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .onSnapshot(
        (snap) => cb(snap ? fromQuery(snap) : []),
        (err) => {
          logSubError('public-for-repo', err);
          onError?.(err);
        },
      );
  },

  subscribeToSpace(
    spaceId: string,
    cb: (space: CollabSpace | null) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return db()
      .collection(COLLAB)
      .doc(spaceId)
      .onSnapshot(
        (snap) => cb(snap ? fromSnapshot(snap) : null),
        (err) => {
          logSubError('space', err);
          onError?.(err);
        },
      );
  },

  async join(user: User, spaceId: string): Promise<void> {
    const now = serverTimestamp();
    const member = memberFromUser(user, 'member');
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .update({
          memberIds: arrayUnion(user.uid),
          [`members.${user.uid}`]: { ...member, joinedAt: now },
          updatedAt: now,
        }),
    );
  },

  async leave(uid: string, spaceId: string): Promise<void> {
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .update({
          memberIds: arrayRemove(uid),
          [`members.${uid}`]: deleteField(),
          updatedAt: serverTimestamp(),
        }),
    );
  },

  async update(
    spaceId: string,
    patch: Partial<Pick<CollabSpace, 'name' | 'description' | 'visibility'>>,
  ): Promise<void> {
    await withRetry(() =>
      db().collection(COLLAB).doc(spaceId).update({ ...patch, updatedAt: serverTimestamp() }),
    );
  },

  async remove(spaceId: string): Promise<void> {
    await withRetry(() => db().collection(COLLAB).doc(spaceId).delete());
  },

  async setMemberRole(spaceId: string, targetUid: string, role: 'admin' | 'member'): Promise<void> {
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .update({ [`members.${targetUid}.role`]: role, updatedAt: serverTimestamp() }),
    );
  },

  async removeMember(spaceId: string, targetUid: string): Promise<void> {
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .update({
          memberIds: arrayRemove(targetUid),
          [`members.${targetUid}`]: deleteField(),
          updatedAt: serverTimestamp(),
        }),
    );
  },
};
