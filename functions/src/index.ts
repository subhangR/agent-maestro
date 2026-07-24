import { getApps, initializeApp } from 'firebase-admin/app';
import { createHash } from 'node:crypto';
import { getDatabase } from 'firebase-admin/database';
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import {
  onDocumentCreated,
  onDocumentWrittenWithAuthContext,
  type Change,
  type DocumentSnapshot,
  type FirestoreAuthEvent,
} from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
export { submitWebsiteInquiry } from './websiteInquiry';
import {
  RESOURCE_DEFINITIONS,
  actorNameFromSpace,
  deriveChannelEvent,
  deriveInviteEvent,
  deriveResourceEvent,
  deriveSpaceEvent,
  memberIdsFromSpace,
  type DerivedCollabEvent,
  type ResourceDefinition,
} from './notificationEvents';

initializeApp();

const REGION = 'asia-southeast1';
const MAX_DEVICES_PER_RECIPIENT = 20;
const FCM_MULTICAST_LIMIT = 500;
const PREVIEW_MAX = 140;
// The default project's RTDB instance is regional rather than the legacy
// firebaseio hostname. Custom Firebase deployments can override this at deploy
// time with the MAESTRO_RTDB_URL Functions parameter.
const RTDB_URL = defineString('MAESTRO_RTDB_URL', {
  default: 'https://maestro-5f3fc-default-rtdb.asia-southeast1.firebasedatabase.app',
});

type NotifyLevel = 'mentions' | 'all';

interface NotificationProfile {
  level: NotifyLevel;
  desktopEnabled: boolean;
  mutedSpaceIds: Set<string>;
  mutedChannelIds: Set<string>;
}

interface RecipientPlan {
  uid: string;
  isMention: boolean;
  focused: boolean;
}

interface DeviceTarget {
  ref: DocumentReference;
  token: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseProfile(data: DocumentData | undefined): NotificationProfile {
  return {
    // Match the client default: all messages in the recipient's spaces, unless
    // they explicitly switch to mentions-only.
    level: data?.level === 'mentions' ? 'mentions' : 'all',
    desktopEnabled: data?.desktopEnabled === true,
    mutedSpaceIds: new Set(strings(data?.mutedSpaceIds)),
    mutedChannelIds: new Set(strings(data?.mutedChannelIds)),
  };
}

function mentionedMemberUids(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .filter((item) => item.kind === 'member' && typeof item.id === 'string')
      .map((item) => item.id as string),
  );
}

function messagePreview(content: unknown, attachments: unknown): string {
  const text = typeof content === 'string' ? content.replace(/\s+/g, ' ').trim() : '';
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  const attachmentCount = Array.isArray(attachments) ? attachments.length : 0;
  if (attachmentCount === 1) return '📎 Attachment';
  if (attachmentCount > 1) return `📎 ${attachmentCount} attachments`;
  return 'New message';
}

function presenceDatabase() {
  const name = 'maestro-presence';
  const app = getApps().find((candidate) => candidate.name === name)
    ?? initializeApp({ databaseURL: RTDB_URL.value() }, name);
  return getDatabase(app);
}

async function isFocusedOnChannel(spaceId: string, uid: string, channelId: string): Promise<boolean> {
  return isFocusedOn(spaceId, uid, channelId);
}

async function isFocusedOn(spaceId: string, uid: string, focus: string): Promise<boolean> {
  const snapshot = await presenceDatabase()
    .ref(`spacePresence/${spaceId}/${uid}/connections`)
    .get();
  const connections = snapshot.val();
  if (!connections || typeof connections !== 'object') return false;
  return Object.values(connections as Record<string, unknown>).some((value) => {
    if (!value || typeof value !== 'object') return false;
    const connection = value as Record<string, unknown>;
    return connection.visible === true && connection.focus === focus;
  });
}

