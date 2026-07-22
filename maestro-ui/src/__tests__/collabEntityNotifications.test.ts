import { describe, expect, it } from 'vitest';
import { notificationFromData } from '../firebase/notificationClient';
import {
  collabNotificationHeading,
  collabNotificationIcon,
} from '../notifications/collabNotificationTypes';

describe('all-entity Collab inbox decoding', () => {
  it('preserves the durable entity taxonomy and navigation target', () => {
    const notification = notificationFromData('evt_123', {
      type: 'task.shared',
      spaceId: 'space-1',
      spaceName: 'Launch',
      section: 'tasks',
      entityKind: 'task',
      entityId: 'task-1',
      entityLabel: 'Ship notifications',
      action: 'shared',
      actorUid: 'alice',
      actorName: 'Alice',
      preview: 'Shared task: Ship notifications',
      createdAt: { toMillis: () => 1234 },
      readAt: null,
    });

    expect(notification).toMatchObject({
      id: 'cn_evt_123',
      type: 'task.shared',
      spaceId: 'space-1',
      section: 'tasks',
      entityId: 'task-1',
      read: false,
    });
    expect(collabNotificationIcon(notification!)).toBe('✅');
    expect(collabNotificationHeading(notification!)).toBe('Alice · Ship notifications');
  });

  it('keeps deployed message inbox documents backward compatible', () => {
    const notification = notificationFromData('message-1', {
      type: 'message.new',
      spaceId: 'space-1',
      channelId: 'general',
      channelName: 'general',
      messageId: 'message-1',
      actorUid: 'bob',
      actorName: 'Bob',
      preview: 'Hello',
      isMention: true,
      createdAt: { toMillis: () => 1234 },
      readAt: null,
    });

    expect(notification).toMatchObject({
      id: 'cn_message-1',
      type: 'message.new',
      section: 'messages',
      channelId: 'general',
      messageId: 'message-1',
      isMention: true,
    });
  });
});
