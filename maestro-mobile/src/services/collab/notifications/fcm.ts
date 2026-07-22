// src/services/collab/notifications/fcm.ts
//
// FCM push registration + foreground/background/tap handler for Collab.
//
// Design:
//   - `initCollabPush()` is idempotent and safe to call at app bootstrap.
//   - All @react-native-firebase/messaging calls are lazy-required and wrapped
//     in try/catch so importing this module never crashes a JS-only test runner
//     or a non-native web bundle.
//   - Device tokens are written to Firestore at `fcmTokens/{token}` so the
//     Cloud Function can enumerate them by uid. The server reads
//     `notificationProfiles/{uid}/devices` (the original web-push path) — for
//     mobile we write to `fcmTokens` as a separate flat collection to avoid
//     colliding with the existing web-push device sub-collection schema.
//     (The collabFcm.ts Cloud Function reads from here.)
//   - FCM data payload shape the server MUST send:
//       { type, spaceId, channelId, channelName?, spaceName?,
//         messageId, actorUid, actorName, preview, isMention: 'true'|'false' }
//   - Deep-link: on notification tap → router.push(routes.space(spaceId)),
//     with channelId in the query string for the SpaceScreen to select.

import { router } from 'expo-router';
import { routes } from '../../../../navigation/routes';
import { useCollabNotificationsStore } from '../../../state/collab/notificationsStore';
import type { CollabNotification } from './types';
import { currentUser } from '../../firebaseAuth';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Firestore collection where mobile device tokens are stored. */
const FCM_TOKENS_COLLECTION = 'fcmTokens';

// ── Guard: safe lazy-require of native modules ────────────────────────────────

function getMessaging() {
  // Lazy require so the module doesn't crash in jest / Expo Go without the
  // native module. Returns null if not available.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/messaging') as {
      default: {
        (): {
          requestPermission(): Promise<number>;
          getToken(): Promise<string>;
          onMessage(handler: (msg: RemoteMessage) => void): () => void;
          setBackgroundMessageHandler(handler: (msg: RemoteMessage) => Promise<void>): void;
          onNotificationOpenedApp(handler: (msg: RemoteMessage) => void): () => void;
          getInitialNotification(): Promise<RemoteMessage | null>;
        };
        AuthorizationStatus: { AUTHORIZED: number; PROVISIONAL: number };
      };
    };
    return mod.default;
  } catch {
    return null;
  }
}

function getFirestore() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/firestore') as {
      default: () => {
        collection(col: string): {
          doc(id: string): {
            set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void>;
            delete(): Promise<void>;
          };
        };
      };
      firebase: { firestore: { FieldValue: { serverTimestamp(): unknown } } };
    };
    // serverTimestamp from the namespaced API
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('@react-native-firebase/firestore') as typeof import('@react-native-firebase/firestore');
    return { db: mod.default, serverTimestamp: fs.default.FieldValue.serverTimestamp };
  } catch {
    return null;
  }
}

// ── Remote message shape (matches FCM data payload) ──────────────────────────

interface RemoteMessage {
  messageId?: string | null;
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
}

// ── FCM data payload → CollabNotification ────────────────────────────────────

function notificationFromPayload(data: Record<string, string>): CollabNotification | null {
  const { spaceId, channelId, messageId, actorUid, actorName, preview } = data;
  if (!spaceId || !channelId || !messageId) return null;
  return {
    id: `fcm_${messageId}`,
    type: data.type ?? 'message.new',
    spaceId,
    spaceName: data.spaceName ?? null,
    channelId,
    channelName: data.channelName ?? null,
    messageId,
    authorUid: actorUid ?? '',
    authorName: actorName ?? 'Someone',
    preview: preview ?? 'New message',
    isMention: data.isMention === 'true',
    timestamp: Date.now(),
    read: false,
    // entity fields for non-message types
    section: (data.section as CollabNotification['section']) ?? undefined,
    entityKind: data.entityKind ?? undefined,
    entityId: data.entityId ?? undefined,
    entityLabel: data.entityLabel ?? undefined,
    action: data.action ?? undefined,
  };
}

// ── Deep-link helper ──────────────────────────────────────────────────────────

function deepLinkToSpace(data: Record<string, string> | undefined): void {
  if (!data?.spaceId) return;
  try {
    // Provide channelId as a search param so SpaceScreen can pre-select it.
    const href = data.channelId
      ? (`${routes.space(data.spaceId)}?channelId=${encodeURIComponent(data.channelId)}` as Parameters<typeof router.push>[0])
      : routes.space(data.spaceId);
    router.push(href);
  } catch {
    // Navigation may not be ready at cold start — swallow.
  }
}