async function createInboxItem(ref: DocumentReference, item: Record<string, unknown>): Promise<boolean> {
  try {
    // A deterministic {messageId} document makes trigger retries harmless. A
    // notification is only sent by the invocation that wins this create.
    await ref.create(item);
    return true;
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code === 6 || code === 'already-exists') return false;
    throw error;
  }
}

async function deviceTargets(uid: string): Promise<DeviceTarget[]> {
  const snapshot = await getFirestore()
    .collection('notificationProfiles')
    .doc(uid)
    .collection('devices')
    .limit(MAX_DEVICES_PER_RECIPIENT)
    .get();
  return snapshot.docs
    .map((doc) => ({ ref: doc.ref, token: doc.get('token') }))
    .filter((device): device is DeviceTarget => typeof device.token === 'string' && device.token.length > 0);
}

function isInvalidRegistration(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'messaging/registration-token-not-registered'
    || code === 'messaging/invalid-registration-token';
}

async function sendPush(
  devices: DeviceTarget[],
  data: Record<string, string>,
): Promise<void> {
  for (let offset = 0; offset < devices.length; offset += FCM_MULTICAST_LIMIT) {
    const chunk = devices.slice(offset, offset + FCM_MULTICAST_LIMIT);
    const response = await getMessaging().sendEachForMulticast({
      tokens: chunk.map((device) => device.token),
      data,
      webpush: {
        headers: {
          TTL: '86400',
          Urgency: data.isMention === 'true' ? 'high' : 'normal',
        },
      },
    });

    const stale = response.responses.flatMap((result, index) => (
      result.success || !isInvalidRegistration(result.error) ? [] : [chunk[index].ref.delete()]
    ));
    await Promise.all(stale);
  }
}

/**
 * The only notification trigger in Maestro. It writes a private durable inbox
 * item for every eligible recipient, then sends Web Push only to recipients
 * who opted in and are not already viewing the exact channel.
 */
export const fanoutMessageNotification = onDocumentCreated(
  {
    document: 'collabSpaces/{spaceId}/channels/{channelId}/messages/{messageId}',
    region: REGION,
    retry: true,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const { spaceId, channelId, messageId } = event.params;
    const message = snapshot.data();
    const authorUid = typeof message.authorUid === 'string' ? message.authorUid : '';
    if (!authorUid || message.deletedAt != null) return;

    const db = getFirestore();
    const [spaceSnapshot, channelSnapshot] = await Promise.all([
      db.doc(`collabSpaces/${spaceId}`).get(),
      db.doc(`collabSpaces/${spaceId}/channels/${channelId}`).get(),
    ]);
    if (!spaceSnapshot.exists || !channelSnapshot.exists) {
      logger.warn('Skipping message notification because the Collab metadata is missing.', {
        spaceId, channelId, messageId,
      });
      return;
    }

    const memberIds = strings(spaceSnapshot.get('memberIds')).filter((uid) => uid !== authorUid);
    if (memberIds.length === 0) return;

    const mentions = mentionedMemberUids(message.mentions);
    const profiles = await Promise.all(memberIds.map(async (uid) => ({
      uid,
      profile: parseProfile((await db.doc(`notificationProfiles/${uid}`).get()).data()),
    })));

    const candidates = profiles.filter(({ uid, profile }) => {
      if (profile.mutedSpaceIds.has(spaceId) || profile.mutedChannelIds.has(channelId)) return false;
      return profile.level === 'all' || mentions.has(uid);
    });
    if (candidates.length === 0) return;

    const plans = await Promise.all(candidates.map(async ({ uid }) => ({
      uid,
      isMention: mentions.has(uid),
      focused: await isFocusedOnChannel(spaceId, uid, channelId),
    } satisfies RecipientPlan)));

    const actorName = typeof message.authorDisplayName === 'string' && message.authorDisplayName.trim()
      ? message.authorDisplayName.trim()
      : 'Someone';
    const spaceName = typeof spaceSnapshot.get('name') === 'string' ? spaceSnapshot.get('name') : null;
    const channelName = typeof channelSnapshot.get('name') === 'string' ? channelSnapshot.get('name') : null;
    const preview = messagePreview(message.content, message.attachments);
    const url = `/?collabSpace=${encodeURIComponent(spaceId)}&collabChannel=${encodeURIComponent(channelId)}`;

    const delivered = await Promise.all(plans.map(async (plan) => {
      const created = await createInboxItem(
        db.doc(`notifications/${plan.uid}/items/${messageId}`),
        {
          type: 'message.new',
          spaceId,
          spaceName,
          channelId,
          channelName,
          messageId,
          actorUid: authorUid,
          actorName,
          preview,
          isMention: plan.isMention,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        },
      );
      return created ? plan : null;
    }));

    // Only the winner of each inbox-item create sends a push. A retry therefore
    // cannot duplicate desktop notifications, while the inbox still remains the
    // source of truth if a push provider transiently fails.
    await Promise.all(delivered.filter((plan): plan is RecipientPlan => plan !== null).map(async (plan) => {
      const profile = candidates.find((candidate) => candidate.uid === plan.uid)?.profile;
      if (!profile?.desktopEnabled || plan.focused) return;
      const devices = await deviceTargets(plan.uid);
      if (devices.length === 0) return;
      try {
        await sendPush(devices, {
          type: 'message.new',
          spaceId,
          spaceName: spaceName ?? '',
          channelId,
          channelName: channelName ?? '',
          messageId,
          actorUid: authorUid,
          actorName,
          preview,
          isMention: String(plan.isMention),
          url,
        });
      } catch (error) {
        // The durable inbox item was already committed. Throwing here would
        // retry the event but intentionally not duplicate its push, so log the
        // operational failure instead of converting it into a false retry.
        logger.error('Failed to send Collab message push.', { error, spaceId, channelId, messageId, uid: plan.uid });
      }
    }));
  },
);

