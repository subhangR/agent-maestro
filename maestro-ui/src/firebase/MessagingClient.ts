import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  startAfter,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  Timestamp,
  Unsubscribe,
  DocumentSnapshot,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { getDb } from './firestore';
import {
  Channel,
  Message,
  MessageMention,
  MessageAttachment,
  CreateChannelInput,
  MESSAGES_PAGE_SIZE,
  MESSAGE_MAX_LENGTH,
} from './messagingTypes';
import { asString, asStringOrNull, asNumber, withRetry } from './firestoreUtils';

/** Normalizes an unknown Firestore value into a MessageMention[]. */
function mentionsFromData(raw: unknown): MessageMention[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
    .map((m) => ({
      id: typeof m.id === 'string' ? m.id : '',
      displayName: typeof m.displayName === 'string' ? m.displayName : '',
      kind: m.kind === 'agent' ? 'agent' : 'member',
    }))
    .filter((m) => m.id && m.displayName) as MessageMention[];
}

/** Normalizes an unknown Firestore value into a MessageAttachment[]. */
function attachmentsFromData(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => ({
      fileId: typeof a.fileId === 'string' ? a.fileId : '',
      name: typeof a.name === 'string' ? a.name : '',
      mimeType: typeof a.mimeType === 'string' ? a.mimeType : 'application/octet-stream',
      size: asNumber(a.size),
    }))
    .filter((a) => a.fileId && a.name);
}

const SPACES = 'collabSpaces';
const CHANNELS = 'channels';
const MESSAGES = 'messages';

function channelsCol(spaceId: string) {
  return collection(getDb(), SPACES, spaceId, CHANNELS);
}

function channelDoc(spaceId: string, channelId: string) {
  return doc(getDb(), SPACES, spaceId, CHANNELS, channelId);
}

function messagesCol(spaceId: string, channelId: string) {
  return collection(getDb(), SPACES, spaceId, CHANNELS, channelId, MESSAGES);
}

function messageDoc(spaceId: string, channelId: string, messageId: string) {
  return doc(getDb(), SPACES, spaceId, CHANNELS, channelId, MESSAGES, messageId);
}

function channelFromSnap(snap: DocumentSnapshot | QueryDocumentSnapshot): Channel | null {
  if (!snap.exists()) return null;
  const data = snap.data() as DocumentData;
  return {
    id: snap.id,
    spaceId: data.spaceId,
    name: data.name,
    description: data.description ?? '',
    createdBy: data.createdBy,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    lastMessageAt: data.lastMessageAt ?? null,
    position: typeof data.position === 'number' ? data.position : 0,
    isDefault: Boolean(data.isDefault),
  };
}

function messageFromSnap(snap: QueryDocumentSnapshot | DocumentSnapshot): Message | null {
  if (!snap.exists()) return null;
  const data = snap.data() as DocumentData;
  return {
    id: snap.id,
    spaceId: asString(data.spaceId),
    channelId: asString(data.channelId),
    authorUid: asString(data.authorUid),
    authorDisplayName: asString(data.authorDisplayName),
    authorPhotoUrl: asStringOrNull(data.authorPhotoUrl),
    content: asString(data.content),
    createdAt: data.createdAt,
    editedAt: data.editedAt ?? null,
    deletedAt: data.deletedAt ?? null,
    threadId: asStringOrNull(data.threadId),
    replyCount: asNumber(data.replyCount),
    mentions: mentionsFromData(data.mentions),
    attachments: attachmentsFromData(data.attachments),
    clientMsgId: asStringOrNull(data.clientMsgId),
  };
}

function channelsFromQuery(snap: QuerySnapshot): Channel[] {
  return snap.docs.map((d) => channelFromSnap(d)!).filter(Boolean);
}

function messagesFromQuery(snap: QuerySnapshot): Message[] {
  return snap.docs.map((d) => messageFromSnap(d)!).filter(Boolean);
}

