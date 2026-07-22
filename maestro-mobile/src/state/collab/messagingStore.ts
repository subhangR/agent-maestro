// src/state/collab/messagingStore.ts — Zustand store for channels + messages.
//
// Keyed by space/channel. Manages:
//   - Channel subscriptions per space
//   - Active channel per space
//   - Message subscriptions per channel (ascending oldest→newest)
//   - Pagination (loadOlder via fetchOlder)
//   - Optimistic pending messages with clientMsgId reconciliation
//   - Edit / soft-delete passthrough
//   - Channel creation
//
// Import: use `useMessagingStore` directly; select slices with shallow.
import { create } from 'zustand';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  MessagingClient,
  type Channel,
  type Message,
  type MessageAttachment,
  type MessageMention,
  type PendingMessage,
} from '@/services/collab';

// ── Tiny unique-id helper (no uuid dep) ────────────────────────────────────
let _counter = 0;
function genId(): string {
  return `${Date.now()}-${(_counter++).toString(36)}`;
}

// ── Per-channel message state ────────────────────────────────────────────────
interface ChannelMsgState {
  messages: Message[];
  hasMore: boolean;
  loadingOlder: boolean;
}

// ── Store state + actions ─────────────────────────────────────────────────────
export interface MessagingState {
  // channels[spaceId] = Channel[]
  channels: Record<string, Channel[]>;
  // activeChannelId[spaceId] = channelId | null
  activeChannelId: Record<string, string | null>;
  // msgState[spaceId:channelId] = ChannelMsgState
  msgState: Record<string, ChannelMsgState>;
  // pending[spaceId:channelId] = PendingMessage[]
  pending: Record<string, PendingMessage[]>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Start channel subscription for a space. Returns unsub fn. */
  subscribeChannels: (spaceId: string) => () => void;
  /** Start message subscription for the active channel. Returns unsub fn. */
  subscribeMessages: (spaceId: string, channelId: string) => () => void;

  // ── Channel actions ───────────────────────────────────────────────────────
  selectChannel: (spaceId: string, channelId: string) => void;
  createChannel: (
    user: FirebaseAuthTypes.User,
    spaceId: string,
    input: { name: string; description?: string },
  ) => Promise<string>;

  // ── Message actions ───────────────────────────────────────────────────────
  loadOlder: (spaceId: string, channelId: string) => Promise<void>;
  send: (
    user: FirebaseAuthTypes.User,
    spaceId: string,
    channelId: string,
    content: string,
    mentions: MessageMention[],
    attachments: MessageAttachment[],
  ) => Promise<void>;
  retryPending: (user: FirebaseAuthTypes.User, spaceId: string, channelId: string, tempId: string) => Promise<void>;
  dismissPending: (spaceId: string, channelId: string, tempId: string) => void;
  editMessage: (spaceId: string, channelId: string, messageId: string, content: string) => Promise<void>;
  softDeleteMessage: (spaceId: string, channelId: string, messageId: string) => Promise<void>;
}

// ── Stable empty refs ──────────────────────────────────────────────────────
const EMPTY_CHANNELS: Channel[] = [];
const EMPTY_MESSAGES: Message[] = [];
const EMPTY_PENDING: PendingMessage[] = [];
const DEFAULT_MSG_STATE: ChannelMsgState = { messages: EMPTY_MESSAGES, hasMore: false, loadingOlder: false };

function channelKey(spaceId: string, channelId: string): string {
  return `${spaceId}:${channelId}`;
}

