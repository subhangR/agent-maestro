import {
  collection,
  doc,
  query,
  orderBy,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  increment,
  onSnapshot,
  Unsubscribe,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { getDb } from './firestore';
import { SpaceTeamMember } from './spaceShareTypes';

const SPACES = 'collabSpaces';
const TEAM_MEMBERS = 'teamMembers';

function tmCol(spaceId: string) {
  return collection(getDb(), SPACES, spaceId, TEAM_MEMBERS);
}

function tmDoc(spaceId: string, tmId: string) {
  return doc(getDb(), SPACES, spaceId, TEAM_MEMBERS, tmId);
}

function fromSnap(snap: QueryDocumentSnapshot): SpaceTeamMember {
  const d = snap.data() as DocumentData;
  return {
    id: snap.id,
    spaceId: d.spaceId,
    name: d.name ?? '',
    role: d.role ?? '',
    identity: d.identity ?? '',
    avatar: d.avatar ?? null,
    model: d.model ?? null,
    agentTool: d.agentTool ?? null,
    mode: d.mode ?? null,
    skillIds: d.skillIds ?? [],
    commandPermissions: d.commandPermissions ?? {},
    sourceTeamMemberId: d.sourceTeamMemberId ?? null,
    sourceProjectId: d.sourceProjectId ?? null,
    sourceUserId: d.sourceUserId ?? null,
    adoptedByUids: d.adoptedByUids ?? [],
    adoptionCount: typeof d.adoptionCount === 'number' ? d.adoptionCount : (d.adoptedByUids?.length ?? 0),
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function fromQuery(snap: QuerySnapshot): SpaceTeamMember[] {
  return snap.docs.map((d) => fromSnap(d));
}

export const SpaceTeamMembersClient = {
  subscribe(
    spaceId: string,
    cb: (items: SpaceTeamMember[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    const q = query(tmCol(spaceId), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(fromQuery(snap)),
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[SpaceTeamMembers] subscribe failed:', err);
        onError?.(err);
      },
    );
  },

  async list(spaceId: string): Promise<SpaceTeamMember[]> {
    const q = query(tmCol(spaceId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return fromQuery(snap);
  },

  async update(
    spaceId: string,
    tmId: string,
    patch: Partial<Pick<SpaceTeamMember, 'name' | 'role' | 'identity' | 'model' | 'agentTool' | 'mode' | 'commandPermissions' | 'skillIds'>>,
  ): Promise<void> {
    await updateDoc(tmDoc(spaceId, tmId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(spaceId: string, tmId: string): Promise<void> {
    await deleteDoc(tmDoc(spaceId, tmId));
  },

  /**
   * Records that `uid` has adopted this team member locally. Bumps the
   * `adoptedByUids` array and increments `adoptionCount` (both whitelisted
   * for non-creator updates by rules).
   */
  async recordAdopt(spaceId: string, tmId: string, uid: string): Promise<void> {
    await updateDoc(tmDoc(spaceId, tmId), {
      adoptedByUids: arrayUnion(uid),
      adoptionCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  },
};
