// src/services/collab/notifications/types.ts
//
// Mobile port of maestro-ui/src/notifications/collabNotificationTypes.ts.
//
// Key adaptations vs the desktop original:
//   - `SpaceSection` is defined inline (no shared UIStore import on mobile).
//   - `ClassifyContext.windowVisible` → `appForegrounded` (same semantics, RN name).
//   - Desktop uses Firestore Timestamp objects; mobile types use epoch-ms numbers
//     (see src/services/collab/types.ts — every Timestamp is normalised at the
//     read boundary). The engine uses `createdAtMs: number | null` accordingly.
//   - `collabNotificationIcon()` returns a string emoji for logging; the RN
//     NotificationBell uses `Icon` from @/components instead.

import type { Message, MessageMention } from '../types';

// ── Space section ─────────────────────────────────────────────────────────────

/** Mirror of the desktop SpaceSection union — kept local to avoid UIStore dep. */
export type SpaceSection = 'messages' | 'tasks' | 'members' | 'spells' | 'docs' | 'files';

// ── Core notification shape ───────────────────────────────────────────────────

export type NotifyLevel = 'mentions' | 'all';

/** One delivered in-app notification (a toast entry + inbox row). */
export interface CollabNotification {
  id: string;
  /** Durable taxonomy. e.g. 'message.new', 'task.created', etc. */
  type?: string;
  spaceId: string;
  spaceName: string | null;
  channelId: string;
  channelName: string | null;
  messageId: string;
  section?: SpaceSection;
  entityKind?: string;
  entityId?: string;
  entityLabel?: string;
  action?: string;
  authorUid: string;
  authorName: string;
  preview: string;
  isMention: boolean;
  /** Epoch ms the notification was recorded (client clock). */
  timestamp: number;
  read: boolean;
}

// ── Channel metadata (used by the engine) ────────────────────────────────────

export interface SpaceMeta {
  spaceId: string;
  spaceName: string | null;
}

export interface ChannelMeta extends SpaceMeta {
  channelId: string;
  channelName: string | null;
}

// ── User prefs ────────────────────────────────────────────────────────────────

export interface NotifyPrefs {
  level: NotifyLevel;
  /** On mobile: whether FCM push is enabled (device permission + opt-in). */
  pushEnabled: boolean;
  mutedSpaceIds: string[];
  mutedChannelIds: string[];
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  level: 'all',
  pushEnabled: false,
  mutedSpaceIds: [],
  mutedChannelIds: [],
};

// ── Classification ────────────────────────────────────────────────────────────

export interface ClassifyContext {
  myUid: string;
  level: NotifyLevel;
  mutedSpaceIds: ReadonlySet<string>;
  mutedChannelIds: ReadonlySet<string>;
  /** The channel the user is actively viewing, or null. */
  focusedChannelId: string | null;
  /** Whether the app is in the foreground. Equivalent to desktop windowVisible. */
  appForegrounded: boolean;
}

export interface ClassifyResult {
  isMention: boolean;
  /** Count this message toward the channel's unread badge. */
  track: boolean;
  /** Surface an in-app toast and add an inbox entry. */
  toast: boolean;
}

const SILENT: ClassifyResult = { isMention: false, track: false, toast: false };

// ── Pure helpers (no React / Firebase deps) ──────────────────────────────────

/** True when the message @-mentions the current user as a human member. */
export function isMentioned(
  message: Pick<Message, 'mentions'>,
  myUid: string,
): boolean {
  return message.mentions.some(
    (m: MessageMention) => m.kind === 'member' && m.id === myUid,
  );
}

/**
 * Decide what a freshly-arrived message should do.
 *
 * Rules (same as desktop):
 *  - Deleted messages and own messages → always silent.
 *  - Muted space/channel → fully silent.
 *  - Actively-viewed channel while app is foregrounded → silent (read in-place).
 *  - Otherwise badge + toast if level passes (mention always passes; 'all' passes
 *    everything).
 * Desktop had a separate `desktop` flag; mobile omits it — FCM handles OS-level
 * push delivery independently of this in-app classification.
 */
export function classifyIncomingMessage(
  message: Message,
  ctx: ClassifyContext,
): ClassifyResult {
  if (message.deletedAtMs != null) return SILENT;
  if (message.authorUid === ctx.myUid) return SILENT;
  if (
    ctx.mutedSpaceIds.has(message.spaceId) ||
    ctx.mutedChannelIds.has(message.channelId)
  ) {
    return SILENT;
  }

  const mention = isMentioned(message, ctx.myUid);
  const focused = ctx.appForegrounded && ctx.focusedChannelId === message.channelId;
  if (focused) return { isMention: mention, track: false, toast: false };

  const toast = mention || ctx.level === 'all';
  return { isMention: mention, track: true, toast };
}

const PREVIEW_MAX = 140;

/** Short, single-line preview of a message for a toast/inbox row. */
export function previewOf(
  message: Pick<Message, 'content' | 'attachments'>,
): string {
  const text = (message.content ?? '').replace(/\s+/g, ' ').trim();
  if (text) {
    return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  }
  const n = message.attachments?.length ?? 0;
  if (n > 0) return n === 1 ? 'Attachment' : `${n} attachments`;
  return 'New message';
}

/** Heading text for a toast/inbox row. */
export function collabNotificationHeading(n: CollabNotification): string {
  if (!n.type || n.type === 'message.new') {
    const channelLabel = n.channelName ? `#${n.channelName}` : 'a channel';
    return n.isMention
      ? `${n.authorName} mentioned you`
      : `${n.authorName} · ${channelLabel}`;
  }
  const label = n.entityLabel ? ` · ${n.entityLabel}` : '';
  return `${n.authorName}${label}`;
}

/** Emoji icon for logging / accessibility labels. */
export function collabNotificationIcon(n: CollabNotification): string {
  if (n.isMention) return '📣'; // 📣
  const kind = n.entityKind ?? n.type?.split('.')[0];
  return (
    ({
      channel: '💬',   // 💬
      task: '✅',            // ✅
      team_member: '🤖', // 🤖
      spell: '✶',           // ✦
      doc: '📄',       // 📄
      file: '📎',      // 📎
      invite: '✉️',    // ✉️
      member: '👤',    // 👤
      space: '⚙️',     // ⚙️
      message: '💬',   // 💬
    } as Record<string, string>)[kind ?? 'message'] ?? '🔔' // 🔔
  );
}