type AuthWriteEvent = FirestoreAuthEvent<
  Change<DocumentSnapshot> | undefined,
  Record<string, string>
>;

interface EntityFanoutInput {
  sourceEventId: string;
  spaceId: string;
  entityId: string;
  actorUid: string;
  actorName: string;
  spaceName: string | null;
  channelId?: string;
  candidateUids: string[];
  event: DerivedCollabEvent;
}

function dataOf(snapshot: DocumentSnapshot | undefined): Record<string, unknown> | undefined {
  return snapshot?.exists ? snapshot.data() as Record<string, unknown> : undefined;
}

function notificationId(sourceEventId: string, spaceId: string, type: string, entityId: string): string {
  const digest = createHash('sha256')
    .update(`${sourceEventId}\u0000${spaceId}\u0000${type}\u0000${entityId}`)
    .digest('hex')
    .slice(0, 40);
  return `evt_${digest}`;
}

function entityUrl(input: Pick<EntityFanoutInput, 'spaceId' | 'entityId' | 'event' | 'channelId'>): string {
  const params = new URLSearchParams({
    collabSpace: input.spaceId,
    collabSection: input.event.section,
    collabEntity: input.entityId,
  });
  if (input.channelId) params.set('collabChannel', input.channelId);
  return `/?${params.toString()}`;
}

/**
 * Shared entity fan-out. Unlike message-level preferences, entity activity is
 * always relevant to space members; global desktop opt-in and per-space mute
 * still apply. The deterministic inbox create is the idempotency gate for FCM.
 */
