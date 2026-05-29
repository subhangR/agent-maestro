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
}

export const MESSAGE_MAX_LENGTH = 10000;
export const CHANNEL_NAME_MAX_LENGTH = 64;
export const CHANNEL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MESSAGES_PAGE_SIZE = 50;
