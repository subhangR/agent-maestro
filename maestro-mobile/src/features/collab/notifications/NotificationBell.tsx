// src/features/collab/notifications/NotificationBell.tsx
//
// Bell icon-button with an unread badge. Tapping opens an in-app notifications
// inbox modal (BottomSheetModal). Each row taps to deep-link to the space.
//
// Idioms:
//   - IconButton('bell') from @/components.
//   - Text variants: body, secondary, label, h3 from @/components.
//   - useTheme() for color tokens.
//   - BottomSheetModal from @gorhom/bottom-sheet (already a dep of the app).
//   - StyleSheet from react-native (plain RN styles, not unistyles) so this
//     component stays portable and avoids the StyleSheet.create(theme => ...) form.

import React, { useCallback, useRef } from 'react';
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { IconButton, Text } from '@/components';
import { useTheme } from '@/theme';
import {
  useCollabNotificationsStore,
  useUnreadNotificationCount,
} from '@/state/collab/notificationsStore';
import type { CollabNotification } from '@/services/collab/notifications/types';
import {
  collabNotificationHeading,
  collabNotificationIcon,
} from '@/services/collab/notifications/types';
import { routes } from '../../../../navigation/routes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ── Inbox row ─────────────────────────────────────────────────────────────────

interface InboxRowProps {
  item: CollabNotification;
  onPress: (item: CollabNotification) => void;
}

function InboxRow({ item, onPress }: InboxRowProps): React.JSX.Element {
  const theme = useTheme();
  const heading = collabNotificationHeading(item);
  const icon = collabNotificationIcon(item);

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={heading}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.hover : item.read ? 'transparent' : theme.colors.brandSoft },
      ]}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text variant="body" color="ink" numberOfLines={1} style={styles.rowHeading}>
            {heading}
          </Text>
          <Text variant="label" color="ink4">
            {ago(item.timestamp)}
          </Text>
        </View>
        {item.channelName != null && (
          <Text variant="label" color="ink3" numberOfLines={1}>
            #{item.channelName}
          </Text>
        )}
        <Text variant="secondary" color="ink2" numberOfLines={2} style={styles.rowPreview}>
          {item.preview}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Inbox modal ───────────────────────────────────────────────────────────────

interface InboxModalProps {
  visible: boolean;
  onClose: () => void;
}

function InboxModal({ visible, onClose }: InboxModalProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const inbox = useCollabNotificationsStore((s) => s.inbox);
  const markAllRead = useCollabNotificationsStore((s) => s.markAllRead);
  const clearInbox = useCollabNotificationsStore((s) => s.clearInbox);
  const markNotificationRead = useCollabNotificationsStore(
    (s) => s.markNotificationRead,
  );
  const unread = useUnreadNotificationCount();

  const handleRowPress = useCallback(
    (item: CollabNotification) => {
      markNotificationRead(item.id);
      onClose();
      try {
        router.push(routes.space(item.spaceId));
      } catch {
        // Navigation not yet ready.
      }
    },
    [markNotificationRead, onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close notifications"
      />

      {/* Sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line2,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: theme.colors.line2 }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text variant="h3" color="ink">
            Notifications
          </Text>
          <View style={styles.headerActions}>
            {unread > 0 && (
              <Pressable
                onPress={markAllRead}
                accessibilityRole="button"
                accessibilityLabel="Mark all read"
                style={styles.headerBtn}
              >
                <Text variant="label" color="brand">
                  Mark all read
                </Text>
              </Pressable>
            )}
            {inbox.length > 0 && (
              <Pressable
                onPress={clearInbox}
                accessibilityRole="button"
                accessibilityLabel="Clear all notifications"
                style={styles.headerBtn}
              >
                <Text variant="label" color="ink3">
                  Clear
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* List */}
        {inbox.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" color="ink3">
              You're all caught up.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {inbox.map((item) => (
              <InboxRow key={item.id} item={item} onPress={handleRowPress} />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── NotificationBell ─────────────────────────────────────────────────────────

/**
 * Bell icon-button with an unread badge. Drop into a header or toolbar.
 * Opens an inline modal inbox listing recent CollabNotifications.
 */
export function NotificationBell(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const unread = useUnreadNotificationCount();

  return (
    <>
      <View style={styles.bellWrap}>
        <IconButton
          icon="bell"
          onPress={() => setOpen(true)}
          accessibilityLabel={
            unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'
          }
        />
        {unread > 0 && (
          <View style={styles.badgeDot}>
            <Text variant="label" style={[styles.badgeText, styles.badgeTextColor]}>
              {unread > 99 ? '99+' : String(unread)}
            </Text>
          </View>
        )}
      </View>

      <InboxModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Bell
  bellWrap: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  badgeTextColor: {
    color: '#FFFFFF',
  },

  // Modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: 8,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerBtn: {
    paddingVertical: 4,
  },
  list: {
    flex: 1,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowIcon: {
    fontSize: 20,
    lineHeight: 24,
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowHeading: {
    flex: 1,
    fontWeight: '600',
  },
  rowPreview: {
    // secondary variant already has correct size
  },
});
