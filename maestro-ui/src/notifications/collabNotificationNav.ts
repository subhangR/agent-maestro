import { useSessionStore } from '../stores/useSessionStore';
import { useMessagingStore } from '../stores/useMessagingStore';
import { useCollabNotificationsStore } from '../stores/useCollabNotificationsStore';
import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import {
  markChannelNotificationsRead,
  markNotificationRead,
  writeChannelReadState,
} from '../firebase/notificationClient';
import { makeCollabActiveId } from '../app/types/space';
import type { CollabNotification } from './collabNotificationTypes';
import { useUIStore, type SpaceSection } from '../stores/useUIStore';

/**
 * Deep-link from a toast/inbox row to the message's channel: open the collab
 * space, select the channel, and clear its unread badge. Reads stores via
 * getState() so it can be called from anywhere (toast click, desktop
 * notification click) without a React context.
 */
export function openCollabNotification(
  n: Pick<CollabNotification, 'spaceId' | 'channelId'> & Partial<Pick<CollabNotification, 'id' | 'section'>>,
): void {
  useSessionStore.getState().setActiveId(makeCollabActiveId(n.spaceId));
  const section: SpaceSection = n.section ?? 'messages';
  useUIStore.getState().setSpaceActiveSection(section, n.spaceId);
  if (section === 'messages' && n.channelId) {
    useMessagingStore.getState().selectChannel(n.spaceId, n.channelId);
    useCollabNotificationsStore.getState().markChannelRead(n.channelId);
  }
  if (n.id) useCollabNotificationsStore.getState().markNotificationItemRead(n.id);
  const uid = useFirebaseAuthStore.getState().user?.uid;
  if (uid) {
    if (section === 'messages' && n.channelId) {
      void markChannelNotificationsRead(uid, n.channelId).catch(() => {});
      void writeChannelReadState(uid, n.spaceId, n.channelId).catch(() => {});
    }
    if (n.id?.startsWith('cn_')) void markNotificationRead(uid, n.id.slice(3)).catch(() => {});
  }
}