async function fanoutEntityNotification(input: EntityFanoutInput): Promise<void> {
  const db = getFirestore();
  const candidates = [...new Set(input.candidateUids)]
    .filter((uid) => uid && uid !== input.actorUid);
  if (candidates.length === 0) return;

  const profiles = await Promise.all(candidates.map(async (uid) => ({
    uid,
    profile: parseProfile((await db.doc(`notificationProfiles/${uid}`).get()).data()),
  })));
  const eligible = profiles.filter(({ profile }) => (
    !profile.mutedSpaceIds.has(input.spaceId)
    && (!input.channelId || !profile.mutedChannelIds.has(input.channelId))
  ));
  if (eligible.length === 0) return;

  const focus = input.channelId ?? `section:${input.event.section}`;
  const plans: RecipientPlan[] = await Promise.all(eligible.map(async ({ uid }): Promise<RecipientPlan> => ({
    uid,
    isMention: false,
    focused: await isFocusedOn(input.spaceId, uid, focus),
  })));

  const itemId = notificationId(
    input.sourceEventId,
    input.spaceId,
    input.event.type,
    input.entityId,
  );
  const url = entityUrl(input);
  const delivered: Array<RecipientPlan | null> = await Promise.all(plans.map(async (plan): Promise<RecipientPlan | null> => {
    const created = await createInboxItem(
      db.doc(`notifications/${plan.uid}/items/${itemId}`),
      {
        type: input.event.type,
        spaceId: input.spaceId,
        spaceName: input.spaceName,
        channelId: input.channelId ?? null,
        section: input.event.section,
        entityKind: input.event.entityKind,
        entityId: input.entityId,
        entityLabel: input.event.entityLabel,
        action: input.event.action,
        actorUid: input.actorUid,
        actorName: input.actorName,
        preview: input.event.preview,
        isMention: false,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      },
    );
    return created ? plan : null;
  }));

  await Promise.all(delivered.filter((plan): plan is RecipientPlan => plan !== null).map(async (plan) => {
    const profile = eligible.find((candidate) => candidate.uid === plan.uid)?.profile;
    if (!profile?.desktopEnabled || plan.focused) return;
    const devices = await deviceTargets(plan.uid);
    if (devices.length === 0) return;
    try {
      await sendPush(devices, {
        notificationId: itemId,
        type: input.event.type,
        spaceId: input.spaceId,
        spaceName: input.spaceName ?? '',
        channelId: input.channelId ?? '',
        section: input.event.section,
        entityKind: input.event.entityKind,
        entityId: input.entityId,
        entityLabel: input.event.entityLabel,
        action: input.event.action,
        actorUid: input.actorUid,
        actorName: input.actorName,
        preview: input.event.preview,
        isMention: 'false',
        url,
      });
    } catch (error) {
      logger.error('Failed to send Collab entity push.', {
        error,
        type: input.event.type,
        spaceId: input.spaceId,
        entityId: input.entityId,
        uid: plan.uid,
      });
    }
  }));
}

function actorUidFor(event: AuthWriteEvent): string {
  return typeof event.authId === 'string' ? event.authId : '';
}

async function handleResourceWrite(event: AuthWriteEvent, definition: ResourceDefinition): Promise<void> {
  const change = event.data;
  if (!change) return;
  const actorUid = actorUidFor(event);
  if (!actorUid) {
    logger.warn('Skipping Collab entity notification without authenticated actor.', {
      authType: event.authType,
      document: event.document,
    });
    return;
  }
  const before = dataOf(change.before);
  const after = dataOf(change.after);
  const derived = deriveResourceEvent(definition, before, after, actorUid);
  if (!derived) return;
  const { spaceId, entityId } = event.params;
  const spaceSnapshot = await getFirestore().doc(`collabSpaces/${spaceId}`).get();
  if (!spaceSnapshot.exists) return;
  const space = spaceSnapshot.data() as Record<string, unknown>;
  await fanoutEntityNotification({
    sourceEventId: event.id,
    spaceId,
    entityId,
    actorUid,
    actorName: actorNameFromSpace(space, actorUid),
    spaceName: typeof space.name === 'string' ? space.name : null,
    candidateUids: memberIdsFromSpace(space),
    event: derived,
  });
}

