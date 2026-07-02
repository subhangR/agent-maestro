// navigation/tabBar/NowPlaying.tsx — the persistent "now playing" strip (Compass).
//
// Renders ABOVE the tab bar row (inside CustomTabBar) so it persists across tab
// switches. Shows the active live session; tapping it opens the full-screen
// terminal modal for that session. Hidden when nothing is live, and hidden on
// the More tab (the bar passes `visible`).
//
// SEAM: Compass owns the PLACEMENT, the active-session selector wiring, and the
// tap→terminal handoff. Palette owns the real visual composite (`<NowPlaying>`
// in @/components, Phase 2) — when it ships, swap the inner body below; the
// mount, selector, and onPress stay here.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { Text, StatusDot } from '@/components';
import { useTheme } from '@/theme';

import { routes } from '../routes';
import { useActiveSession } from './selectors';

export function NowPlaying({ visible }: { visible: boolean }): React.JSX.Element | null {
  const theme = useTheme();
  const session = useActiveSession();

  if (!visible || !session) return null;

  return (
    <Pressable
      onPress={() => router.push(routes.terminal(session.id))}
      accessibilityRole="button"
      accessibilityLabel={`Open terminal for ${session.name}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[2],
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[2],
        backgroundColor: pressed ? theme.colors.active : theme.colors.card,
        borderTopWidth: 1,
        borderTopColor: theme.colors.line,
      })}
    >
      <StatusDot status="run" live />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" color="ink" numberOfLines={1}>
          {session.teamMemberSnapshot?.name ?? session.name}
        </Text>
        <Text variant="eyebrow" color="ink3" numberOfLines={1}>
          {session.name}
        </Text>
      </View>
      <Text variant="eyebrow" color="brand">
        TERMINAL
      </Text>
    </Pressable>
  );
}
