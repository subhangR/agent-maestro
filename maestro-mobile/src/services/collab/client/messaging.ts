// src/services/collab/client/messaging.ts — channels + messages, ported from
// maestro-ui's useMessagingStore/CLI message ops to @react-native-firebase.
// Same subcollection shapes (collabSpaces/{s}/channels/{c}/messages/{m}).
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

import {
  type Channel,
  type Message,
  type MessageAttachment,
  type MessageMention,
  MESSAGES_PAGE_SIZE,
} from '../types';
import {
  COLLAB,
  type DocData,
  type QuerySnapshot,
  asBool,
  asNumber,
  asString,
  asStringOrNull,
  db,
  logSubError,
  millis,
  serverTimestamp,
  withRetry,
} from './firestore';

type User = Pick<FirebaseAuthTypes.User, 'uid' | 'displayName' | 'photoURL'>;

function channelFromData(id: string, d: DocData): Channel {
  return {
    id,
    spaceId: asString(d.spaceId),
    name: asString(d.name),
    description: asString(d.description),
    createdBy: asString(d.createdBy),
    createdAtMs: millis(d.createdAt),
    updatedAtMs: millis(d.updatedAt),
    lastMessageAtMs: millis(d.lastMessageAt),
    position: asNumber(d.position),
    isDefault: asBool(d.isDefault),
  };
}

function mentionsFromData(v: unknown): MessageMention[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const m = raw as Record<string, unknown>;
    const kind = m.kind === 'agent' ? 'agent' : 'member';
    return [{ id: asString(m.id), displayName: asString(m.displayName), kind }];
  });
}

function attachmentsFromData(v: unknown): MessageAttachment[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const a = raw as Record<string, unknown>;
    return [
      {
        fileId: asString(a.fileId),
        name: asString(a.name),
        mimeType: asString(a.mimeType),
        size: asNumber(a.size),
      },
    ];
  });
}

function messageFromData(id: string, d: DocData): Message {
  return {
    id,
    spaceId: asString(d.spaceId),
    channelId: asString(d.channelId),
    authorUid: asString(d.authorUid),
    authorDisplayName: asString(d.authorDisplayName, 'Unknown'),
    authorPhotoUrl: asStringOrNull(d.authorPhotoUrl),
    content: asString(d.content),
    createdAtMs: millis(d.createdAt),
    editedAtMs: millis(d.editedAt),
    deletedAtMs: millis(d.deletedAt),
    threadId: asStringOrNull(d.threadId),
    replyCount: asNumber(d.replyCount),
    mentions: mentionsFromData(d.mentions),
    attachments: attachmentsFromData(d.attachments),
    clientMsgId: asStringOrNull(d.clientMsgId),
  };
}

function channelsFromQuery(snap: QuerySnapshot): Channel[] {
  return snap.docs.map((doc) => channelFromData(doc.id, doc.data() as DocData));
}

/** Latest page returned ascending (oldest→newest) for natural chat rendering. */
function messagesAscFromQuery(snap: QuerySnapshot): Message[] {
  return snap.docs
    .map((doc) => messageFromData(doc.id, doc.data() as DocData))
    .reverse();
}

export const MessagingClient = {
  subscribeToChannels(
    spaceId: string,
    cb: (channels: Channel[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return db()
      .collection(COLLAB)
      .doc(spaceId)
      .collection('channels')
      .orderBy('position', 'asc')
      .limit(200)
      .onSnapshot(
        (snap) => cb(snap ? channelsFromQuery(snap) : []),
        (err) => {
          logSubError('channels', err);
          onError?.(err);
        },
      );
  },

  async createChannel(
    user: User,
    spaceId: string,
    input: { name: string; description?: string },
  ): Promise<string> {
    const now = serverTimestamp();
    const ref = await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .collection('channels')
        .add({
          spaceId,
          name: input.name,
          description: input.description ?? '',
          createdBy: user.uid,
          createdAt: now,
          updatedAt: now,
          lastMessageAt: null,
          position: Date.now(),
          isDefault: false,
        }),
    );
    return ref.id;
  },

  async deleteChannel(spaceId: string, channelId: string): Promise<void> {
    await withRetry(() =>
      db().collection(COLLAB).doc(spaceId).collection('channels').doc(channelId).delete(),
    );
  },

  /** Subscribe to the latest `pageSize` messages of a channel (ascending). */
  subscribeToMessages(
    spaceId: string,
    channelId: string,
    cb: (messages: Message[]) => void,
    onError?: (err: Error) => void,
    pageSize = MESSAGES_PAGE_SIZE,
  ): () => void {
    return db()
      .collection(COLLAB)
      .doc(spaceId)
      .collection('channels')
      .doc(channelId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .onSnapshot(
        (snap) => cb(snap ? messagesAscFromQuery(snap) : []),
        (err) => {
          logSubError('messages', err);
          onError?.(err);
        },
      );
  },

  /**
   * One-shot fetch of the page of messages OLDER than `beforeCreatedAtMs`.
   * Returns ascending. `hasMore` is true when a full page came back.
   */
  async fetchOlder(
    spaceId: string,
    channelId: string,
    beforeCreatedAtMs: number,
    pageSize = MESSAGES_PAGE_SIZE,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const snap = await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .collection('channels')
        .doc(channelId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .startAfter(beforeCreatedAtMs > 0 ? new Date(beforeCreatedAtMs) : new Date())
        .limit(pageSize)
        .get(),
    );
    return { messages: messagesAscFromQuery(snap), hasMore: snap.size === pageSize };
  },

  /** Optimistic send: writes clientMsgId so the sender reconciles its pending row. */
  async sendMessage(
    user: User,
    spaceId: string,
    channelId: string,
    input: {
      content: string;
      mentions: MessageMention[];
      attachments: MessageAttachment[];
      clientMsgId: string;
    },
  ): Promise<string> {
    const now = serverTimestamp();
    const channelRef = db()
      .collection(COLLAB)
      .doc(spaceId)
      .collection('channels')
      .doc(channelId);
    const msgRef = channelRef.collection('messages').doc();
    await withRetry(() => {
      const batch = db().batch();
      batch.set(msgRef, {
        spaceId,
        channelId,
        authorUid: user.uid,
        authorDisplayName: user.displayName ?? 'Unknown',
        authorPhotoUrl: user.photoURL ?? null,
        content: input.content,
        createdAt: now,
        editedAt: null,
        deletedAt: null,
        threadId: null,
        replyCount: 0,
        mentions: input.mentions,
        attachments: input.attachments,
        clientMsgId: input.clientMsgId,
      });
      batch.update(channelRef, { lastMessageAt: now, updatedAt: now });
      return batch.commit();
    });
    return msgRef.id;
  },

  async editMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
    content: string,
  ): Promise<void> {
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .collection('channels')
        .doc(channelId)
        .collection('messages')
        .doc(messageId)
        .update({ content, editedAt: serverTimestamp() }),
    );
  },

  /** Soft delete: clears content + stamps deletedAt (matches desktop/rules). */
  async softDeleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .collection('channels')
        .doc(channelId)
        .collection('messages')
        .doc(messageId)
        .update({ content: '', deletedAt: serverTimestamp(), mentions: [], attachments: [] }),
    );
  },
};
