import type { Message } from '../firebase/messagingTypes';
import type { SpaceSection } from '../stores/useUIStore';

/**
 * Phase 1 in-app collab notifications — pure types + classification logic.
 *
 * This module is intentionally free of React, Zustand, and Firebase so the
 * "should this message notify me, and how?" decision is a pure function that
 * can be unit-tested exhaustively. The engine (subscriptions) and the store
 * (presentation/state) sit on either side of it.
 */

export type NotifyLevel = 'mentions' | 'all';

/** One delivered in-app notification (a toast + an inbox entry). */
export interface CollabNotification {
  id: string;
  /** Durable taxonomy. Absent only for legacy in-memory message entries. */
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

export function collabNotificationIcon(notification: CollabNotification): string {
  if (notification.isMention) return '📣';
  const kind = notification.entityKind ?? notification.type?.split('.')[0];
  return ({
    channel: '💬', task: '✅', team_member: '🤖', spell: '✦', doc: '📄',
    file: '📎', invite: '✉️', member: '👤', space: '⚙️', message: '💬',
  } as Record<string, string>)[kind ?? 'message'] ?? '🔔';
}

export function collabNotificationHeading(notification: CollabNotification): string {
  if (!notification.type || notification.type === 'message.new') {
    const channelLabel = notification.channelName ? `#${notification.channelName}` : 'a channel';
    return notification.isMention
      ? `${notification.authorName} mentioned you`
      : `${notification.authorName} · ${channelLabel}`;
  }
  const label = notification.entityLabel ? ` · ${notification.entityLabel}` : '';
  return `${notification.authorName}${label}`;
}

/** User-tunable preferences, persisted to localStorage (Phase 1). */
export interface NotifyPrefs {
  level: NotifyLevel;
  desktopEnabled: boolean;
  mutedSpaceIds: string[];
  mutedChannelIds: string[];
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  // Product decision: mentions + any new message in my spaces, by default.
  level: 'all',
  desktopEnabled: false,
  mutedSpaceIds: [],
  mutedChannelIds: [],
};

export interface ClassifyContext {
  myUid: string;
  level: NotifyLevel;
  desktopEnabled: boolean;
  mutedSpaceIds: ReadonlySet<string>;
  mutedChannelIds: ReadonlySet<string>;
  /** The channel the user is actively viewing, or null. */
  focusedChannelId: string | null;
  /** Whether the app window/tab is currently visible AND focused. */
  windowVisible: boolean;
}

export interface ClassifyResult {
  isMention: boolean;
  /** Count this message toward the channel's unread badge. */
  track: boolean;
  /** Surface an in-app toast and add an inbox entry. */
  toast: boolean;
  /** Fire an OS/browser desktop Notification. */
  desktop: boolean;
}

const SILENT: ClassifyResult = { isMention: false, track: false, toast: false, desktop: false };

/** True when the message @-mentions me as a human member. */
export function isMentioned(message: Pick<Message, 'mentions'>, myUid: string): boolean {
  return message.mentions.some((m) => m.kind === 'member' && m.id === myUid);
}

/**
 * The heart of Phase 1: decide what a freshly-arrived message should do.
 *
 * Rules (in order):
 *  - Deleted messages and my own messages are always silent.
 *  - A muted space or channel is fully silent (no toast, no badge).
 *  - If I'm actively looking at that channel, it's effectively read — no
 *    interruption, and it doesn't add to unread (the caller marks it read).
 *  - Otherwise it counts toward the unread badge; it toasts only if it passes
 *    my notify level (mention always passes; 'all' passes everything).
 *  - A desktop notification only fires for a toast when the tab is not visible
 *    and desktop notifications are enabled.
 */
export function classifyIncomingMessage(message: Message, ctx: ClassifyContext): ClassifyResult {
  if (message.deletedAt) return SILENT;
  if (message.authorUid === ctx.myUid) return SILENT;
  if (ctx.mutedSpaceIds.has(message.spaceId) || ctx.mutedChannelIds.has(message.channelId)) {
    return SILENT;
  }

  const isMention = isMentioned(message, ctx.myUid);
  const focused = ctx.windowVisible && ctx.focusedChannelId === message.channelId;
  if (focused) return { isMention, track: false, toast: false, desktop: false };

  const toast = isMention || ctx.level === 'all';
  const desktop = toast && ctx.desktopEnabled && !ctx.windowVisible;
  return { isMention, track: true, toast, desktop };
}

const PREVIEW_MAX = 140;

/** A short, single-line preview of a message for a toast/inbox row. */
export function previewOf(message: Pick<Message, 'content' | 'attachments'>): string {
  const text = (message.content ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  const n = message.attachments?.length ?? 0;
  if (n > 0) return n === 1 ? '📎 Attachment' : `📎 ${n} attachments`;
  return 'New message';
}
