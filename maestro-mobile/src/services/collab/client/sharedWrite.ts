// src/services/collab/client/sharedWrite.ts — WRITE side of share/pull.
//
// Writes local server entities out to Firestore as shared entities in a Collab
// Space. Field shapes mirror the CLI's `shareShape()` in
// maestro-cli/src/commands/collab.ts exactly so desktop, CLI, and mobile share
// the same Firestore documents.
//
// Collection mapping (same as CLI `collectionFor`):
//   task   → tasks
//   member → teamMembers
//   spell  → spells
//   doc    → docs
//   file   → files  (stub — not yet supported on mobile)
//
// The WRITE side requires a Firebase Auth user (uid) for sourceUserId /
// createdBy / updatedAt. Pass the live `currentUser()` from @/services/firebaseAuth.

import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

import type { Task } from '@/domain/entities/task';
import type { TeamMember } from '@/domain/entities/teamMember';
import type { CustomPrompt } from '@/domain/entities/spell';

import {
  COLLAB,
  db,
  serverTimestamp,
  withRetry,
} from './firestore';

type FbUser = Pick<FirebaseAuthTypes.User, 'uid'>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeBool(v: unknown): boolean {
  return v === true;
}

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ── Task ──────────────────────────────────────────────────────────────────────

/**
 * Share a local server Task into a Collab Space.
 * Returns the new Firestore document id.
 */
export async function shareTask(
  user: FbUser,
  spaceId: string,
  localTask: Task,
): Promise<string> {
  const now = serverTimestamp();
  const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked'];
  const VALID_PRIORITIES = ['high', 'medium', 'low'];

  const payload = {
    // CLI shareShape(task) fields — exact parity
    title: localTask.title.trim(),
    description: localTask.description ?? '',
    status: VALID_STATUSES.includes(localTask.status) ? localTask.status : 'todo',
    priority: VALID_PRIORITIES.includes(localTask.priority ?? '') ? localTask.priority : 'medium',
    initialPrompt: typeof localTask.initialPrompt === 'string' ? localTask.initialPrompt : '',
    dueDate: typeof localTask.dueDate === 'string' ? localTask.dueDate : null,
    dangerousMode: safeBool(localTask.dangerousMode),
    useWorktree: safeBool(localTask.useWorktree),
    assigneeUids: [],
    parentTaskId: null,
    childrenIds: [],
    position: Date.now(),
    sourceTaskId: localTask.id,
    sourceProjectId: localTask.projectId ?? null,
    sourceUserId: user.uid,
    linkedLocalIdsByUid: {},
    pulledByUids: [],
    // Envelope fields (written by the mobile client, same as CLI)
    spaceId,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await withRetry(() =>
    db().collection(COLLAB).doc(spaceId).collection('tasks').add(payload),
  );
  return ref.id;
}

// ── Member ────────────────────────────────────────────────────────────────────

/**
 * Share a local server TeamMember into a Collab Space.
 * Returns the new Firestore document id.
 */
export async function shareMember(
  user: FbUser,
  spaceId: string,
  localMember: TeamMember,
): Promise<string> {
  const now = serverTimestamp();

  const payload = {
    // CLI shareShape(member) fields — exact parity
    name: localMember.name.trim(),
    role: safeStr(localMember.role),
    identity: safeStr(localMember.identity),
    avatar: safeStr(localMember.avatar),
    model: typeof localMember.model === 'string' ? localMember.model : null,
    agentTool: typeof localMember.agentTool === 'string' ? localMember.agentTool : null,
    mode: typeof localMember.mode === 'string' ? localMember.mode : null,
    permissionMode: typeof localMember.permissionMode === 'string' ? localMember.permissionMode : null,
    strategy: typeof localMember.strategy === 'string' ? localMember.strategy : null,
    capabilities: safeObj(localMember.capabilities),
    customWorkflow: typeof localMember.customWorkflow === 'string' ? localMember.customWorkflow : null,
    soundInstrument: typeof localMember.soundInstrument === 'string' ? localMember.soundInstrument : null,
    skillIds: safeArr<string>(localMember.skillIds),
    commandPermissions: safeObj(localMember.commandPermissions),
    sourceTeamMemberId: localMember.id,
    sourceProjectId: localMember.projectId ?? null,
    sourceUserId: user.uid,
    adoptedByUids: [],
    linkedLocalIdsByUid: {},
    // Envelope
    spaceId,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await withRetry(() =>
    db().collection(COLLAB).doc(spaceId).collection('teamMembers').add(payload),
  );
  return ref.id;
}

// ── Spell (CustomPrompt) ──────────────────────────────────────────────────────

/**
 * Share a local server CustomPrompt (spell) into a Collab Space.
 * Returns the new Firestore document id.
 *
 * The CLI treats body = description, and schemaVersion=2 is the canonical format.
 * Rules default to an empty array (the puller creates a legacy rule on pull if empty).
 */
export async function shareSpell(
  user: FbUser,
  spaceId: string,
  localSpell: CustomPrompt,
): Promise<string> {
  const now = serverTimestamp();

  const payload = {
    // CLI shareShape(spell) fields — exact parity
    name: localSpell.name.trim(),
    description: safeStr(localSpell.description),
    body: localSpell.content, // CLI maps body = content / description
    schemaVersion: 2,
    color: 'violet', // default; no color on CustomPrompt
    rules: [], // CustomPrompt has no rules; puller will wrap into legacyRule
    icon: typeof localSpell.icon === 'string' ? localSpell.icon : null,
    sourceSpellId: localSpell.id,
    sourceProjectId: null, // CustomPrompts are global (no projectId on entity)
    sourceUserId: user.uid,
    installedByUids: [],
    linkedLocalIdsByUid: {},
    // Envelope
    spaceId,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await withRetry(() =>
    db().collection(COLLAB).doc(spaceId).collection('spells').add(payload),
  );
  return ref.id;
}

// ── Doc ───────────────────────────────────────────────────────────────────────

export type ShareDocKind = 'markdown' | 'diagram';

export interface ShareDocInput {
  title: string;
  kind: ShareDocKind;
  content: string;
}

/**
 * Share a text/markdown/diagram document into a Collab Space.
 * Returns the new Firestore document id.
 */
export async function shareDoc(
  user: FbUser,
  spaceId: string,
  input: ShareDocInput,
): Promise<string> {
  const now = serverTimestamp();

  const payload = {
    // CLI share doc fields — exact parity
    spaceId,
    title: input.title.trim() || 'Untitled',
    kind: input.kind,
    content: input.content,
    sourceDocId: null,
    sourceProjectId: null,
    sourceUserId: user.uid,
    linkedLocalIdsByUid: {},
    pulledByUids: [],
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await withRetry(() =>
    db().collection(COLLAB).doc(spaceId).collection('docs').add(payload),
  );
  return ref.id;
}

// ── File (stub) ───────────────────────────────────────────────────────────────

/**
 * File sharing is not yet supported on mobile (requires base64 encoding of
 * arbitrary file data, and there is no RN file-picker integration in v1).
 * This stub exists so the barrel type-checks cleanly.
 */
export async function shareFile(
  _user: FbUser,
  _spaceId: string,
  _file: unknown,
): Promise<never> {
  throw new Error('File sharing is not yet supported on mobile.');
}
