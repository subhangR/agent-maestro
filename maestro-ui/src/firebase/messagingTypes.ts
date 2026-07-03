import { Timestamp } from 'firebase/firestore';

export interface Channel {
  id: string;
  spaceId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt: Timestamp | null;
  position: number;
  isDefault: boolean;
}

/**
 * A tagged mention embedded in a message. `kind` distinguishes a human space
 * member from a Maestro agent (shared team member). Agent mentions are what a
 * future @mention→invoke integration would act on to wake a session.
 */
export type MentionKind = 'member' | 'agent';

export interface MessageMention {
  /** Human member uid, or shared team-member id for agents. */
  id: string;
  /** Display name shown after the `@` (without the leading `@`). */
  displayName: string;
  kind: MentionKind;
}

/** A candidate the composer can offer in the @mention autocomplete. */
export interface Mentionable {
  id: string;
  displayName: string;
  kind: MentionKind;
  photoUrl?: string | null;
  /** Optional secondary line (e.g. role or email) shown in the picker. */
  subtitle?: string | null;
}

export interface Message {
  id: string;
  spaceId: string;
  channelId: string;
  authorUid: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deletedAt: Timestamp | null;
  threadId: string | null;
  replyCount: number;
  mentions: MessageMention[];
}

export interface CreateChannelInput {
  name: string;
  description?: string;
}

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
}

export const MESSAGE_MAX_LENGTH = 10000;
export const CHANNEL_NAME_MAX_LENGTH = 64;
export const CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MESSAGES_PAGE_SIZE = 50;
