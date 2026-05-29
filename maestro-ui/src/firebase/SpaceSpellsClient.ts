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
import { SpaceSpell } from './spaceShareTypes';

const SPACES = 'collabSpaces';
const SPELLS = 'spells';

function spellsCol(spaceId: string) {
  return collection(getDb(), SPACES, spaceId, SPELLS);
}

function spellDoc(spaceId: string, spellId: string) {
  return doc(getDb(), SPACES, spaceId, SPELLS, spellId);
}

function fromSnap(snap: QueryDocumentSnapshot): SpaceSpell {
  const d = snap.data() as DocumentData;
  return {
    id: snap.id,
    spaceId: d.spaceId,
    name: d.name ?? '',
    description: d.description ?? '',
    body: d.body ?? '',
    entityType: d.entityType ?? 'session',
    icon: d.icon ?? null,
    sourceSpellId: d.sourceSpellId ?? null,
    sourceUserId: d.sourceUserId ?? null,
    installedByUids: d.installedByUids ?? [],
    installCount: typeof d.installCount === 'number' ? d.installCount : (d.installedByUids?.length ?? 0),
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function fromQuery(snap: QuerySnapshot): SpaceSpell[] {
  return snap.docs.map((d) => fromSnap(d));
}

export const SpaceSpellsClient = {
  subscribe(spaceId: string, cb: (items: SpaceSpell[]) => void): Unsubscribe {
    const q = query(spellsCol(spaceId), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(fromQuery(snap)),
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[SpaceSpells] subscribe failed:', err);
      },
    );
  },

  async list(spaceId: string): Promise<SpaceSpell[]> {
    const q = query(spellsCol(spaceId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return fromQuery(snap);
  },

  async update(
    spaceId: string,
    spellId: string,
    patch: Partial<Pick<SpaceSpell, 'name' | 'description' | 'body' | 'icon' | 'entityType'>>,
  ): Promise<void> {
    await updateDoc(spellDoc(spaceId, spellId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(spaceId: string, spellId: string): Promise<void> {
    await deleteDoc(spellDoc(spaceId, spellId));
  },

  async recordInstall(spaceId: string, spellId: string, uid: string): Promise<void> {
    await updateDoc(spellDoc(spaceId, spellId), {
      installedByUids: arrayUnion(uid),
      installCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  },
};
