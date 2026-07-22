// src/features/collab/notifications/NotificationToaster.tsx
//
// Lightweight top-of-screen toast for foreground Collab notifications.
// Mount once at app root (e.g. inside RootScaffold or app/_layout.tsx).
//
// Each toast auto-dismisses after TOAST_TIMEOUT_MS. Tapping it deep-links to
// the relevant Collab Space and dismisses the toast.
//
// Idioms:
//   - StyleSheet from react-native-unistyles (theme tokens).
//   - Text variant "body" + "label" from @/components.
//   - useTheme() for color tokens.
//   - Animated.Value for slide-in.

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text } from '@/components';
import { useTheme } from '@/theme';
import {
  useCollabNotificationsStore,
} from '@/state/collab/notificationsStore';
import type { CollabNotification } from '@/services/collab/notifications/types';
import { collabNotificationHeading } from '@/services/collab/notifications/types';
import { routes } from '../../../../navigation/routes';

const TOAST_TIMEOUT_MS = 5000;
const SLIDE_MS = 220;

// ── Single toast item ─────────────────────────────────────────────────────────

interface ToastItemProps {
  toast: CollabNotification;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps): React.JSX.Element {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(-80)).current;

  // Slide in on mount.
  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: SLIDE_MS,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  // Auto-dismiss.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const heading = collabNotificationHeading(toast);

  function handlePress(): void {
    onDismiss(toast.id);
    try {
      router.push(routes.space(toast.spaceId));
    } catch {
      // Navigation may not be ready.
    }
  }

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Notification: ${heading}`}
        style={[
          localStyles.toast,
          {
            backgroundColor: theme.colors.card,
            borderColor: toast.isMention ? theme.colors.brand : theme.colors.line2,
            shadowColor: theme.colors.ink,
          },
        ]}
      >
        <View style={localStyles.toastBody}>
          <Text variant="body" color="ink" numberOfLines={1} style={localStyles.heading}>
            {heading}
          </Text>
          <Text variant="secondary" color="ink3" numberOfLines={2} style={localStyles.preview}>
            {toast.preview}
          </Text>
          {toast.spaceName != null && (
            <Text variant="label" color="ink4" numberOfLines={1}>
              {toast.spaceName}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => onDismiss(toast.id)}
          hitSlop={10}
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          style={localStyles.closeBtn}
        >
          <Text variant="body" color="ink3">
            ×
          </Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// ── Toaster (container) ───────────────────────────────────────────────────────

/**
 * Mount once at app root. Renders the active toast stack near the top of the
 * screen, respecting safe-area insets.
 */
export function NotificationToaster(): React.JSX.Element | null {
  const toasts = useCollabNotificationsStore((s) => s.toasts);
  const dismissToast = useCollabNotificationsStore((s) => s.dismissToast);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={[localStyles.stack, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const localStyles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    gap: 10,
  },
  toastBody: {
    flex: 1,
    gap: 2,
  },
  heading: {
    fontWeight: '600',
  },
  preview: {
    // secondary is already smaller
  },
  closeBtn: {
    paddingLeft: 6,
    paddingTop: 1,
    alignSelf: 'flex-start',
  },
});
