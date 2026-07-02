// MemberRow (Forge, Stream A · read-only). A roster row: emoji avatar, name,
// role + mode, an optional live-session dot/count, and a chevron. Shared by the
// Members list and Team detail. Presentational; tap navigates (caller-supplied).
import { Pressable, View } from 'react-native';

import { Icon, StatusDot, Text } from '@/components';
import { modeDisplayLabel, type TeamMember } from '@/domain';
import { useTheme } from '@/theme';

export interface MemberRowProps {
  member: TeamMember;
  /** Currently-live session count (drives the live dot). */
  liveCount?: number;
  /** Marks the team leader/coordinator. */
  leader?: boolean;
  onPress?: () => void;
}

export function MemberRow({ member, liveCount = 0, leader = false, onPress }: MemberRowProps): React.JSX.Element {
  const theme = useTheme();
  const sub = [member.role, member.mode ? modeDisplayLabel(member.mode) : null].filter(Boolean).join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Member: ${member.name}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        padding: theme.space[3],
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: pressed ? theme.colors.hover : theme.colors.card,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.active,
        }}
      >
        <Text variant="h3" allowFontScaling={false}>
          {member.avatar || '🎯'}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Text variant="title" color="ink" numberOfLines={1}>
            {member.name}
          </Text>
          {leader && (
            <Text variant="eyebrow" color="brand">
              Leader
            </Text>
          )}
        </View>
        <Text variant="secondary" color="ink3" numberOfLines={1}>
          {sub || '—'}
        </Text>
      </View>

      {liveCount > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
          <StatusDot status="run" live />
          <Text variant="mono" color="runText">
            {liveCount}
          </Text>
        </View>
      )}
      <Icon name="chevronR" size={16} color="ink4" />
    </Pressable>
  );
}