// ── Token registration ────────────────────────────────────────────────────────

let registeredToken: string | null = null;

async function registerToken(): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;
  const fs = getFirestore();
  if (!fs) return;

  try {
    const AuthorizationStatus = messaging.AuthorizationStatus;
    const status = await messaging().requestPermission();
    const allowed =
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL;
    if (!allowed) return;

    const token = await messaging().getToken();
    if (!token || token === registeredToken) return;
    registeredToken = token;

    const user = currentUser();
    if (!user) return;

    await fs.db()
      .collection(FCM_TOKENS_COLLECTION)
      .doc(token)
      .set(
        {
          uid: user.uid,
          platform: 'android', // overridden at runtime below
          updatedAt: fs.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    console.warn('[fcm] registerToken failed:', err);
  }
}

async function deleteToken(): Promise<void> {
  const fs = getFirestore();
  if (!fs || !registeredToken) return;
  try {
    await fs.db().collection(FCM_TOKENS_COLLECTION).doc(registeredToken).delete();
    registeredToken = null;
  } catch {
    // best-effort
  }
}

// ── Idempotency guard ─────────────────────────────────────────────────────────

let initialized = false;
const cleanupFns: Array<() => void> = [];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Idempotent bootstrapper. Call once at app startup (after Firebase Auth is
 * initialized and the user is signed in). Wires:
 *   - Permission request + token registration to Firestore.
 *   - Foreground message handler → ingest into notificationsStore + toast.
 *   - Background handler (no-op; OS shows the notification).
 *   - Notification-tap handler → deep-link to space.
 *   - Cold-start notification check → deep-link if opened from a push.
 */
export async function initCollabPush(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const messaging = getMessaging();
  if (!messaging) return;

  // 1. Register permission + token.
  await registerToken();

  // 2. Foreground messages → ingest + toast.
  const unsubForeground = messaging().onMessage((msg: RemoteMessage) => {
    if (!msg.data) return;
    const n = notificationFromPayload(msg.data);
    if (!n) return;
    useCollabNotificationsStore.getState().ingest(n);
  });
  cleanupFns.push(unsubForeground);

  // 3. Background handler (required by RN Firebase; no-op for foreground logic).
  try {
    messaging().setBackgroundMessageHandler(async (_msg: RemoteMessage) => {
      // The OS handles background display; no in-app state to update here.
    });
  } catch {
    // setBackgroundMessageHandler may not be available in all environments.
  }

  // 4. Notification-opened-app (app was backgrounded and user tapped a push).
  const unsubTap = messaging().onNotificationOpenedApp((msg: RemoteMessage) => {
    deepLinkToSpace(msg.data);
  });
  cleanupFns.push(unsubTap);

  // 5. Cold start: app was killed and user tapped a push.
  try {
    const initial = await messaging().getInitialNotification();
    if (initial?.data) deepLinkToSpace(initial.data);
  } catch {
    // Not available in all test environments.
  }
}

/**
 * Tear down FCM listeners and remove the device token from Firestore.
 * Call on sign-out.
 */
export async function unregisterPush(): Promise<void> {
  for (const fn of cleanupFns) {
    try { fn(); } catch { /* ignore */ }
  }
  cleanupFns.length = 0;
  initialized = false;
  await deleteToken();
}

/**
 * Re-register the token after a sign-in (e.g. user switches accounts).
 * Safe to call repeatedly.
 */
export async function refreshPushToken(): Promise<void> {
  await registerToken();
}

/**
 * FCM data-payload shape the Cloud Function MUST send for mobile deep-linking
 * and notification ingestion to work. All values are strings (FCM data-only).
 *
 * Required:  spaceId, channelId, messageId
 * Strongly recommended: type, actorUid, actorName, preview, isMention
 * Optional:  spaceName, channelName, section, entityKind, entityId,
 *            entityLabel, action
 *
 * @example
 * {
 *   type: 'message.new',
 *   spaceId: 'abc123',
 *   spaceName: 'Maestro Dev',
 *   channelId: 'general',
 *   channelName: 'general',
 *   messageId: 'msg456',
 *   actorUid: 'uid789',
 *   actorName: 'Alice',
 *   preview: 'Hey, can you check this?',
 *   isMention: 'true',
 * }
 */
export type FcmCollabPayload = {
  type: string;
  spaceId: string;
  spaceName?: string;
  channelId: string;
  channelName?: string;
  messageId: string;
  actorUid: string;
  actorName: string;
  preview: string;
  isMention: 'true' | 'false';
  section?: string;
  entityKind?: string;
  entityId?: string;
  entityLabel?: string;
  action?: string;
};
