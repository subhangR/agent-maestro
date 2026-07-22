import { DocumentData } from 'firebase/firestore';
import { SpaceTask, SpaceTaskStatus, SpaceTaskPriority } from './spaceShareTypes';
import { createSpaceResourceClient } from './spaceResourceClient';
import {
  asString,
  asStringOrNull,
  asStringArray,
  asStringRecord,
  asNumber,
  asBoolean,
  asEnum,
} from './firestoreUtils';

const TASK_STATUSES: readonly SpaceTaskStatus[] = [
  'todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked',
];
const TASK_PRIORITIES: readonly SpaceTaskPriority[] = ['high', 'medium', 'low'];

function fromData(id: string, d: DocumentData): SpaceTask {
  return {
    id,
    spaceId: asString(d.spaceId),
    title: asString(d.title),
    description: asString(d.description),
    status: asEnum(d.status, TASK_STATUSES, 'todo'),
    priority: asEnum(d.priority, TASK_PRIORITIES, 'medium'),
    initialPrompt: asString(d.initialPrompt),
    dueDate: asStringOrNull(d.dueDate),
    dangerousMode: asBoolean(d.dangerousMode),
    useWorktree: asBoolean(d.useWorktree),
    assigneeUids: asStringArray(d.assigneeUids),
    parentTaskId: asStringOrNull(d.parentTaskId),
    childrenIds: asStringArray(d.childrenIds),
    position: asNumber(d.position),
    sourceTaskId: asStringOrNull(d.sourceTaskId),
    sourceProjectId: asStringOrNull(d.sourceProjectId),
    sourceUserId: asStringOrNull(d.sourceUserId),
    linkedLocalIdsByUid: asStringRecord(d.linkedLocalIdsByUid),
    pulledByUids: asStringArray(d.pulledByUids),
    createdBy: asString(d.createdBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const client = createSpaceResourceClient<SpaceTask>({
  label: 'SpaceTasks',
  segment: 'tasks',
  fromData,
  fanOut: { uidsField: 'pulledByUids', linkedField: 'linkedLocalIdsByUid' },
});

export const SpaceTasksClient = {
  subscribe: client.subscribe,
  list: client.list,

  async update(
    spaceId: string,
    taskId: string,
    patch: Partial<Pick<SpaceTask, 'title' | 'description' | 'status' | 'priority' | 'assigneeUids'>>,
  ): Promise<void> {
    await client.update(spaceId, taskId, patch);
  },

  delete: client.delete,

  /**
   * Records that `uid` has materialized this shared task into local task
   * `localTaskId`. Fan-out fields are the only fields non-creator members
   * may write (enforced by rules, pinned to the caller's own uid).
   */
  async recordPull(spaceId: string, taskId: string, uid: string, localTaskId: string): Promise<void> {
    await client.recordFanOut(spaceId, taskId, uid, localTaskId);
  },
};
