// src/features/collab/collabRuntime.ts — LEAD-owned integration glue.
//
// Binds the three notification pieces (engine + store + FCM) to Firebase auth so
// no screen has to. On sign-in it starts the CollabNotificationEngine (subscribes
// every space→channel→message the user belongs to) and registers for push; on
// sign-out it tears both down. The engine's onNewMessage runs the pure
// classifier and feeds the notifications store (toast + inbox + unread badges).
import { useEffect } from 'react';

import { MessagingClient, SpacesClient } from '@/services/collab';
import {
  CollabNotificationEngine,
  type EngineDeps,
} from '@/services/collab/notifications/CollabNotificationEngine';
import {
  type CollabNotification,
  type ClassifyContext,
  classifyIncomingMessage,
  previewOf,
} from '@/services/collab/notifications/types';
import { initCollabPush, unregisterPush } from '@/services/collab/notifications/fcm';
import { currentUser, useFirebaseAuth } from '@/services/firebaseAuth';
import { useCollabNotificationsStore } from '@/state/collab/notificationsStore';

// One engine for the app lifetime; start/stop swap the uid graph internally.
let engine: CollabNotificationEngine | null = null;

function engineDeps(): EngineDeps {
  return {
    subscribeToAllSpaces: (uid, cb, onError) =>
      SpacesClient.subscribeToAllForUser(uid, cb, onError),
    subscribeToChannels: (spaceId, cb, onError) =>
      MessagingClient.subscribeToChannels(spaceId, cb, onError),
    subscribeToMessages: (spaceId, channelId, cb, onError) =>
      MessagingClient.subscribeToMessages(spaceId, channelId, cb, onError),
    onNewMessage: (message, meta) => {
      const uid = currentUser()?.uid;
      if (!uid) return;
      const store = useCollabNotificationsStore.getState();
      const ctx: ClassifyContext = {
        myUid: uid,
        level: store.prefs.level,
        mutedSpaceIds: new Set(store.prefs.mutedSpaceIds),
        mutedChannelIds: new Set(store.prefs.mutedChannelIds),
        focusedChannelId: store.focusedChannelId,
        appForegrounded: store.appForegrounded,
      };
      const result = classifyIncomingMessage(message, ctx);
      if (result.toast) {
        const n: CollabNotification = {
          id: message.id,
          type: 'message.new',
          spaceId: meta.spaceId,
          spaceName: meta.spaceName,
          channelId: meta.channelId,
          channelName: meta.channelName,
          messageId: message.id,
          authorUid: message.authorUid,
          authorName: message.authorDisplayName,
          preview: previewOf(message),
          isMention: result.isMention,
          timestamp: Date.now(),
          read: false,
        };
        store.ingest(n);
      } else if (result.track) {
        store.recordActivity(meta.channelId);
      }
    },
  };
}

/** Start collab notifications + push for a signed-in user (idempotent). */
export function startCollabRuntime(uid: string): void {
  if (!engine) engine = new CollabNotificationEngine(engineDeps());
  engine.start(uid);
  void initCollabPush();
}

/** Tear everything down on sign-out. */
export function stopCollabRuntime(): void {
  engine?.stop();
  void unregisterPush();
  useCollabNotificationsStore.getState().resetLiveState();
}

/**
 * Mount once near the app root. Drives the runtime from the shared auth snapshot:
 * signed-in → start, otherwise → stop. Cheap (no render output).
 */
export function useCollabRuntime(): void {
  const { status, user } = useFirebaseAuth();
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (status === 'signedIn' && uid) {
      startCollabRuntime(uid);
      return () => stopCollabRuntime();
    }
    return undefined;
  }, [status, uid]);
}
