import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  startAfter,
  getDoc,
  getDocs,
  addDoc,
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
  CreateChannelInput,
  MESSAGES_PAGE_SIZE,
} from './messagingTypes';

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
    spaceId: data.spaceId,
    channelId: data.channelId,
    authorUid: data.authorUid,
    authorDisplayName: data.authorDisplayName ?? '',
    authorPhotoUrl: data.authorPhotoUrl ?? null,
    content: data.content ?? '',
    createdAt: data.createdAt,
    editedAt: data.editedAt ?? null,
    deletedAt: data.deletedAt ?? null,
    threadId: data.threadId ?? null,
    replyCount: typeof data.replyCount === 'number' ? data.replyCount : 0,
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
  ): Unsubscribe {
    const q = query(channelsCol(spaceId), orderBy('position', 'asc'));
    return onSnapshot(q, (snap) => cb(channelsFromQuery(snap)));
  },

  async listChannels(spaceId: string): Promise<Channel[]> {
    const q = query(channelsCol(spaceId), orderBy('position', 'asc'));
    const snap = await getDocs(q);
    return channelsFromQuery(snap);
  },

  async createChannel(
    user: User,
    spaceId: string,
    input: CreateChannelInput,
    opts?: { position?: number; isDefault?: boolean },
  ): Promise<Channel> {
    const now = serverTimestamp();
    const ref = await addDoc(channelsCol(spaceId), {
      spaceId,
      name: input.name,
      description: input.description ?? '',
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
      position: opts?.position ?? Date.now(),
      isDefault: opts?.isDefault ?? false,
    });
    const fresh = await getDoc(ref);
    return channelFromSnap(fresh)!;
  },

  async updateChannel(
    spaceId: string,
    channelId: string,
    patch: Partial<Pick<Channel, 'name' | 'description' | 'position'>>,
  ): Promise<void> {
    await updateDoc(channelDoc(spaceId, channelId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteChannel(spaceId: string, channelId: string): Promise<void> {
    await deleteDoc(channelDoc(spaceId, channelId));
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
    opts?: { limit?: number },
  ): Unsubscribe {
    const pageSize = opts?.limit ?? MESSAGES_PAGE_SIZE;
    const q = query(
      messagesCol(spaceId, channelId),
      orderBy('createdAt', 'desc'),
      limit(pageSize),
    );
    return onSnapshot(q, (snap) => {
      const docs = snap.docs;
      const messages = messagesFromQuery(snap).slice().reverse(); // ASC for display
      const oldest = docs.length > 0 ? docs[docs.length - 1] : null;
      const hasMore = docs.length === pageSize;
      cb(messages, oldest, hasMore);
    });
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
    const snap = await getDocs(q);
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
  ): Promise<Message> {
    const now = serverTimestamp();
    const batch = writeBatch(getDb());
    const newMsgRef = doc(messagesCol(spaceId, channelId));
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
    });
    batch.update(channelDoc(spaceId, channelId), {
      lastMessageAt: now,
      updatedAt: now,
    });
    await batch.commit();
    const fresh = await getDoc(newMsgRef);
    return messageFromSnap(fresh)!;
  },

  async editMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
    content: string,
  ): Promise<void> {
    await updateDoc(messageDoc(spaceId, channelId, messageId), {
      content,
      editedAt: serverTimestamp(),
    });
  },

  /** Soft-delete: marks deletedAt and clears content. */
  async softDeleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await updateDoc(messageDoc(spaceId, channelId, messageId), {
      content: '',
      deletedAt: serverTimestamp(),
    });
  },

  async hardDeleteMessage(
    spaceId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await deleteDoc(messageDoc(spaceId, channelId, messageId));
  },
};

export type { Unsubscribe, QueryDocumentSnapshot, Timestamp };
