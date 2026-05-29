import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { getDb } from './firestore';
import {
  SpaceTaskPriority,
  SpaceTaskStatus,
} from './spaceShareTypes';

/**
 * Writes shared entities (tasks, team members, spells) into a Collab Space.
 *
 * Each call creates a fresh document under
 * `collabSpaces/{spaceId}/{tasks|teamMembers|spells}` and records provenance
 * fields so future "pull to local" flows can show the lineage.
 */

export interface SharedTaskInput {
  title: string;
  description: string;
  status: SpaceTaskStatus;
  priority: SpaceTaskPriority;
  sourceTaskId: string | null;
  sourceProjectId: string | null;
}

export interface SharedTeamMemberInput {
  name: string;
  role: string;
  identity: string;
  avatar: string | null;
  model: string | null;
  agentTool: string | null;
  mode: string | null;
  skillIds: string[];
  commandPermissions: {
    groups?: Record<string, boolean>;
    commands?: Record<string, boolean>;
  };
  sourceTeamMemberId: string | null;
  sourceProjectId: string | null;
}

export interface SharedSpellInput {
  name: string;
  description: string;
  body: string;
  entityType: string;
  icon: string | null;
  sourceSpellId: string | null;
}

export const SpaceShareClient = {
  async shareTask(user: User, spaceId: string, input: SharedTaskInput): Promise<string> {
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'tasks'));
    const now = serverTimestamp();

    await setDoc(ref, {
      spaceId,
      title: input.title,
      description: input.description ?? '',
      status: input.status,
      priority: input.priority,
      assigneeUids: [],
      parentTaskId: null,
      childrenIds: [],
      position: Date.now(),
      sourceTaskId: input.sourceTaskId,
      sourceProjectId: input.sourceProjectId,
      sourceUserId: user.uid,
      // Pull fan-out fields, initialized empty
      linkedLocalIdsByUid: {},
      pulledByUids: [],
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    return ref.id;
  },

  async shareTeamMember(
    user: User,
    spaceId: string,
    input: SharedTeamMemberInput,
  ): Promise<string> {
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'teamMembers'));
    const now = serverTimestamp();

    await setDoc(ref, {
      spaceId,
      name: input.name,
      role: input.role ?? '',
      identity: input.identity ?? '',
      avatar: input.avatar,
      model: input.model,
      agentTool: input.agentTool,
      mode: input.mode,
      skillIds: input.skillIds ?? [],
      commandPermissions: input.commandPermissions ?? {},
      sourceTeamMemberId: input.sourceTeamMemberId,
      sourceProjectId: input.sourceProjectId,
      sourceUserId: user.uid,
      // Adoption fan-out fields, initialized empty
      adoptedByUids: [],
      adoptionCount: 0,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    return ref.id;
  },

  async shareSpell(user: User, spaceId: string, input: SharedSpellInput): Promise<string> {
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'spells'));
    const now = serverTimestamp();

    await setDoc(ref, {
      spaceId,
      name: input.name,
      description: input.description ?? '',
      body: input.body ?? '',
      entityType: input.entityType,
      icon: input.icon,
      sourceSpellId: input.sourceSpellId,
      sourceUserId: user.uid,
      // Install fan-out fields, initialized empty
      installedByUids: [],
      installCount: 0,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    });

    return ref.id;
  },
};
