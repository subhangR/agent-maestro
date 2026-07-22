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
  type NotifyPrefs,
} from '../notifications/collabNotificationTypes';
import { showDesktopNotification } from '../notifications/desktopNotify';
import { openCollabNotification } from '../notifications/collabNotificationNav';
import type { Message } from '../firebase/messagingTypes';
import {
  markChannelNotificationsRead,
  saveNotificationPrefs,
  subscribeNotificationInbox,
  subscribeNotificationProfile,
  writeChannelReadState,
} from '../firebase/notificationClient';
import { CollabPresence } from '../firebase/collabPresence';
import { startWebPush, stopWebPush, type CollabPushPayload } from '../firebase/webPush';

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
const presence = new CollabPresence();
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

function notificationFromPush(payload: CollabPushPayload): CollabNotification {
  return {
    id: `cn_${payload.messageId}`,
    spaceId: payload.spaceId,
    spaceName: payload.spaceName,
    channelId: payload.channelId,
    channelName: payload.channelName,
    messageId: payload.messageId,
    authorUid: payload.actorUid,
    authorName: payload.actorName,
    preview: payload.preview,
    isMention: payload.isMention,
    timestamp: Date.now(),
    read: false,
  };
}

function samePrefs(a: NotifyPrefs, b: NotifyPrefs): boolean {
  return a.level === b.level
    && a.desktopEnabled === b.desktopEnabled
    && a.mutedSpaceIds.join('\u0000') === b.mutedSpaceIds.join('\u0000')
    && a.mutedChannelIds.join('\u0000') === b.mutedChannelIds.join('\u0000');
}

/**
 * Mount once (in AppModals) while signed in. Starts/stops the notification
 * engine with auth, and mirrors window visibility/focus into the store so the
 * classifier can suppress toasts for the channel the user is actively watching.
 */
export function useCollabNotifications(): void {
  const uid = useFirebaseAuthStore((s) => s.user?.uid ?? null);
  const prefs = useCollabNotificationsStore((s) => s.prefs);
  const windowVisible = useCollabNotificationsStore((s) => s.windowVisible);
  const setWindowVisible = useCollabNotificationsStore((s) => s.setWindowVisible);
  const setFocusedChannel = useCollabNotificationsStore((s) => s.setFocusedChannel);
  const markChannelRead = useCollabNotificationsStore((s) => s.markChannelRead);
  const resetLiveState = useCollabNotificationsStore((s) => s.resetLiveState);
  const activeId = useSessionStore((s) => s.activeId);
  const activeChannelBySpace = useMessagingStore((s) => s.activeChannelBySpace);
  const startedRef = useRef(false);
  const profileLoadedRef = useRef(false);

  // Track which channel is on-screen so the classifier can suppress toasts for
  // it (and opening a channel clears its unread badge).
  useEffect(() => {
    const spaceId = activeId && isCollabId(activeId) ? collabActiveIdToFirestoreId(activeId) : null;
    const channelId = spaceId ? activeChannelBySpace[spaceId] ?? null : null;
    setFocusedChannel(channelId);
    if (channelId) {
      markChannelRead(channelId);
      if (uid && spaceId) {
        void markChannelNotificationsRead(uid, channelId).catch(() => {});
        void writeChannelReadState(uid, spaceId, channelId).catch(() => {});
      }
    }
  }, [activeId, activeChannelBySpace, setFocusedChannel, markChannelRead, uid]);

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

  // Preferences move from local storage to a per-user Firestore profile in
  // Phase 2 so the server can apply the same mutes/level before sending FCM.
  useEffect(() => {
    profileLoadedRef.current = false;
    if (!uid) return;
    return subscribeNotificationProfile(uid, (remote) => {
      profileLoadedRef.current = true;
      if (remote && !samePrefs(remote, useCollabNotificationsStore.getState().prefs)) {
        useCollabNotificationsStore.getState().setPrefsFromRemote(remote);
      }
      else void saveNotificationPrefs(uid, useCollabNotificationsStore.getState().prefs).catch(() => {});
    });
  }, [uid]);

  useEffect(() => {
    if (!uid || !profileLoadedRef.current) return;
    void saveNotificationPrefs(uid, prefs).catch(() => {});
  }, [uid, prefs]);

  // Firestore-backed inbox entries are the durable source of truth. The
  // foreground listener may already have surfaced the same message, so merge
  // by deterministic message id rather than creating another toast.
  useEffect(() => {
    if (!uid) return;
    return subscribeNotificationInbox(uid, {
      initial: (items) => useCollabNotificationsStore.getState().hydrateInbox(items),
      added: (item) => {
        const store = useCollabNotificationsStore.getState();
        const focused = store.windowVisible && store.focusedChannelId === item.channelId;
        store.mergeNotification(item, !focused);
        if (focused) store.markChannelRead(item.channelId);
      },
      modified: (item) => useCollabNotificationsStore.getState().mergeNotification(item, false),
    });
  }, [uid]);

  // Per-tab RTDB presence tells the Function whether this exact channel is on
  // screen. A hidden tab remains present but is deliberately not "focused",
  // allowing a true push notification to reach the user.
  useEffect(() => {
    if (!uid) {
      presence.stop();
      return;
    }
    presence.start(uid);
    return () => presence.stop();
  }, [uid]);

  useEffect(() => {
    const spaceId = activeId && isCollabId(activeId) ? collabActiveIdToFirestoreId(activeId) : null;
    const channelId = spaceId ? activeChannelBySpace[spaceId] ?? null : null;
    presence.setFocus(spaceId, channelId, useCollabNotificationsStore.getState().windowVisible);
  }, [activeId, activeChannelBySpace, windowVisible]);

  // FCM foreground messages use the same in-app store as the regular listener;
  // service-worker click events deep-link straight into the relevant channel.
  useEffect(() => {
    if (!uid || !prefs.desktopEnabled) {
      if (uid) void stopWebPush(uid).catch(() => {});
      return;
    }
    let disposed = false;
    let stop: (() => void) | null = null;
    void startWebPush(uid, {
      onForeground: (payload) => {
        if (disposed) return;
        const item = notificationFromPush(payload);
        const store = useCollabNotificationsStore.getState();
        const focused = store.windowVisible && store.focusedChannelId === item.channelId;
        store.mergeNotification(item, !focused);
      },
      onClick: (payload) => {
        if (!disposed) openCollabNotification(notificationFromPush(payload));
      },
    }).then((cleanup) => {
      if (disposed) cleanup();
      else stop = cleanup;
    }).catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, [uid, prefs.desktopEnabled]);

  // A click received while no tab was open reopens Maestro at this URL. Once
  // auth is available, consume that URL and select the Collab channel.
  useEffect(() => {
    if (!uid || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const spaceId = url.searchParams.get('collabSpace');
    const channelId = url.searchParams.get('collabChannel');
    if (!spaceId || !channelId) return;
    url.searchParams.delete('collabSpace');
    url.searchParams.delete('collabChannel');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    openCollabNotification({ spaceId, channelId });
  }, [uid]);

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
