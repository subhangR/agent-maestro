// src/services/collab/types.ts — mobile-normalized Collab domain types.
//
// Ported from maestro-ui/src/firebase/{collabSpaceTypes,messagingTypes}.ts, with
// ONE deliberate change: every Firestore `Timestamp` is normalized to epoch
// millis (`number | null`) at the client read boundary (see client.ts). RN
// screens/stores never touch a Firestore Timestamp object — they get plain
// numbers they can format with date-fns, compare, and serialize into MMKV.
//
// The Firestore document SHAPES are identical to desktop/CLI (same collections,
// same field names) so all three clients interoperate on the same backend.

export type CollabSpaceVisibility = 'public' | 'private';
export type MemberRole = 'owner' | 'admin' | 'member';

export interface CollabSpaceMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
  role: MemberRole;
  /** epoch millis, or null if the server timestamp hasn't resolved yet */
  joinedAtMs: number | null;
}

export interface CollabSpace {
  id: string;
  name: string;
  description: string;
  githubUrl: string;
  githubHost: string;
  githubOwner: string;
  githubRepo: string;
  visibility: CollabSpaceVisibility;
  ownerId: string;
  memberIds: string[];
  members: Record<string, CollabSpaceMember>;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

export interface CreateCollabSpaceInput {
  name: string;
  description?: string;
  githubUrl: string;
  githubHost: string;
  githubOwner: string;
  githubRepo: string;
  visibility: CollabSpaceVisibility;
}

export type CollabSpaceInviteKind = 'link' | 'code';

export interface CollabSpaceInvite {
  id: string;
  spaceId: string;
  kind: CollabSpaceInviteKind;
  maxUses: number;
  useCount: number;
  redeemedByUids: string[];
  expiresAtMs: number | null;
  revokedAtMs: number | null;
  createdBy: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

export interface CreateInviteInput {
  kind: CollabSpaceInviteKind;
  /** epoch millis; one hour .. thirty days out (client-enforced) */
  expiresAtMs: number;
  /** 1 .. 1000 redemptions */
  maxUses: number;
}

// ── Messaging ────────────────────────────────────────────────────────────────
export interface Channel {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  lastMessageAtMs: number | null;
  position: number;
  isDefault: boolean;
}

export type MentionKind = 'member' | 'agent';

export interface MessageMention {
  id: string;
  displayName: string;
  kind: MentionKind;
}

export interface Mentionable {
  id: string;
  displayName: string;
  kind: MentionKind;
  photoUrl?: string | null;
  subtitle?: string | null;
}

export interface MessageAttachment {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  spaceId: string;
  channelId: string;
  authorUid: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  createdAtMs: number | null;
  editedAtMs: number | null;
  deletedAtMs: number | null;
  threadId: string | null;
  replyCount: number;
  mentions: MessageMention[];
  attachments: MessageAttachment[];
  /** client-generated id for exact optimistic reconciliation */
  clientMsgId: string | null;
}

/** A locally-held message that hasn't been confirmed by Firestore yet. */
export interface PendingMessage {
  tempId: string;
  spaceId: string;
  channelId: string;
  authorUid: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  createdAtMs: number;
  status: 'sending' | 'failed';
  error?: string;
  mentions: MessageMention[];
  attachments: MessageAttachment[];
}

// ── Shared entities (share / pull) ───────────────────────────────────────────
export type SharedEntityKind = 'task' | 'member' | 'spell' | 'doc' | 'file';

export interface SharedEntitySummary {
  id: string;
  kind: SharedEntityKind;
  title: string;
  subtitle: string | null;
  sourceUserId: string;
  createdAtMs: number | null;
  /** raw remote payload for pull/preview (kind-specific) */
  data: Record<string, unknown>;
}

// ── Constants (match maestro-ui/messagingTypes + firestore.rules) ────────────
export const MESSAGE_MAX_LENGTH = 10000;
export const CHANNEL_NAME_MAX_LENGTH = 64;
export const CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MESSAGES_PAGE_SIZE = 50;
export const INVITE_MIN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const INVITE_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
