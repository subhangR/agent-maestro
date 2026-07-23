/**
 * collabFcm.ts — Mobile FCM sender for Collab push notifications.
 *
 * STATUS: Self-contained, NOT imported by index.ts yet. The existing
 * `fanoutMessageNotification` in index.ts already sends web-push to
 * `notificationProfiles/{uid}/devices`. This module adds a parallel
 * FCM multicast to Android/iOS devices whose tokens are stored at
 * `fcmTokens/{token}` by the mobile app's `initCollabPush()`.
 *
 * WIRING (lead to do when ready):
 *   1. In index.ts, add:
 *        import { sendMobilePushToRecipients } from './collabFcm';
 *   2. Inside `fanoutMessageNotification`, after the `sendPush(devices, data)`
 *      call, add:
 *        await sendMobilePushToRecipients(recipientUids, mobilePayload);
 *      where `recipientUids` is the array of uids who received the inbox item
 *      and `mobilePayload` is the FcmCollabPayload for the message.
 *   3. Similarly wire it from `fanoutEntityNotification` for entity events.
 *
 * FCM DATA PAYLOAD SHAPE (all string values — matches mobile FcmCollabPayload):
 *   Required:  type, spaceId, channelId, messageId
 *   Recommended: actorUid, actorName, preview, isMention ('true'|'false')
 *   Optional:  spaceName, channelName, section, entityKind, entityId,
 *              entityLabel, action
 *
 * TOKEN COLLECTION:
 *   `fcmTokens/{token}` = { uid: string, platform: string, updatedAt: Timestamp }
 *   Written by the mobile app on each successful FCM registration.
 *   Stale tokens (messaging/registration-token-not-registered) are deleted here.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

// ── Constants ──────────────────────────────────────────────────────────────────

const FCM_TOKENS_COLLECTION = 'fcmTokens';
/** Max devices per recipient to prevent runaway reads on a single user. */
const MAX_DEVICES_PER_UID = 10;
/** FCM sendEachForMulticast limit. */
const MULTICAST_LIMIT = 500;

// ── Types ──────────────────────────────────────────────────────────────────────

/** All values must be strings for FCM data-only messages. */
export interface FcmCollabPayload {
  type: string;
  spaceId: string;
  spaceName: string;
  channelId: string;
  channelName: string;
  messageId: string;
  actorUid: string;
  actorName: string;
  preview: string;
  isMention: 'true' | 'false';
  // Optional entity fields
  section?: string;
  entityKind?: string;
  entityId?: string;
  entityLabel?: string;
  action?: string;
}

interface MobileDevice {
  token: string;
  uid: string;
  docId: string;
}

// ── Token lookup ──────────────────────────────────────────────────────────────

/**
 * Fetch all mobile device tokens for a set of recipient uids.
 * Reads `fcmTokens` collection (flat, keyed by token) and groups by uid.
 */
async function mobileDevicesForUids(uids: string[]): Promise<MobileDevice[]> {
  if (uids.length === 0) return [];
  const db = getFirestore();
  const devices: MobileDevice[] = [];

  // Firestore `in` queries are limited to 30 items; chunk if needed.
  const CHUNK = 30;
  for (let i = 0; i < uids.length; i += CHUNK) {
    const chunk = uids.slice(i, i + CHUNK);
    const snap = await db
      .collection(FCM_TOKENS_COLLECTION)
      .where('uid', 'in', chunk)
      .limit(MAX_DEVICES_PER_UID * chunk.length)
      .get();
    for (const doc of snap.docs) {
      const token = typeof doc.get('token') === 'string'
        ? (doc.get('token') as string)
        // The document ID is the token (written by mobile registerToken()).
        : doc.id;
      if (token && typeof token === 'string' && token.length > 0) {
        devices.push({ token, uid: doc.get('uid') as string, docId: doc.id });
      }
    }
  }
  return devices;
}

// ── Stale token cleanup ───────────────────────────────────────────────────────

function isInvalidToken(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? '';
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  );
}

