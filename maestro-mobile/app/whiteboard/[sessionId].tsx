// app/whiteboard/[sessionId].tsx — full-screen editable whiteboard modal FRAME (Compass).
//
// Presented as `fullScreenModal` (registered in app/_layout). Compass owns the
// frame: the header, the close/back affordance, the modal presentation. RELAY
// owns the body — the Excalidraw editor WebView and its scene↔doc round-trip.
//
// Session-scoped: the server's doc-write routes are all /sessions/:id/docs/...,
// so a whiteboard is opened against an owning session. An optional `docId` query
// param targets a specific scene doc; otherwise WhiteboardView picks the first.
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Text, Icon } from '@/components';
import { WhiteboardView } from '@/whiteboard';
import { useTheme } from '@/theme';

export default function WhiteboardModal(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { sessionId, docId } = useLocalSearchParams<{ sessionId: string; docId?: string }>();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.ink }}>
      {/* Header bar — Compass-owned frame chrome. */}
      <View
        style={{
          paddingTop: insets.top + theme.space[2],
          paddingHorizontal: theme.space[4],
          paddingBottom: theme.space[2],
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.line2,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close whiteboard"
          hitSlop={10}
        >
          <Icon name="chevronD" size={22} color={theme.colors.paper} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" color="paper" numberOfLines={1}>
            Whiteboard
          </Text>
          <Text variant="eyebrow" color="ink4" numberOfLines={1}>
            session {sessionId ?? '—'}
          </Text>
        </View>
      </View>

      {/* Body — RELAY owns this. */}
      <WhiteboardView sessionId={sessionId} docId={docId} />
    </View>
  );
}