function resourceTrigger(segment: keyof typeof RESOURCE_DEFINITIONS) {
  const definition = RESOURCE_DEFINITIONS[segment];
  return onDocumentWrittenWithAuthContext(
    {
      document: `collabSpaces/{spaceId}/${segment}/{entityId}`,
      region: REGION,
      retry: true,
    },
    (event) => handleResourceWrite(event as AuthWriteEvent, definition),
  );
}

export const fanoutTaskNotification = resourceTrigger('tasks');
export const fanoutTeamMemberNotification = resourceTrigger('teamMembers');
export const fanoutSpellNotification = resourceTrigger('spells');
export const fanoutDocNotification = resourceTrigger('docs');
export const fanoutFileNotification = resourceTrigger('files');

export const fanoutChannelNotification = onDocumentWrittenWithAuthContext(
  {
    document: 'collabSpaces/{spaceId}/channels/{entityId}',
    region: REGION,
    retry: true,
  },
  async (event) => {
    const change = event.data;
    const actorUid = typeof event.authId === 'string' ? event.authId : '';
    if (!change || !actorUid) return;
    const derived = deriveChannelEvent(dataOf(change.before), dataOf(change.after));
    if (!derived) return;
    const { spaceId, entityId } = event.params;
    const spaceSnapshot = await getFirestore().doc(`collabSpaces/${spaceId}`).get();
    if (!spaceSnapshot.exists) return;
    const space = spaceSnapshot.data() as Record<string, unknown>;
    await fanoutEntityNotification({
      sourceEventId: event.id,
      spaceId,
      entityId,
      actorUid,
      actorName: actorNameFromSpace(space, actorUid),
      spaceName: typeof space.name === 'string' ? space.name : null,
      channelId: derived.action === 'deleted' ? undefined : entityId,
      candidateUids: memberIdsFromSpace(space),
      event: derived,
    });
  },
);

export const fanoutInviteNotification = onDocumentWrittenWithAuthContext(
  {
    document: 'collabSpaces/{spaceId}/invites/{entityId}',
    region: REGION,
    retry: true,
  },
  async (event) => {
    const change = event.data;
    const actorUid = typeof event.authId === 'string' ? event.authId : '';
    if (!change || !actorUid) return;
    const derived = deriveInviteEvent(dataOf(change.before), dataOf(change.after));
    if (!derived) return;
    const { spaceId, entityId } = event.params;
    const spaceSnapshot = await getFirestore().doc(`collabSpaces/${spaceId}`).get();
    if (!spaceSnapshot.exists) return;
    const space = spaceSnapshot.data() as Record<string, unknown>;
    await fanoutEntityNotification({
      sourceEventId: event.id,
      spaceId,
      entityId,
      actorUid,
      actorName: actorNameFromSpace(space, actorUid),
      spaceName: typeof space.name === 'string' ? space.name : null,
      candidateUids: memberIdsFromSpace(space),
      event: derived,
    });
  },
);

export const fanoutSpaceNotification = onDocumentWrittenWithAuthContext(
  {
    document: 'collabSpaces/{spaceId}',
    region: REGION,
    retry: true,
  },
  async (event) => {
    const change = event.data;
    const actorUid = typeof event.authId === 'string' ? event.authId : '';
    if (!change || !actorUid) return;
    const before = dataOf(change.before);
    const after = dataOf(change.after);
    const derived = deriveSpaceEvent(before, after, actorUid);
    if (!derived) return;
    const space = after ?? before;
    if (!space) return;
    await fanoutEntityNotification({
      sourceEventId: event.id,
      spaceId: event.params.spaceId,
      entityId: derived.subjectUid ?? event.params.spaceId,
      actorUid,
      actorName: actorNameFromSpace(after ?? before, actorUid),
      spaceName: typeof space.name === 'string' ? space.name : null,
      candidateUids: [...new Set([
        ...memberIdsFromSpace(before),
        ...memberIdsFromSpace(after),
      ])],
      event: derived,
    });
  },
);
