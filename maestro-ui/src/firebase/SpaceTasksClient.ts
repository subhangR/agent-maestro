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
  onSnapshot,
  Unsubscribe,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { getDb } from './firestore';
import { SpaceTask } from './spaceShareTypes';

const SPACES = 'collabSpaces';
const TASKS = 'tasks';

function tasksCol(spaceId: string) {
  return collection(getDb(), SPACES, spaceId, TASKS);
}

function taskDoc(spaceId: string, taskId: string) {
  return doc(getDb(), SPACES, spaceId, TASKS, taskId);
}

function fromSnap(snap: QueryDocumentSnapshot): SpaceTask {
  const d = snap.data() as DocumentData;
  return {
    id: snap.id,
    spaceId: d.spaceId,
    title: d.title ?? '',
    description: d.description ?? '',
    status: d.status,
    priority: d.priority,
    assigneeUids: d.assigneeUids ?? [],
    parentTaskId: d.parentTaskId ?? null,
    childrenIds: d.childrenIds ?? [],
    position: typeof d.position === 'number' ? d.position : 0,
    sourceTaskId: d.sourceTaskId ?? null,
    sourceProjectId: d.sourceProjectId ?? null,
    sourceUserId: d.sourceUserId ?? null,
    linkedLocalIdsByUid: d.linkedLocalIdsByUid ?? {},
    pulledByUids: d.pulledByUids ?? [],
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function fromQuery(snap: QuerySnapshot): SpaceTask[] {
  return snap.docs.map((d) => fromSnap(d));
}

export const SpaceTasksClient = {
  subscribe(spaceId: string, cb: (tasks: SpaceTask[]) => void): Unsubscribe {
    const q = query(tasksCol(spaceId), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(fromQuery(snap)),
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[SpaceTasks] subscribe failed:', err);
      },
    );
  },

  async list(spaceId: string): Promise<SpaceTask[]> {
    const q = query(tasksCol(spaceId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return fromQuery(snap);
  },

  async update(
    spaceId: string,
    taskId: string,
    patch: Partial<Pick<SpaceTask, 'title' | 'description' | 'status' | 'priority' | 'assigneeUids'>>,
  ): Promise<void> {
    await updateDoc(taskDoc(spaceId, taskId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(spaceId: string, taskId: string): Promise<void> {
    await deleteDoc(taskDoc(spaceId, taskId));
  },

  /**
   * Records that `uid` has materialized this shared task into local task
   * `localTaskId`. Bumps the fan-out fields the rules whitelist for non-creators.
   */
  async recordPull(
    spaceId: string,
    taskId: string,
    uid: string,
    localTaskId: string,
  ): Promise<void> {
    await updateDoc(taskDoc(spaceId, taskId), {
      [`linkedLocalIdsByUid.${uid}`]: localTaskId,
      pulledByUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  },
};
