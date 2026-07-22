import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Unsubscribe,
} from 'firebase/messaging';
import { getFirebaseApp, getFirebaseVapidKey, getFirebaseWebConfig } from './config';
import { registerPushDevice, unregisterPushDevice } from './notificationClient';

const DEVICE_KEY_PREFIX = 'maestro.webPushDevice.';

export interface CollabPushPayload {
  type: 'message.new';
  spaceId: string;
  spaceName: string | null;
  channelId: string;
  channelName: string | null;
  messageId: string;
  actorUid: string;
  actorName: string;
  preview: string;
  isMention: boolean;
  url: string;
}

function vapidKey(): string | null {
  const key = getFirebaseVapidKey();
  return key || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean(vapidKey());
}

function deviceId(uid: string): string {
  const key = `${DEVICE_KEY_PREFIX}${uid}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
}

function workerUrl(): string {
  const config = getFirebaseWebConfig();
  const url = new URL('/firebase-messaging-sw.js', window.location.origin);
  Object.entries({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function payloadFromMessage(payload: MessagePayload): CollabPushPayload | null {
  const data = payload.data;
  if (!data || data.type !== 'message.new' || !data.spaceId || !data.channelId || !data.messageId) return null;
  return {
    type: 'message.new',
    spaceId: data.spaceId,
    spaceName: data.spaceName || null,
    channelId: data.channelId,
    channelName: data.channelName || null,
    messageId: data.messageId,
    actorUid: data.actorUid || '',
    actorName: data.actorName || 'Someone',
    preview: data.preview || 'New message',
    isMention: data.isMention === 'true',
    url: data.url || `/?collabSpace=${encodeURIComponent(data.spaceId)}&collabChannel=${encodeURIComponent(data.channelId)}`,
  };
}

async function messagingReady(): Promise<{
  messaging: ReturnType<typeof getMessaging>;
  registration: ServiceWorkerRegistration;
} | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !isWebPushConfigured()) return null;
  if (!await isSupported()) return null;
  const registration = await navigator.serviceWorker.register(workerUrl(), { scope: '/' });
  await navigator.serviceWorker.ready;
  return { messaging: getMessaging(getFirebaseApp()), registration };
}

/**
 * Registers this browser installation with FCM and returns one cleanup function
 * for foreground FCM messages and service-worker notification clicks.
 * Permission is intentionally requested by the UI's explicit opt-in control.
 */
export async function startWebPush(
  uid: string,
  handlers: {
    onForeground: (payload: CollabPushPayload) => void;
    onClick: (payload: CollabPushPayload) => void;
  },
): Promise<Unsubscribe> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return () => {};
  const ready = await messagingReady();
  if (!ready) return () => {};

  const id = deviceId(uid);
  const token = await getToken(ready.messaging, {
    vapidKey: vapidKey()!,
    serviceWorkerRegistration: ready.registration,
  });
  if (token) await registerPushDevice(uid, id, token);

  const unsubForeground = onMessage(ready.messaging, (payload) => {
    const collabPush = payloadFromMessage(payload);
    if (collabPush) handlers.onForeground(collabPush);
  });
  const onWorkerMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as { type?: string; payload?: MessagePayload } | null;
    if (message?.type !== 'maestro-collab-push-click' || !message.payload) return;
    const collabPush = payloadFromMessage(message.payload);
    if (collabPush) handlers.onClick(collabPush);
  };
  navigator.serviceWorker.addEventListener('message', onWorkerMessage);

  return () => {
    unsubForeground();
    navigator.serviceWorker.removeEventListener('message', onWorkerMessage);
  };
}

export async function stopWebPush(uid: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const id = deviceId(uid);
  try {
    const ready = await messagingReady();
    if (ready) await deleteToken(ready.messaging);
  } finally {
    await unregisterPushDevice(uid, id);
  }
}
