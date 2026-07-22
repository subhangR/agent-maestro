import { useSessionStore } from '../stores/useSessionStore';
import { useMessagingStore } from '../stores/useMessagingStore';
import { useCollabNotificationsStore } from '../stores/useCollabNotificationsStore';
import { makeCollabActiveId } from '../app/types/space';
import type { CollabNotification } from './collabNotificationTypes';

/**
 * Deep-link from a toast/inbox row to the message's channel: open the collab
 * space, select the channel, and clear its unread badge. Reads stores via
 * getState() so it can be called from anywhere (toast click, desktop
 * notification click) without a React context.
 */
export function openCollabNotification(
  n: Pick<CollabNotification, 'spaceId' | 'channelId'>,
): void {
  useSessionStore.getState().setActiveId(makeCollabActiveId(n.spaceId));
  useMessagingStore.getState().selectChannel(n.spaceId, n.channelId);
  useCollabNotificationsStore.getState().markChannelRead(n.channelId);
}
