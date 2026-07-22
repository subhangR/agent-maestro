import { useEffect, useRef } from 'react';
import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { useCollabNotificationsStore } from '../stores/useCollabNotificationsStore';
import { useSessionStore } from '../stores/useSessionStore';
import { useMessagingStore } from '../stores/useMessagingStore';
import { CollabSpaceClient } from '../firebase/CollabSpaceClient';
import { MessagingClient } from '../firebase/MessagingClient';
import { isCollabId, collabActiveIdToFirestoreId } from '../app/types/space';
import {
  CollabNotificationEngine,
  ChannelMeta,
} from '../notifications/CollabNotificationEngine';
import {
  classifyIncomingMessage,
  previewOf,
  type CollabNotification,
} from '../notifications/collabNotificationTypes';
import { showDesktopNotification } from '../notifications/desktopNotify';
import { openCollabNotification } from '../notifications/collabNotificationNav';
import type { Message } from '../firebase/messagingTypes';

/**
 * Bridges a new message surfaced by the engine to the notifications store,
 * running the pure classifier against LIVE store state (read via getState so
 * there are no stale closures). Exported for direct unit testing.
 */
export function handleEngineMessage(message: Message, meta: ChannelMeta): void {
  const myUid = useFirebaseAuthStore.getState().user?.uid;
  if (!myUid) return;

  const store = useCollabNotificationsStore.getState();
  const { prefs, focusedChannelId, windowVisible } = store;

  const result = classifyIncomingMessage(message, {
    myUid,
    level: prefs.level,
    desktopEnabled: prefs.desktopEnabled,
    mutedSpaceIds: new Set(prefs.mutedSpaceIds),
    mutedChannelIds: new Set(prefs.mutedChannelIds),
    focusedChannelId,
    windowVisible,
  });

  if (!result.track && !result.toast) {
    // Nothing to surface. If it landed in the channel I'm actively watching,
    // treat it as read so its badge stays cleared.
    if (windowVisible && focusedChannelId === message.channelId) {
      store.markChannelRead(message.channelId);
    }
    return;
  }

  if (result.track) store.recordActivity(message.channelId);

  if (result.toast) {
    const authorName = message.authorDisplayName || 'Someone';
    const notif: CollabNotification = {
      id: `cn_${message.id}`,
      spaceId: message.spaceId,
      spaceName: meta.spaceName,
      channelId: message.channelId,
      channelName: meta.channelName,
      messageId: message.id,
      authorUid: message.authorUid,
      authorName,
      preview: previewOf(message),
      isMention: result.isMention,
      timestamp: Date.now(),
      read: false,
    };
    store.notify(notif);

    if (result.desktop) {
      const channelLabel = meta.channelName ? `#${meta.channelName}` : 'a channel';
      showDesktopNotification({
        title: notif.isMention ? `${authorName} mentioned you` : `${authorName} · ${channelLabel}`,
        body: notif.preview,
        tag: message.channelId,
        onClick: () => openCollabNotification(notif),
      });
    }
  }
}

/** Lazily-built singleton engine (survives re-renders; one per app). */
let engine: CollabNotificationEngine | null = null;
function getEngine(): CollabNotificationEngine {
  if (!engine) {
    engine = new CollabNotificationEngine({
      subscribeToAllSpaces: (uid, cb, onErr) =>
        CollabSpaceClient.subscribeToAllForUser(uid, cb, onErr),
      subscribeToChannels: (spaceId, cb, onErr) =>
        MessagingClient.subscribeToChannels(spaceId, cb, onErr),
      subscribeToNewMessages: (spaceId, channelId, since, cb, onErr) =>
        MessagingClient.subscribeToNewMessages(spaceId, channelId, since, cb, onErr),
      onNewMessage: handleEngineMessage,
    });
  }
  return engine;
}

function computeVisible(): boolean {
  if (typeof document === 'undefined') return true;
  const visible = document.visibilityState === 'visible';
  const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return visible && focused;
}

/**
 * Mount once (in AppModals) while signed in. Starts/stops the notification
 * engine with auth, and mirrors window visibility/focus into the store so the
 * classifier can suppress toasts for the channel the user is actively watching.
 */
export function useCollabNotifications(): void {
  const uid = useFirebaseAuthStore((s) => s.user?.uid ?? null);
  const setWindowVisible = useCollabNotificationsStore((s) => s.setWindowVisible);
  const setFocusedChannel = useCollabNotificationsStore((s) => s.setFocusedChannel);
  const markChannelRead = useCollabNotificationsStore((s) => s.markChannelRead);
  const resetLiveState = useCollabNotificationsStore((s) => s.resetLiveState);
  const activeId = useSessionStore((s) => s.activeId);
  const activeChannelBySpace = useMessagingStore((s) => s.activeChannelBySpace);
  const startedRef = useRef(false);

  // Track which channel is on-screen so the classifier can suppress toasts for
  // it (and opening a channel clears its unread badge).
  useEffect(() => {
    const spaceId = activeId && isCollabId(activeId) ? collabActiveIdToFirestoreId(activeId) : null;
    const channelId = spaceId ? activeChannelBySpace[spaceId] ?? null : null;
    setFocusedChannel(channelId);
    if (channelId) markChannelRead(channelId);
  }, [activeId, activeChannelBySpace, setFocusedChannel, markChannelRead]);

  useEffect(() => {
    const eng = getEngine();
    if (uid) {
      eng.start(uid);
      startedRef.current = true;
    } else if (startedRef.current) {
      eng.stop();
      resetLiveState();
      startedRef.current = false;
    }
    return () => {
      // Only tear the engine down on unmount; uid changes are handled above.
    };
  }, [uid, resetLiveState]);

  useEffect(() => {
    const sync = () => setWindowVisible(computeVisible());
    sync();
    window.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [setWindowVisible]);

  useEffect(() => {
    return () => {
      getEngine().stop();
    };
  }, []);
}
