// NowPlaying — the compact live-session strip (the Atelier `.m-np`) mounted in the
// shell chrome above the tab bar. Always-dark surface: agent avatar + session name
// + a mono "say" activity line + a live ping dot + a context Gauge + a chevron-up.
// The whole strip is Pressable (opens the terminal). Renders nothing when there is
// no active session.
//
// Data in, intents out. Colors come from theme tokens; the strip's fixed dark
// chrome reads the same `card`/`ink` ramp the design uses — no hardcoded hex.
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { toDisplayTool, type Session } from '@/domain';
import { useTheme } from '@/theme';

import { AgentAvatar } from '../primitives/AgentAvatar';
import { Gauge } from '../primitives/Gauge';
import { Icon } from '../primitives/Icon';
import { StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';

export interface NowPlayingProps {
  /** The active session, or null to render nothing. */
  session: Session | null;
  /** The mono "say" activity line (latest agent output). */
  say?: string;
  /** Context-window fill percentage (0–100) for the gauge. */
  contextPct?: number;
  /** Whether to animate the live ping dot (default true). */
  live?: boolean;
  /** Tap the strip — opens the terminal. */
  onPress?: () => void;
}

export function NowPlaying({
  session,
  say,
  contextPct,
  live = true,
  onPress,
}: NowPlayingProps): React.JSX.Element | null {
  const theme = useTheme();
  if (!session) return null;
  const displayTool = toDisplayTool(session.teamMemberSnapshot?.agentTool ?? null);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Now playing: ${session.name}`}
      accessibilityHint="Opens the terminal"
      style={({ pressed }) => [styles.strip, theme.shadows.md, pressed && styles.pressed]}
    >
      <AgentAvatar kind={displayTool} size={30} />
      <View style={styles.body}>
        <Text variant="title" color="ink" numberOfLines={1}>
          {session.name}
        </Text>
        {say != null && (
          <Text variant="mono" color="ink3" numberOfLines={1} style={styles.say}>
            {say}
          </Text>
        )}
      </View>
      <StatusDot status="run" live={live} />
      {contextPct != null && <Gauge pct={contextPct} />}
      <Icon name="chevronUp" size={18} color="ink3" />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    marginHorizontal: theme.space[3],
    marginBottom: theme.space[2],
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[3],
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  say: {
    fontSize: 10.5,
    lineHeight: undefined,
  },
}));