export const MessagingClient = {
  // ─── Channels ───────────────────────────────────────────────────

  subscribeToChannels(
    spaceId: string,
    cb: (channels: Channel[]) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    const q = query(channelsCol(spaceId), orderBy('position', 'asc'));
    return onSnapshot(
      q,
      (snap) => cb(channelsFromQuery(snap)),
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[Messaging] channels subscription failed:', err);
        onError?.(err);
      },
    );
  },

  async listChannels(spaceId: string): Promise<Channel[]> {
    const q = query(channelsCol(spaceId), orderBy('position', 'asc'));
    const snap = await withRetry(() => getDocs(q));
    return channelsFromQuery(snap);
  },

  async createChannel(
    user: User,
    spaceId: string,
    input: CreateChannelInput,
    opts?: { position?: number; isDefault?: boolean },
  ): Promise<Channel> {
    const now = serverTimestamp();
    // Pre-allocated ref → retrying a transient failure can't duplicate the channel.
    const ref = doc(channelsCol(spaceId));
    await withRetry(() => setDoc(ref, {
      spaceId,
      name: input.name,
      description: input.description ?? '',
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      position: opts?.position ?? Date.now(),
      isDefault: opts?.isDefault ?? false,
    }));
    const fresh = await withRetry(() => getDoc(ref));
    const created = channelFromSnap(fresh);
    if (!created) throw new Error('Channel was created but could not be read back.');
    return created;
  },

  async updateChannel(
    spaceId: string,
    channelId: string,
    patch: Partial<Pick<Channel, 'name' | 'description' | 'position'>>,
  ): Promise<void> {
    await withRetry(() => updateDoc(channelDoc(spaceId, channelId), {
      ...patch,
      updatedAt: serverTimestamp(),
    }));
  },

  async deleteChannel(spaceId: string, channelId: string): Promise<void> {
    await withRetry(() => deleteDoc(channelDoc(spaceId, channelId)));
  },

  // ─── Messages ───────────────────────────────────────────────────

  /**
   * Subscribes to the latest `limit` messages in the channel ordered by createdAt DESC.
   * Returns Unsubscribe. Caller flips the array to ASC for display.
   */
  subscribeToMessages(
    spaceId: string,
    channelId: string,
    cb: (messages: Message[], oldestSnap: QueryDocumentSnapshot | null, hasMore: boolean) => void,
    opts?: { limit?: number; onError?: (err: Error) => void },
  ): Unsubscribe {
    const pageSize = opts?.limit ?? MESSAGES_PAGE_SIZE;
    const q = query(
      messagesCol(spaceId, channelId),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    );
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs;
        const messages = messagesFromQuery(snap).slice().reverse(); // ASC for display
        const oldest = docs.length > 0 ? docs[docs.length - 1] : null;
        const hasMore = docs.length === pageSize;
        cb(messages, oldest, hasMore);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[Messaging] messages subscription failed:', err);
        opts?.onError?.(err);
      },
    );
  },

  /**
   * Fetches one page of older messages BEFORE the given doc snapshot.
   * Returns ASC-ordered list and a new cursor. `hasMore` true if a full page came back.
   */
  async loadOlderMessages(
    spaceId: string,
    channelId: string,
    beforeDoc: QueryDocumentSnapshot,
    pageSize: number = MESSAGES_PAGE_SIZE,
  ): Promise<{ messages: Message[]; oldest: QueryDocumentSnapshot | null; hasMore: boolean }> {
    const q = query(
      messagesCol(spaceId, channelId),
      orderBy('createdAt', 'desc'),
      startAfter(beforeDoc),
      limit(pageSize),
    );
    const snap = await withRetry(() => getDocs(q));
    const docs = snap.docs;
    const messages = messagesFromQuery(snap).slice().reverse();
    const oldest = docs.length > 0 ? docs[docs.length - 1] : null;
    const hasMore = docs.length === pageSize;
    return { messages, oldest, hasMore };
  },

  async sendMessage(
    user: User,
    spaceId: string,
    channelId: string,
    content: string,
    mentions: MessageMention[] = [],
    opts?: { clientMsgId?: string; attachments?: MessageAttachment[] },
  ): Promise<Message> {
    const hasAttachments = (opts?.attachments?.length ?? 0) > 0;
    if (!content.trim() && !hasAttachments) throw new Error('Message is empty.');
    if (content.length > MESSAGE_MAX_LENGTH) {
      throw new Error(`Message is too long (${content.length}/${MESSAGE_MAX_LENGTH}).`);
    }
    const now = serverTimestamp();
    // Pre-allocated ref → retrying a transient commit failure is idempotent.
    const newMsgRef = doc(messagesCol(spaceId, channelId));
    await withRetry(() => {
      const batch = writeBatch(getDb());
      batch.set(newMsgRef, {
        spaceId,
        channelId,
        authorUid: user.uid,
        authorDisplayName: user.displayName ?? user.email ?? 'Unknown',
        authorPhotoUrl: user.photoURL ?? null,
        content,
        createdAt: now,
        editedAt: null,
        deletedAt: null,
        threadId: null,
        replyCount: 0,
        mentions: mentions.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          kind: m.kind,
        })),
        attachments: (opts?.attachments ?? []).map((a) => ({
          fileId: a.fileId,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
        })),
        clientMsgId: opts?.clientMsgId ?? null,
      });
      batch.update(channelDoc(spaceId, channelId), {
        lastMessageAt: now,
        updatedAt: now,
      });
      return batch.commit();
    });
    const fresh = await withRetry(() => getDoc(newMsgRef));
    const sent = messageFromSnap(fresh);
    if (!sent) throw new Error('Message was sent but could not be read back.');
    return sent;
  },

  async editMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
    content: string,
  ): Promise<void> {
    if (!content.trim()) throw new Error('Message is empty.');
    if (content.length > MESSAGE_MAX_LENGTH) {
      throw new Error(`Message is too long (${content.length}/${MESSAGE_MAX_LENGTH}).`);
    }
    await withRetry(() => updateDoc(messageDoc(spaceId, channelId, messageId), {
      content,
      editedAt: serverTimestamp(),
    }));
  },

  /** Soft-delete: marks deletedAt and clears content. */
  async softDeleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await withRetry(() => updateDoc(messageDoc(spaceId, channelId, messageId), {
      content: '',
      deletedAt: serverTimestamp(),
    }));
  },

  async hardDeleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await withRetry(() => deleteDoc(messageDoc(spaceId, channelId, messageId)));
  },
};

export type { Unsubscribe, QueryDocumentSnapshot, Timestamp };
