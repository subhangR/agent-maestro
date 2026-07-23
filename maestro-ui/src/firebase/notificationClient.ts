import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from './firestore';
import type { NotifyPrefs, CollabNotification } from '../notifications/collabNotificationTypes';

const PROFILES = 'notificationProfiles';
const NOTIFICATIONS = 'notifications';
const INBOX_CAP = 100;

export interface RemoteNotification extends CollabNotification {}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function timestampMs(value: unknown): number {
  return value && typeof value === 'object' && 'toMillis' in value
    && typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : Date.now();
}

export function notificationFromData(id: string, data: DocumentData): RemoteNotification | null {
  const type = asString(data.type);
  if (!type) return null;
  const spaceId = asString(data.spaceId);
  const channelId = asString(data.channelId);
  const entityId = asString(data.entityId);
  const messageId = asString(data.messageId, entityId);
  const rawSection = asString(data.section, type === 'message.new' ? 'messages' : 'settings');
  const section = ['messages', 'tasks', 'team', 'spells', 'docs', 'files', 'members', 'settings'].includes(rawSection)
    ? rawSection as RemoteNotification['section']
    : 'settings';
  if (!spaceId || (!messageId && !entityId)) return null;
  return {
    id: `cn_${id}`,
    type,
    spaceId,
    spaceName: asNullableString(data.spaceName),
    channelId,
    channelName: asNullableString(data.channelName),
    messageId,
    section,
    entityKind: asString(data.entityKind, type.split('.')[0]),
    entityId: entityId || messageId,
    entityLabel: asString(data.entityLabel),
    action: asString(data.action, type.split('.')[1]),
    authorUid: asString(data.actorUid),
    authorName: asString(data.actorName, 'Someone'),
    preview: asString(data.preview, 'New message'),
    isMention: data.isMention === true,
    timestamp: timestampMs(data.createdAt),
    read: data.readAt != null,
  };
}

export function profilePrefsFromData(data: DocumentData | undefined): NotifyPrefs | null {
  if (!data) return null;
  return {
    level: data.level === 'mentions' ? 'mentions' : 'all',
    desktopEnabled: data.desktopEnabled === true,
    mutedSpaceIds: asStringArray(data.mutedSpaceIds),
    mutedChannelIds: asStringArray(data.mutedChannelIds),
  };
}

export async function saveNotificationPrefs(uid: string, prefs: NotifyPrefs): Promise<void> {
  await setDoc(doc(getDb(), PROFILES, uid), {
    level: prefs.level,
    desktopEnabled: prefs.desktopEnabled,
    mutedSpaceIds: prefs.mutedSpaceIds,
    mutedChannelIds: prefs.mutedChannelIds,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeNotificationProfile(
  uid: string,
  callback: (prefs: NotifyPrefs | null) => void,
): Unsubscribe {
  return onSnapshot(doc(getDb(), PROFILES, uid), (snapshot) => callback(profilePrefsFromData(snapshot.data())));
}

export async function registerPushDevice(uid: string, deviceId: string, token: string): Promise<void> {
  const ref = doc(getDb(), PROFILES, uid, 'devices', deviceId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, { token, lastSeenAt: serverTimestamp() });
    return;
  }
  await setDoc(ref, {
    token,
    platform: 'web',
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
}

export async function unregisterPushDevice(uid: string, deviceId: string): Promise<void> {
  const ref = doc(getDb(), PROFILES, uid, 'devices', deviceId);
  await deleteDoc(ref);
}

export function subscribeNotificationInbox(
  uid: string,
  handlers: {
    initial: (items: RemoteNotification[]) => void;
    added: (item: RemoteNotification) => void;
    modified: (item: RemoteNotification) => void;
  },
): Unsubscribe {
  const inbox = query(
    collection(getDb(), NOTIFICATIONS, uid, 'items'),
    orderBy('createdAt', 'desc'),
    limit(INBOX_CAP),
  );
  let initialized = false;
  return onSnapshot(inbox, (snapshot) => {
    if (!initialized) {
      initialized = true;
      handlers.initial(snapshot.docs
        .map((item) => notificationFromData(item.id, item.data()))
        .filter((item): item is RemoteNotification => item !== null));
      return;
    }
    snapshot.docChanges().forEach((change) => {
      const item = notificationFromData(change.doc.id, change.doc.data());
      if (!item) return;
      if (change.type === 'added') handlers.added(item);
      if (change.type === 'modified') handlers.modified(item);
    });
  });
}

export async function markNotificationRead(uid: string, itemId: string): Promise<void> {
  await updateDoc(doc(getDb(), NOTIFICATIONS, uid, 'items', itemId), { readAt: serverTimestamp() });
}

export async function markChannelNotificationsRead(uid: string, channelId: string): Promise<void> {
  const unread = await getDocs(query(
    collection(getDb(), NOTIFICATIONS, uid, 'items'),
    where('channelId', '==', channelId),
    limit(INBOX_CAP),
  ));
  const batch = writeBatch(getDb());
  let writes = 0;
  unread.docs.forEach((item) => {
    if (item.get('readAt') == null) {
      batch.update(item.ref, { readAt: serverTimestamp() });
      writes += 1;
    }
  });
  if (writes > 0) await batch.commit();
}

export async function markAllNotificationsRead(uid: string): Promise<void> {
  const unread = await getDocs(query(
    collection(getDb(), NOTIFICATIONS, uid, 'items'),
    where('readAt', '==', null),
    limit(INBOX_CAP),
  ));
  const batch = writeBatch(getDb());
  unread.docs.forEach((item) => batch.update(item.ref, { readAt: serverTimestamp() }));
  if (!unread.empty) await batch.commit();
}

export async function writeChannelReadState(uid: string, spaceId: string, channelId: string): Promise<void> {
  await setDoc(doc(getDb(), 'collabSpaces', spaceId, 'readState', uid), {
    lastReadAt: { [channelId]: serverTimestamp() },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