// ── Core sender ───────────────────────────────────────────────────────────────

/**
 * Send a data-only FCM multicast to all mobile devices for the given uids.
 *
 * Uses `sendEachForMulticast` which respects the MULTICAST_LIMIT per batch.
 * Stale tokens are deleted from `fcmTokens` automatically.
 *
 * @param recipientUids - uids who should receive the push (already filtered
 *   for mute prefs / focus by the caller).
 * @param payload - The FCM data payload (all strings).
 */
export async function sendMobilePushToRecipients(
  recipientUids: string[],
  payload: FcmCollabPayload,
): Promise<void> {
  if (recipientUids.length === 0) return;

  let devices: MobileDevice[];
  try {
    devices = await mobileDevicesForUids(recipientUids);
  } catch (err) {
    logger.error('[collabFcm] Failed to fetch mobile device tokens.', { err });
    return;
  }

  if (devices.length === 0) return;

  // Build the string-only data record (FCM data messages require all strings).
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v != null) data[k] = String(v);
  }

  const db = getFirestore();

  // Chunk into MULTICAST_LIMIT batches.
  for (let offset = 0; offset < devices.length; offset += MULTICAST_LIMIT) {
    const chunk = devices.slice(offset, offset + MULTICAST_LIMIT);
    try {
      const response = await getMessaging().sendEachForMulticast({
        tokens: chunk.map((d) => d.token),
        data,
        android: {
          priority: payload.isMention === 'true' ? 'high' : 'normal',
          ttl: 86400 * 1000, // 24h in ms
        },
        apns: {
          headers: {
            'apns-priority': payload.isMention === 'true' ? '10' : '5',
            'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
          },
        },
      });

      // Delete stale tokens.
      const deletions = response.responses.flatMap((result, index) =>
        result.success || !isInvalidToken(result.error)
          ? []
          : [db.collection(FCM_TOKENS_COLLECTION).doc(chunk[index].docId).delete()],
      );
      if (deletions.length > 0) await Promise.all(deletions);
    } catch (err) {
      logger.error('[collabFcm] sendEachForMulticast failed.', {
        err,
        spaceId: payload.spaceId,
        channelId: payload.channelId,
      });
      // Non-fatal: the durable inbox item is already committed.
    }
  }
}

/**
 * Convenience builder: construct a FcmCollabPayload for a new message.
 * Pass the same fields used by the existing `sendPush` call in index.ts.
 */
export function buildMessagePayload(opts: {
  spaceId: string;
  spaceName: string | null;
  channelId: string;
  channelName: string | null;
  messageId: string;
  actorUid: string;
  actorName: string;
  preview: string;
  isMention: boolean;
}): FcmCollabPayload {
  return {
    type: 'message.new',
    spaceId: opts.spaceId,
    spaceName: opts.spaceName ?? '',
    channelId: opts.channelId,
    channelName: opts.channelName ?? '',
    messageId: opts.messageId,
    actorUid: opts.actorUid,
    actorName: opts.actorName,
    preview: opts.preview,
    isMention: opts.isMention ? 'true' : 'false',
  };
}

/**
 * Convenience builder: construct a FcmCollabPayload for an entity event.
 */
export function buildEntityPayload(opts: {
  type: string;
  spaceId: string;
  spaceName: string | null;
  channelId: string | null;
  entityId: string;
  section: string;
  entityKind: string;
  entityLabel: string;
  action: string;
  actorUid: string;
  actorName: string;
  preview: string;
}): FcmCollabPayload {
  return {
    type: opts.type,
    spaceId: opts.spaceId,
    spaceName: opts.spaceName ?? '',
    channelId: opts.channelId ?? '',
    channelName: '',
    messageId: opts.entityId,
    actorUid: opts.actorUid,
    actorName: opts.actorName,
    preview: opts.preview,
    isMention: 'false',
    section: opts.section,
    entityKind: opts.entityKind,
    entityId: opts.entityId,
    entityLabel: opts.entityLabel,
    action: opts.action,
  };
}
