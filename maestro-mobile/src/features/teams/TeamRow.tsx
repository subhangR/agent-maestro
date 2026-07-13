// TeamRow (Forge, Stream A · read-only). A team card: emoji avatar, name,
// description, member + sub-team counts. Shared by the Teams list and Team detail
// (sub-teams). Presentational; tap navigates.
import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import type { Team } from '@/domain';
import { useTheme } from '@/theme';

export interface TeamRowProps {
  team: Team;
  onPress?: () => void;
}

export function TeamRow({ team, onPress }: TeamRowProps): React.JSX.Element {
  const theme = useTheme();
  const counts = [
    `${team.memberIds.length} member${team.memberIds.length === 1 ? '' : 's'}`,
    team.subTeamIds.length > 0 ? `${team.subTeamIds.length} sub-team${team.subTeamIds.length === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`Team: ${team.name}`}
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
          {team.avatar || '👥'}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title" color="ink" numberOfLines={1}>
          {team.name}
        </Text>
        <Text variant="secondary" color="ink3" numberOfLines={1}>
          {team.description?.trim() || counts}
        </Text>
        {team.description?.trim() ? (
          <Text variant="mono" color="ink4" numberOfLines={1}>
            {counts}
          </Text>
        ) : null}
      </View>
      <Icon name="chevronR" size={16} color="ink4" />
    </Pressable>
  );
}
