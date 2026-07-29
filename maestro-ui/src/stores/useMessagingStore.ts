import { create } from 'zustand';
import { User } from 'firebase/auth';
import { QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore';
import { MessagingClient } from '../firebase/MessagingClient';
import { SpaceFilesClient } from '../firebase/SpaceFilesClient';
import { maestroClient } from '../utils/MaestroClient';
import { useProjectStore } from './useProjectStore';
import {
  Channel,
  Message,
  MessageAttachment,
  MessageMention,
  PendingMessage,
  CreateChannelInput,
  MESSAGES_PAGE_SIZE,
} from '../firebase/messagingTypes';

/**
 * Tracks message IDs for which we've already spawned agent sessions, so a
 * retry or re-render of the send path can't spawn duplicates.
 */
const _agentMentionSpawned = new Set<string>();

/**
 * When a delivered message @-mentions Maestro agents (shared team members),
 * spawn a coordinated-worker session for each one in the active project.
 */
function notifyAgentMentions(
  spaceId: string,
  channelId: string,
  messageId: string | null,
  mentions: MessageMention[],
): void {
  const agents = mentions.filter((m) => m.kind === 'agent');
  if (agents.length === 0) return;

  const dedupeKey = messageId ?? `${spaceId}/${channelId}/${Date.now()}`;
  if (_agentMentionSpawned.has(dedupeKey)) return;
  _agentMentionSpawned.add(dedupeKey);

  const projectId = useProjectStore.getState().activeProjectId;
  if (!projectId) {
    // eslint-disable-next-line no-console
    console.warn('[messaging] @agent mention: no active project — skipping spawn');
    return;
  }

  for (const agent of agents) {
    maestroClient.spawnSession({
      projectId,
      taskIds: [],
      teamMemberId: agent.id,
      spawnSource: 'ui',
      context: { source: 'collab-mention', spaceId, channelId, messageId },
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[messaging] failed to spawn session for @${agent.displayName}:`, err);
    });
  }
}

type SpaceId = string;
type ChannelId = string;

interface MessagingState {
  // Channels
  channelsBySpace: Record<SpaceId, Channel[]>;
  channelsLoading: Record<SpaceId, boolean>;
  channelsError: Record<SpaceId, string | null>;
  activeChannelBySpace: Record<SpaceId, ChannelId | null>;
  channelSubs: Record<SpaceId, Unsubscribe>;

  // Messages
  messagesByChannel: Record<ChannelId, Message[]>;
  messagesLoading: Record<ChannelId, boolean>;
  messagesError: Record<ChannelId, string | null>;
  messagesHasMore: Record<ChannelId, boolean>;
  messagesOldestCursor: Record<ChannelId, QueryDocumentSnapshot | null>;
  messagesLoadingOlder: Record<ChannelId, boolean>;
  pendingByChannel: Record<ChannelId, PendingMessage[]>;
  messageSubs: Record<ChannelId, Unsubscribe>;

  // Action state
  sending: Record<ChannelId, boolean>;
  creatingChannel: boolean;
  channelActionError: string | null;

  // Thread state
  threadMessagesByParent: Record<string, Message[]>;
  threadLoading: Record<string, boolean>;
  threadError: Record<string, string | null>;
  threadSubs: Record<string, Unsubscribe>;

  // Actions
  subscribeToChannels: (spaceId: SpaceId) => void;
  unsubscribeFromChannels: (spaceId: SpaceId) => void;
  selectChannel: (spaceId: SpaceId, channelId: ChannelId | null) => void;
  ensureDefaultChannelSelected: (spaceId: SpaceId) => void;

  subscribeToMessages: (spaceId: SpaceId, channelId: ChannelId) => void;
  unsubscribeFromMessages: (channelId: ChannelId) => void;
  loadOlder: (spaceId: SpaceId, channelId: ChannelId) => Promise<void>;

  sendMessage: (
    user: User,
    spaceId: SpaceId,
    channelId: ChannelId,
    content: string,
    mentions?: MessageMention[],
    attachments?: MessageAttachment[],
  ) => Promise<void>;
  retryPending: (user: User, spaceId: SpaceId, channelId: ChannelId, tempId: string) => Promise<void>;
  dismissPending: (channelId: ChannelId, tempId: string) => void;

  editMessage: (spaceId: SpaceId, channelId: ChannelId, messageId: string, content: string) => Promise<void>;
  softDeleteMessage: (spaceId: SpaceId, channelId: ChannelId, messageId: string) => Promise<void>;

  createChannel: (user: User, spaceId: SpaceId, input: CreateChannelInput) => Promise<Channel>;
  clearChannelActionError: () => void;

  // Thread actions
  subscribeToThread: (spaceId: SpaceId, channelId: ChannelId, parentMessageId: string) => void;
  unsubscribeFromThread: (parentMessageId: string) => void;
  sendReply: (
    user: User,
    spaceId: SpaceId,
    channelId: ChannelId,
    parentMessageId: string,
    content: string,
    mentions?: MessageMention[],
  ) => Promise<void>;

  /** Tears down every live subscription and resets state (sign-out path). */
  unsubscribeAll: () => void;
}

/** Collision-proof pending id; doubles as the message's `clientMsgId`. */
function nextTempId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pending_${crypto.randomUUID()}`;
  }
  return `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  channelsBySpace: {},
  channelsLoading: {},
  channelsError: {},
  activeChannelBySpace: {},
  channelSubs: {},

  messagesByChannel: {},
  messagesLoading: {},
  messagesError: {},
  messagesHasMore: {},
  messagesOldestCursor: {},
  messagesLoadingOlder: {},
  pendingByChannel: {},
  messageSubs: {},

  sending: {},
  creatingChannel: false,
  channelActionError: null,

  threadMessagesByParent: {},
  threadLoading: {},
  threadError: {},
  threadSubs: {},

  // ─── Channels ────────────────────────────────────────────────────

  subscribeToChannels: (spaceId) => {
    if (get().channelSubs[spaceId]) return;
    set((s) => ({
      channelsLoading: { ...s.channelsLoading, [spaceId]: true },
      channelsError: { ...s.channelsError, [spaceId]: null },
    }));
    const unsub = MessagingClient.subscribeToChannels(
      spaceId,
      (channels) => {
        set((s) => ({
          channelsBySpace: { ...s.channelsBySpace, [spaceId]: channels },
          channelsLoading: { ...s.channelsLoading, [spaceId]: false },
          channelsError: { ...s.channelsError, [spaceId]: null },
        }));
        get().ensureDefaultChannelSelected(spaceId);
      },
      (err) => {
        set((s) => ({
          channelsLoading: { ...s.channelsLoading, [spaceId]: false },
          channelsError: {
            ...s.channelsError,
            [spaceId]: err?.message ?? 'Failed to load channels.',
          },
        }));
      },
    );
    set((s) => ({ channelSubs: { ...s.channelSubs, [spaceId]: unsub } }));
  },

  unsubscribeFromChannels: (spaceId) => {
    const unsub = get().channelSubs[spaceId];
    if (unsub) unsub();
    set((s) => {
      const nextSubs = { ...s.channelSubs };
      delete nextSubs[spaceId];
      return { channelSubs: nextSubs };
    });
  },

  selectChannel: (spaceId, channelId) => {
    set((s) => ({
      activeChannelBySpace: { ...s.activeChannelBySpace, [spaceId]: channelId },
    }));
  },

  ensureDefaultChannelSelected: (spaceId) => {
    const state = get();
    const current = state.activeChannelBySpace[spaceId];
    const channels = state.channelsBySpace[spaceId] ?? [];
    if (channels.length === 0) {
      if (current) {
        set((s) => ({
          activeChannelBySpace: { ...s.activeChannelBySpace, [spaceId]: null },
        }));
      }
      return;
    }
    const stillExists = current && channels.some((c) => c.id === current);
    if (stillExists) return;
    const def = channels.find((c) => c.isDefault) ?? channels[0];
    set((s) => ({
      activeChannelBySpace: { ...s.activeChannelBySpace, [spaceId]: def.id },
    }));
  },

  // ─── Messages ────────────────────────────────────────────────────

  subscribeToMessages: (spaceId, channelId) => {
    if (get().messageSubs[channelId]) return;
    set((s) => ({
      messagesLoading: { ...s.messagesLoading, [channelId]: true },
      messagesError: { ...s.messagesError, [channelId]: null },
    }));
    const unsub = MessagingClient.subscribeToMessages(
      spaceId,
      channelId,
      (liveMessages, oldest, hasMoreFromLive) => {
        set((s) => {
          // Reconcile pending: a confirmed message carries the exact
          // clientMsgId the optimistic entry was created with. Fall back to
          // an author+content fingerprint only for legacy messages without one.
          const incomingClientIds = new Set(
            liveMessages.map((m) => m.clientMsgId).filter(Boolean),
          );
          const incomingFingerprints = new Set(
            liveMessages
              .filter((m) => !m.clientMsgId)
              .map((m) => `${m.authorUid}::${m.content}`),
          );
          const currentPending = s.pendingByChannel[channelId] ?? [];
          const remainingPending = currentPending.filter((p) => {
            if (p.status !== 'sending') return true;
            if (incomingClientIds.has(p.tempId)) return false;
            return !incomingFingerprints.has(`${p.authorUid}::${p.content}`);
          });

          // Merge: keep previously-loaded "older" messages that fall before
          // the live tail, and replace the tail with the fresh snapshot.
          // This way edits/deletes within the live tail are reflected, and
          // older messages loaded via loadOlder are preserved.
          const existing = s.messagesByChannel[channelId] ?? [];
          const liveIds = new Set(liveMessages.map((m) => m.id));
          const oldestLiveMs = liveMessages[0]?.createdAt?.toMillis?.() ?? null;
          const olderToKeep = oldestLiveMs == null
            ? existing.filter((m) => !liveIds.has(m.id))
            : existing.filter(
                (m) =>
                  !liveIds.has(m.id) &&
                  m.createdAt?.toMillis?.() != null &&
                  m.createdAt.toMillis() < oldestLiveMs,
              );
          const merged = [...olderToKeep, ...liveMessages];

          // hasMore stays true if the live snapshot was full, OR if we already
          // know older history exists past our current cursor.
          const previousHasMore = s.messagesHasMore[channelId] ?? false;
          const hasMore = hasMoreFromLive || (olderToKeep.length === 0 ? hasMoreFromLive : previousHasMore);

          return {
            messagesByChannel: { ...s.messagesByChannel, [channelId]: merged },
            messagesLoading: { ...s.messagesLoading, [channelId]: false },
            messagesOldestCursor: olderToKeep.length === 0
              ? { ...s.messagesOldestCursor, [channelId]: oldest }
              : s.messagesOldestCursor,
            messagesHasMore: { ...s.messagesHasMore, [channelId]: hasMore },
            pendingByChannel: { ...s.pendingByChannel, [channelId]: remainingPending },
          };
        });
      },
      {
        limit: MESSAGES_PAGE_SIZE,
        onError: (err) => {
          set((s) => ({
            messagesLoading: { ...s.messagesLoading, [channelId]: false },
            messagesError: {
              ...s.messagesError,
              [channelId]: err?.message ?? 'Live messages stopped. Check your connection.',
            },
          }));
        },
      },
    );
    set((s) => ({ messageSubs: { ...s.messageSubs, [channelId]: unsub } }));
  },

  unsubscribeFromMessages: (channelId) => {
    const unsub = get().messageSubs[channelId];
    if (unsub) unsub();
    set((s) => {
      const nextSubs = { ...s.messageSubs };
      delete nextSubs[channelId];
      return { messageSubs: nextSubs };
    });
  },

  loadOlder: async (spaceId, channelId) => {
    const state = get();
    if (state.messagesLoadingOlder[channelId]) return;
    const cursor = state.messagesOldestCursor[channelId];
    if (!cursor) return;
    set((s) => ({
      messagesLoadingOlder: { ...s.messagesLoadingOlder, [channelId]: true },
    }));
    try {
      const { messages: older, oldest, hasMore } = await MessagingClient.loadOlderMessages(
        spaceId,
        channelId,
        cursor,
      );
      set((s) => {
        const existing = s.messagesByChannel[channelId] ?? [];
        const existingIds = new Set(existing.map((m) => m.id));
        const merged = [...older.filter((m) => !existingIds.has(m.id)), ...existing];
        return {
          messagesByChannel: { ...s.messagesByChannel, [channelId]: merged },
          messagesOldestCursor: {
            ...s.messagesOldestCursor,
            [channelId]: oldest ?? s.messagesOldestCursor[channelId],
          },
          messagesHasMore: { ...s.messagesHasMore, [channelId]: hasMore },
        };
      });
    } catch (e: any) {
      set((s) => ({
        messagesError: {
          ...s.messagesError,
          [channelId]: e?.message ?? 'Failed to load older messages',
        },
      }));
    } finally {
      set((s) => ({
        messagesLoadingOlder: { ...s.messagesLoadingOlder, [channelId]: false },
      }));
    }
  },

  sendMessage: async (user, spaceId, channelId, content, mentions = [], attachments = []) => {
    const trimmed = content.trim();
    // Attachment-only messages (no text) are allowed.
    if (!trimmed && attachments.length === 0) return;
    // Keep only mentions whose token still appears in the final text.
    const activeMentions = mentions.filter((m) => trimmed.includes(`@${m.displayName}`));
    const tempId = nextTempId();
    const pending: PendingMessage = {
      tempId,
      spaceId,
      channelId,
      authorUid: user.uid,
      authorDisplayName: user.displayName ?? user.email ?? 'You',
      authorPhotoUrl: user.photoURL ?? null,
      content: trimmed,
      createdAtMs: Date.now(),
      status: 'sending',
      mentions: activeMentions,
      attachments,
    };
    set((s) => ({
      pendingByChannel: {
        ...s.pendingByChannel,
        [channelId]: [...(s.pendingByChannel[channelId] ?? []), pending],
      },
      sending: { ...s.sending, [channelId]: true },
    }));
    try {
      const sent = await MessagingClient.sendMessage(user, spaceId, channelId, trimmed, activeMentions, {
        clientMsgId: tempId,
        attachments,
      });
      notifyAgentMentions(spaceId, channelId, sent.id, activeMentions);
      // The subscription will reconcile and remove the pending entry.
    } catch (e: any) {
      set((s) => {
        const list = s.pendingByChannel[channelId] ?? [];
        return {
          pendingByChannel: {
            ...s.pendingByChannel,
            [channelId]: list.map((p) =>
              p.tempId === tempId
                ? { ...p, status: 'failed', error: e?.message ?? 'Failed to send' }
                : p,
            ),
          },
        };
      });
    } finally {
      set((s) => ({ sending: { ...s.sending, [channelId]: false } }));
    }
  },

  retryPending: async (user, spaceId, channelId, tempId) => {
    const list = get().pendingByChannel[channelId] ?? [];
    const item = list.find((p) => p.tempId === tempId);
    if (!item) return;
    set((s) => {
      const cur = s.pendingByChannel[channelId] ?? [];
      return {
        pendingByChannel: {
          ...s.pendingByChannel,
          [channelId]: cur.map((p) =>
            p.tempId === tempId ? { ...p, status: 'sending', error: undefined } : p,
          ),
        },
      };
    });
    try {
      const sent = await MessagingClient.sendMessage(
        user,
        spaceId,
        channelId,
        item.content,
        item.mentions ?? [],
        { clientMsgId: item.tempId, attachments: item.attachments ?? [] },
      );
      notifyAgentMentions(spaceId, channelId, sent.id, item.mentions ?? []);
    } catch (e: any) {
      set((s) => {
        const cur = s.pendingByChannel[channelId] ?? [];
        return {
          pendingByChannel: {
            ...s.pendingByChannel,
            [channelId]: cur.map((p) =>
              p.tempId === tempId
                ? { ...p, status: 'failed', error: e?.message ?? 'Failed to send' }
                : p,
            ),
          },
        };
      });
    }
  },

  dismissPending: (channelId, tempId) => {
    set((s) => ({
      pendingByChannel: {
        ...s.pendingByChannel,
        [channelId]: (s.pendingByChannel[channelId] ?? []).filter((p) => p.tempId !== tempId),
      },
    }));
  },

  editMessage: async (spaceId, channelId, messageId, content) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await MessagingClient.editMessage(spaceId, channelId, messageId, trimmed);
  },

  softDeleteMessage: async (spaceId, channelId, messageId) => {
    // Capture attachment refs before the delete clears them.
    const message = (get().messagesByChannel[channelId] ?? []).find((m) => m.id === messageId);
    await MessagingClient.softDeleteMessage(spaceId, channelId, messageId);
    // Garbage-collect the chat-attachment file docs this message owned.
    // Best-effort: the message is already gone either way.
    for (const a of message?.attachments ?? []) {
      SpaceFilesClient.delete(spaceId, a.fileId).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[messaging] failed to clean up attachment file:', err);
      });
    }
  },

  createChannel: async (user, spaceId, input) => {
    set({ creatingChannel: true, channelActionError: null });
    try {
      const channels = get().channelsBySpace[spaceId] ?? [];
      const maxPos = channels.reduce((acc, c) => Math.max(acc, c.position ?? 0), 0);
      const created = await MessagingClient.createChannel(user, spaceId, input, {
        position: maxPos + 1,
      });
      return created;
    } catch (e: any) {
      set({ channelActionError: e?.message ?? 'Failed to create channel' });
      throw e;
    } finally {
      set({ creatingChannel: false });
    }
  },

  clearChannelActionError: () => set({ channelActionError: null }),

  // ─── Threads ─────────────────────────────────────────────────────

  subscribeToThread: (spaceId, channelId, parentMessageId) => {
    if (get().threadSubs[parentMessageId]) return;
    set((s) => ({
      threadLoading: { ...s.threadLoading, [parentMessageId]: true },
      threadError: { ...s.threadError, [parentMessageId]: null },
    }));
    const unsub = MessagingClient.subscribeToThread(
      spaceId,
      channelId,
      parentMessageId,
      (messages) => {
        set((s) => ({
          threadMessagesByParent: { ...s.threadMessagesByParent, [parentMessageId]: messages },
          threadLoading: { ...s.threadLoading, [parentMessageId]: false },
          threadError: { ...s.threadError, [parentMessageId]: null },
        }));
      },
      {
        onError: (err) => {
          set((s) => ({
            threadLoading: { ...s.threadLoading, [parentMessageId]: false },
            threadError: {
              ...s.threadError,
              [parentMessageId]: err?.message ?? 'Failed to load thread.',
            },
          }));
        },
      },
    );
    set((s) => ({ threadSubs: { ...s.threadSubs, [parentMessageId]: unsub } }));
  },

  unsubscribeFromThread: (parentMessageId) => {
    const unsub = get().threadSubs[parentMessageId];
    if (unsub) unsub();
    set((s) => {
      const nextSubs = { ...s.threadSubs };
      delete nextSubs[parentMessageId];
      return { threadSubs: nextSubs };
    });
  },

  sendReply: async (user, spaceId, channelId, parentMessageId, content, mentions = []) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await MessagingClient.sendReply(user, spaceId, channelId, parentMessageId, trimmed, mentions);
  },

  unsubscribeAll: () => {
    const { channelSubs, messageSubs, threadSubs } = get();
    Object.values(channelSubs).forEach((unsub) => unsub());
    Object.values(messageSubs).forEach((unsub) => unsub());
    Object.values(threadSubs).forEach((unsub) => unsub());
    set({
      channelsBySpace: {},
      channelsLoading: {},
      channelsError: {},
      activeChannelBySpace: {},
      channelSubs: {},
      messagesByChannel: {},
      messagesLoading: {},
      messagesError: {},
      messagesHasMore: {},
      messagesOldestCursor: {},
      messagesLoadingOlder: {},
      pendingByChannel: {},
      messageSubs: {},
      sending: {},
      creatingChannel: false,
      channelActionError: null,
      threadMessagesByParent: {},
      threadLoading: {},
      threadError: {},
      threadSubs: {},
    });
  },
}));
