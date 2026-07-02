// app/terminal/[sessionId].tsx — full-screen terminal modal FRAME (Compass).
//
// Presented as `fullScreenModal` (registered in app/_layout). Compass owns the
// frame: the header, the close/back affordance, the modal presentation, and the
// NowPlaying→terminal + deep-link handoff. RELAY owns the body — the WebView
// xterm host, the /pty stream, the keyboard-control row, and the input field.
//
// SEAM (D-Relay-1): Relay's <TerminalView/> (xterm WebView + /pty stream) mounts
// as the body below. Compass owns only the surrounding modal frame.
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { Text, Icon } from '@/components';
import { TerminalView } from '@/terminal';
import { useTheme } from '@/theme';

export default function TerminalModal(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

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
          accessibilityLabel="Close terminal"
          hitSlop={10}
        >
          <Icon name="chevronD" size={22} color={theme.colors.paper} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" color="paper" numberOfLines={1}>
            Terminal
          </Text>
          <Text variant="eyebrow" color="ink4" numberOfLines={1}>
            session {sessionId ?? '—'}
          </Text>
        </View>
      </View>

      {/* Body — RELAY owns this. */}
      <TerminalView sessionId={sessionId} />
    </View>
  );
}
