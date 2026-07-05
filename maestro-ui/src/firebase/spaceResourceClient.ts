import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  onSnapshot,
  Unsubscribe,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { getDb } from './firestore';
import { stripUndefinedDeep, withRetry } from './firestoreUtils';

const SPACES = 'collabSpaces';

/**
 * Every shared-entity subcollection (tasks / teamMembers / spells / docs /
 * files) has the same lifecycle: subscribe (createdAt DESC, capped), list,
 * update (creator/owner), delete, and a "fan-out" write any member may make
 * to record that they materialized the entity locally.
 *
 * This factory is the single implementation; per-entity clients supply a
 * coercing `fromData` (validated read boundary) and their fan-out fields.
 */

/** Hard cap on live shared-entity subscriptions — pathological spaces can't
 * pull tens of thousands of docs into memory. */
export const RESOURCE_SUBSCRIPTION_LIMIT = 500;

export interface SpaceResourceFanOut {
  /** Array field of uids that pulled/adopted/installed (e.g. `pulledByUids`). */
  uidsField: string;
  /** Optional per-uid map of local ids (e.g. `linkedLocalIdsByUid`). */
  linkedField?: string;
}

export interface SpaceResourceConfig<T> {
  /** Log prefix, e.g. 'SpaceTasks'. */
  label: string;
  /** Subcollection segment under collabSpaces/{spaceId}/. */
  segment: string;
  /** Validated snapshot → domain coercion. Never trusts raw data. */
  fromData: (id: string, data: DocumentData) => T;
  fanOut: SpaceResourceFanOut;
}

export interface SpaceResourceClient<T> {
  subscribe(
    spaceId: string,
    cb: (items: T[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe;
  list(spaceId: string): Promise<T[]>;
  update(spaceId: string, id: string, patch: Record<string, unknown>): Promise<void>;
  delete(spaceId: string, id: string): Promise<void>;
  /**
   * Records that `uid` materialized this shared entity locally (localId maps
   * the local copy when the collection tracks one). Fan-out fields are the
   * only fields non-creator members may write, enforced by Firestore rules.
   */
  recordFanOut(spaceId: string, id: string, uid: string, localId?: string): Promise<void>;
}

export function createSpaceResourceClient<T>(config: SpaceResourceConfig<T>): SpaceResourceClient<T> {
  const { label, segment, fromData, fanOut } = config;

  const col = (spaceId: string) => collection(getDb(), SPACES, spaceId, segment);
  const ref = (spaceId: string, id: string) => doc(getDb(), SPACES, spaceId, segment, id);

  const fromQuery = (snap: QuerySnapshot): T[] =>
    snap.docs.map((d) => fromData(d.id, d.data()));

  const orderedQuery = (spaceId: string) =>
    query(col(spaceId), orderBy('createdAt', 'desc'), limit(RESOURCE_SUBSCRIPTION_LIMIT));

  return {
    subscribe(spaceId, cb, onError) {
      return onSnapshot(
        orderedQuery(spaceId),
        (snap) => cb(fromQuery(snap)),
        (err) => {
          // eslint-disable-next-line no-console
          console.warn(`[${label}] subscribe failed:`, err);
          onError?.(err);
        },
      );
    },

    async list(spaceId) {
      const snap = await withRetry(() => getDocs(orderedQuery(spaceId)));
      return fromQuery(snap);
    },

    async update(spaceId, id, patch) {
      await withRetry(() =>
        updateDoc(ref(spaceId, id), {
          ...stripUndefinedDeep(patch),
          updatedAt: serverTimestamp(),
        }),
      );
    },

    async delete(spaceId, id) {
      await withRetry(() => deleteDoc(ref(spaceId, id)));
    },

    // NOTE: adoption/install counts are intentionally NOT written as
    // denormalized counters — increment(1) is not idempotent (retries and
    // double-installs drift it) while arrayUnion(uid) is. Counts are derived
    // from the uids array length at the read boundary instead.
    async recordFanOut(spaceId, id, uid, localId) {
      const patch: Record<string, unknown> = {
        [fanOut.uidsField]: arrayUnion(uid),
        updatedAt: serverTimestamp(),
      };
      if (fanOut.linkedField && localId) patch[`${fanOut.linkedField}.${uid}`] = localId;
      await withRetry(() => updateDoc(ref(spaceId, id), patch));
    },
  };
}
