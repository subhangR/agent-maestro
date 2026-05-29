import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch,
  Unsubscribe,
  DocumentSnapshot,
  QuerySnapshot,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { getDb } from './firestore';
import { CollabSpace, CreateCollabSpaceInput, CollabSpaceMember } from './collabSpaceTypes';

const COLLECTION = 'collabSpaces';

function fromSnapshot(snap: DocumentSnapshot): CollabSpace | null {
  if (!snap.exists()) return null;
  const data = snap.data();
  return { id: snap.id, ...(data as Omit<CollabSpace, 'id'>) };
}

function fromQuery(snap: QuerySnapshot): CollabSpace[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CollabSpace, 'id'>) }));
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

export const CollabSpaceClient = {
  async create(user: User, input: CreateCollabSpaceInput): Promise<CollabSpace> {
    const db = getDb();
    const now = serverTimestamp();
    const owner = memberFromUser(user, 'owner');

    // Pre-allocate the space doc id so we can write the default #general
    // channel in the same atomic batch as the space itself.
    const spaceRef = doc(collection(db, COLLECTION));
    const channelRef = doc(collection(db, COLLECTION, spaceRef.id, 'channels'));

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
    await batch.commit();

    const fresh = await getDoc(spaceRef);
    return fromSnapshot(fresh)!;
  },

  async getById(spaceId: string): Promise<CollabSpace | null> {
    const db = getDb();
    const snap = await getDoc(doc(db, COLLECTION, spaceId));
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
    const snap = await getDocs(q);
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
    const snap = await getDocs(q);
    return fromQuery(snap);
  },

  subscribeToRepo(
    githubUrl: string,
    uid: string,
    handlers: { onMine: (spaces: CollabSpace[]) => void; onPublic: (spaces: CollabSpace[]) => void },
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
    const unsubMine = onSnapshot(mineQ, (snap) => handlers.onMine(fromQuery(snap)));
    const unsubPublic = onSnapshot(publicQ, (snap) => handlers.onPublic(fromQuery(snap)));
    return () => {
      unsubMine();
      unsubPublic();
    };
  },

  subscribeToSpace(spaceId: string, cb: (space: CollabSpace | null) => void): Unsubscribe {
    const db = getDb();
    return onSnapshot(doc(db, COLLECTION, spaceId), (snap) => cb(fromSnapshot(snap)));
  },

  /**
   * Subscribes to every space the user is a member of, across all repos.
   * Note: intentionally omits a server-side `orderBy` so this query does NOT
   * require a composite index. Callers sort client-side.
   */
  subscribeToAllForUser(
    uid: string,
    cb: (spaces: CollabSpace[]) => void,
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
        // Surface the error so we don't silently fall back to an empty list.
        // The list of joined spaces remains empty on error; UI shows "none yet".
        // eslint-disable-next-line no-console
        console.warn('[CollabSpaces] subscribeToAllForUser failed:', err);
      },
    );
  },

  async join(user: User, spaceId: string): Promise<void> {
    const db = getDb();
    const now = serverTimestamp();
    const member = memberFromUser(user, 'member');
    await updateDoc(doc(db, COLLECTION, spaceId), {
      memberIds: arrayUnion(user.uid),
      [`members.${user.uid}`]: { ...member, joinedAt: now },
      updatedAt: now,
    });
  },

  async leave(user: User, spaceId: string): Promise<void> {
    const db = getDb();
    await updateDoc(doc(db, COLLECTION, spaceId), {
      memberIds: arrayRemove(user.uid),
      [`members.${user.uid}`]: null,
      updatedAt: serverTimestamp(),
    });
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
    await updateDoc(doc(db, COLLECTION, spaceId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Delete the space root doc. Subcollections are NOT cleaned up here — that
   * is left for a Cloud Function (or future client-side batched walk). v1
   * accepts the orphaned-subcollection cost since members can no longer
   * access them once the root doc is gone.
   */
  async delete(spaceId: string): Promise<void> {
    const db = getDb();
    await deleteDoc(doc(db, COLLECTION, spaceId));
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
    await updateDoc(doc(db, COLLECTION, spaceId), {
      [`members.${targetUid}.role`]: role,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Remove a member from the space. Allowed only for owner / admin by rules.
   * The owner cannot be removed.
   */
  async removeMember(spaceId: string, targetUid: string): Promise<void> {
    const db = getDb();
    await updateDoc(doc(db, COLLECTION, spaceId), {
      memberIds: arrayRemove(targetUid),
      [`members.${targetUid}`]: null,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Build the canonical join link for a space. v1 uses `spaceId`-only links
   * (no token) so this is just a derived URL — `acceptInvite` is handled by
   * the existing `join()` method on a public space.
   */
  buildInviteLink(spaceId: string): string {
    return `https://maestro.app/space/${spaceId}/join`;
  },
};