// ── Store ──────────────────────────────────────────────────────────────────
export const useMessagingStore = create<MessagingState>((set, get) => ({
  channels: {},
  activeChannelId: {},
  msgState: {},
  pending: {},

  // ── subscribeChannels ────────────────────────────────────────────────────
  subscribeChannels(spaceId) {
    const unsub = MessagingClient.subscribeToChannels(
      spaceId,
      (channels) => {
        set((s) => {
          const next: typeof s.channels = { ...s.channels, [spaceId]: channels };
          // Auto-select first channel if nothing is selected yet
          const currentActive = s.activeChannelId[spaceId];
          const activeIsValid = channels.some((c) => c.id === currentActive);
          const nextActive: string | null = activeIsValid
            ? (currentActive ?? null)
            : (channels.find((c) => c.isDefault) ?? channels[0])?.id ?? null;
          return {
            channels: next,
            activeChannelId: { ...s.activeChannelId, [spaceId]: nextActive },
          };
        });
      },
      (err) => console.warn('[messaging] channels error', err),
    );
    return unsub;
  },

  // ── subscribeMessages ────────────────────────────────────────────────────
  subscribeMessages(spaceId, channelId) {
    const key = channelKey(spaceId, channelId);
    const unsub = MessagingClient.subscribeToMessages(
      spaceId,
      channelId,
      (incoming) => {
        set((s) => {
          const prev = s.msgState[key] ?? DEFAULT_MSG_STATE;
          // Prepend any older pages we already fetched; the subscription only
          // delivers the latest page. Keep older prefix if we have it.
          const existingOlder = prev.messages.slice(0, Math.max(0, prev.messages.length - incoming.length));
          const merged = mergeMessages(existingOlder, incoming);

          // Reconcile pending: remove any whose clientMsgId appears in incoming
          const incomingIds = new Set(incoming.map((m) => m.clientMsgId).filter(Boolean));
          const prevPending = s.pending[key] ?? EMPTY_PENDING;
          const nextPending = prevPending.filter((p) => !incomingIds.has(p.tempId));

          return {
            msgState: { ...s.msgState, [key]: { ...prev, messages: merged } },
            pending: { ...s.pending, [key]: nextPending },
          };
        });
      },
      (err) => console.warn('[messaging] messages error', spaceId, channelId, err),
    );
    return unsub;
  },

  // ── selectChannel ────────────────────────────────────────────────────────
  selectChannel(spaceId, channelId) {
    set((s) => ({ activeChannelId: { ...s.activeChannelId, [spaceId]: channelId } }));
  },

  // ── createChannel ────────────────────────────────────────────────────────
  async createChannel(user, spaceId, input) {
    const channelId = await MessagingClient.createChannel(user, spaceId, input);
    set((s) => ({ activeChannelId: { ...s.activeChannelId, [spaceId]: channelId } }));
    return channelId;
  },

  // ── loadOlder ────────────────────────────────────────────────────────────
  async loadOlder(spaceId, channelId) {
    const key = channelKey(spaceId, channelId);
    const state = get();
    const prev = state.msgState[key] ?? DEFAULT_MSG_STATE;
    if (prev.loadingOlder || !prev.hasMore) return;

    // Find oldest loaded message timestamp
    const oldest = prev.messages[0];
    if (!oldest || oldest.createdAtMs == null) return;

    set((s) => ({
      msgState: {
        ...s.msgState,
        [key]: { ...prev, loadingOlder: true },
      },
    }));

    try {
      const { messages: older, hasMore } = await MessagingClient.fetchOlder(
        spaceId,
        channelId,
        oldest.createdAtMs!,
      );
      set((s) => {
        const current = s.msgState[key] ?? DEFAULT_MSG_STATE;
        return {
          msgState: {
            ...s.msgState,
            [key]: {
              messages: mergeMessages(older, current.messages),
              hasMore,
              loadingOlder: false,
            },
          },
        };
      });
    } catch (err) {
      console.warn('[messaging] loadOlder error', err);
      set((s) => ({
        msgState: {
          ...s.msgState,
          [key]: { ...(s.msgState[key] ?? DEFAULT_MSG_STATE), loadingOlder: false },
        },
      }));
    }
  },

  // ── send ─────────────────────────────────────────────────────────────────
  async send(user, spaceId, channelId, content, mentions, attachments) {
    const key = channelKey(spaceId, channelId);
    const tempId = genId();
    const pending: PendingMessage = {
      tempId,
      spaceId,
      channelId,
      authorUid: user.uid,
      authorDisplayName: user.displayName ?? 'Unknown',
      authorPhotoUrl: user.photoURL ?? null,
      content,
      createdAtMs: Date.now(),
      status: 'sending',
      mentions,
      attachments,
    };

    // Optimistically push
    set((s) => {
      const prev = s.pending[key] ?? EMPTY_PENDING;
      return { pending: { ...s.pending, [key]: [...prev, pending] } };
    });

    try {
      await MessagingClient.sendMessage(user, spaceId, channelId, {
        content,
        mentions,
        attachments,
        clientMsgId: tempId,
      });
      // Subscription will deliver the confirmed message and reconcile via clientMsgId
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set((s) => {
        const prev = s.pending[key] ?? EMPTY_PENDING;
        return {
          pending: {
            ...s.pending,
            [key]: prev.map((p) => (p.tempId === tempId ? { ...p, status: 'failed' as const, error } : p)),
          },
        };
      });
    }
  },

  // ── retryPending ─────────────────────────────────────────────────────────
  async retryPending(user, spaceId, channelId, tempId) {
    const key = channelKey(spaceId, channelId);
    const state = get();
    const prev = state.pending[key] ?? EMPTY_PENDING;
    const pm = prev.find((p) => p.tempId === tempId);
    if (!pm) return;

    // Reset to sending
    set((s) => ({
      pending: {
        ...s.pending,
        [key]: (s.pending[key] ?? EMPTY_PENDING).map((p) =>
          p.tempId === tempId ? { ...p, status: 'sending' as const, error: undefined } : p,
        ),
      },
    }));

    try {
      await MessagingClient.sendMessage(user, spaceId, channelId, {
        content: pm.content,
        mentions: pm.mentions,
        attachments: pm.attachments,
        clientMsgId: tempId,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      set((s) => ({
        pending: {
          ...s.pending,
          [key]: (s.pending[key] ?? EMPTY_PENDING).map((p) =>
            p.tempId === tempId ? { ...p, status: 'failed' as const, error } : p,
          ),
        },
      }));
    }
  },

  // ── dismissPending ────────────────────────────────────────────────────────
  dismissPending(spaceId, channelId, tempId) {
    const key = channelKey(spaceId, channelId);
    set((s) => ({
      pending: {
        ...s.pending,
        [key]: (s.pending[key] ?? EMPTY_PENDING).filter((p) => p.tempId !== tempId),
      },
    }));
  },

  // ── editMessage ───────────────────────────────────────────────────────────
  async editMessage(spaceId, channelId, messageId, content) {
    await MessagingClient.editMessage(spaceId, channelId, messageId, content);
  },

  // ── softDeleteMessage ─────────────────────────────────────────────────────
  async softDeleteMessage(spaceId, channelId, messageId) {
    await MessagingClient.softDeleteMessage(spaceId, channelId, messageId);
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────
/** Merge two ascending message arrays, deduplicating by id. Older first. */
function mergeMessages(older: Message[], newer: Message[]): Message[] {
  const seen = new Set<string>();
  const result: Message[] = [];
  for (const m of older) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push(m);
    }
  }
  for (const m of newer) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      result.push(m);
    }
  }
  return result;
}

// ── Convenience selectors ──────────────────────────────────────────────────
export function selectChannels(spaceId: string) {
  return (s: MessagingState): Channel[] => s.channels[spaceId] ?? EMPTY_CHANNELS;
}

export function selectActiveChannelId(spaceId: string) {
  return (s: MessagingState): string | null => s.activeChannelId[spaceId] ?? null;
}

export function selectMessages(spaceId: string, channelId: string) {
  const key = channelKey(spaceId, channelId);
  return (s: MessagingState): Message[] => s.msgState[key]?.messages ?? EMPTY_MESSAGES;
}

export function selectHasMore(spaceId: string, channelId: string) {
  const key = channelKey(spaceId, channelId);
  return (s: MessagingState): boolean => s.msgState[key]?.hasMore ?? false;
}

export function selectLoadingOlder(spaceId: string, channelId: string) {
  const key = channelKey(spaceId, channelId);
  return (s: MessagingState): boolean => s.msgState[key]?.loadingOlder ?? false;
}

export function selectPending(spaceId: string, channelId: string) {
  const key = channelKey(spaceId, channelId);
  return (s: MessagingState): PendingMessage[] => s.pending[key] ?? EMPTY_PENDING;
}
