import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import type { SpellColorSlug } from '../app/types/maestro';
import { getDb } from './firestore';
import {
  SpaceTaskPriority,
  SpaceTaskStatus,
  SpaceSpellRule,
  SpaceDocKind,
  SPACE_SPELL_SCHEMA_VERSION,
  SPACE_DOC_MAX_CONTENT_CHARS,
  SPACE_FILE_MAX_RAW_BYTES,
  SPACE_FILE_MAX_DATA_CHARS,
} from './spaceShareTypes';
import { stripUndefinedDeep, withRetry } from './firestoreUtils';

/**
 * Writes shared entities (tasks, team members, spells, docs, files) into a
 * Collab Space.
 *
 * Each call creates a fresh document under
 * `collabSpaces/{spaceId}/{tasks|teamMembers|spells|docs|files}` and records
 * provenance fields so "pull to local" flows can show the lineage. Doc refs
 * are pre-allocated so retries are idempotent (same document id).
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
  /** Human-readable rules preview (kept for legacy readers + list previews). */
  body: string;
  color: SpellColorSlug;
  /** Lossless rules payload (label/enabled/trigger/action per rule). */
  rules: SpaceSpellRule[];
  icon: string | null;
  sourceSpellId: string | null;
  sourceProjectId: string | null;
}

export interface SharedDocInput {
  title: string;
  kind: SpaceDocKind;
  content: string;
  sourceDocId: string | null;
  sourceProjectId: string | null;
}

export interface SharedFileInput {
  name: string;
  mimeType: string;
  /** Raw (pre-base64) size in bytes. */
  size: number;
  /** Base64-encoded content. */
  data: string;
  caption: string | null;
}

export const SpaceShareClient = {
  async shareTask(user: User, spaceId: string, input: SharedTaskInput): Promise<string> {
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'tasks'));
    const now = serverTimestamp();

    await withRetry(() => setDoc(ref, {
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
    }));

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

    await withRetry(() => setDoc(ref, {
      spaceId,
      name: input.name,
      role: input.role ?? '',
      identity: input.identity ?? '',
      avatar: input.avatar,
      model: input.model,
      agentTool: input.agentTool,
      mode: input.mode,
      skillIds: input.skillIds ?? [],
      commandPermissions: stripUndefinedDeep(input.commandPermissions ?? {}),
      sourceTeamMemberId: input.sourceTeamMemberId,
      sourceProjectId: input.sourceProjectId,
      sourceUserId: user.uid,
      // Adoption fan-out fields, initialized empty
      adoptedByUids: [],
      linkedLocalIdsByUid: {},
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }));

    return ref.id;
  },

  async shareSpell(user: User, spaceId: string, input: SharedSpellInput): Promise<string> {
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'spells'));
    const now = serverTimestamp();

    await withRetry(() => setDoc(ref, {
      spaceId,
      name: input.name,
      description: input.description ?? '',
      body: input.body ?? '',
      schemaVersion: SPACE_SPELL_SCHEMA_VERSION,
      color: input.color,
      rules: stripUndefinedDeep(input.rules ?? []),
      icon: input.icon,
      sourceSpellId: input.sourceSpellId,
      sourceProjectId: input.sourceProjectId,
      sourceUserId: user.uid,
      // Install fan-out fields, initialized empty
      installedByUids: [],
      linkedLocalIdsByUid: {},
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }));

    return ref.id;
  },

  async shareDoc(user: User, spaceId: string, input: SharedDocInput): Promise<string> {
    if (input.content.length > SPACE_DOC_MAX_CONTENT_CHARS) {
      throw new Error(
        `Doc is too large to share (${input.content.length.toLocaleString()} chars; max ${SPACE_DOC_MAX_CONTENT_CHARS.toLocaleString()}).`,
      );
    }
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'docs'));
    const now = serverTimestamp();

    await withRetry(() => setDoc(ref, {
      spaceId,
      title: input.title,
      kind: input.kind,
      content: input.content,
      sourceDocId: input.sourceDocId,
      sourceProjectId: input.sourceProjectId,
      sourceUserId: user.uid,
      // Pull fan-out fields, initialized empty
      linkedLocalIdsByUid: {},
      pulledByUids: [],
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }));

    return ref.id;
  },

  async shareFile(user: User, spaceId: string, input: SharedFileInput): Promise<string> {
    if (input.size > SPACE_FILE_MAX_RAW_BYTES) {
      throw new Error(
        `File is too large to share (${Math.ceil(input.size / 1024)} KB; max ${Math.floor(SPACE_FILE_MAX_RAW_BYTES / 1024)} KB).`,
      );
    }
    if (input.data.length > SPACE_FILE_MAX_DATA_CHARS) {
      throw new Error('File payload exceeds the encoded size limit.');
    }
    const db = getDb();
    const ref = doc(collection(db, 'collabSpaces', spaceId, 'files'));
    const now = serverTimestamp();

    await withRetry(() => setDoc(ref, {
      spaceId,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      data: input.data,
      caption: input.caption,
      sourceUserId: user.uid,
      downloadedByUids: [],
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
    }));

    return ref.id;
  },
};
