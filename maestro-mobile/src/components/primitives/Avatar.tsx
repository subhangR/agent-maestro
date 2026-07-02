// Initial-bubble avatar + an overlapping group (first 3). Colors come pre-resolved
// on the AvatarData (assignee tint), so these stay pure presentational.
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from './Text';

export interface AvatarData {
  initial: string;
  /** Resolved text color. */
  color: string;
  /** Resolved background; defaults to theme `active`. */
  bg?: string;
}

export interface AvatarProps {
  data: AvatarData;
  size?: number;
}

export function Avatar({ data, size = 22 }: AvatarProps): React.JSX.Element {
  return (
    <View
      style={[styles.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: data.bg }, !data.bg && styles.avDefaultBg]}
    >
      <Text variant="label" color={data.color} allowFontScaling={false} style={[styles.initial, { fontSize: size * 0.45 }]}>
        {data.initial}
      </Text>
    </View>
  );
}

export interface AvatarGroupProps {
  list: AvatarData[];
  size?: number;
  /** Max avatars shown before truncating. */
  max?: number;
}

export function AvatarGroup({ list, size = 22, max = 3 }: AvatarGroupProps): React.JSX.Element | null {
  if (!list.length) return null;
  if (list.length === 1) return <Avatar data={list[0]!} size={size} />;
  return (
    <View style={styles.group}>
      {list.slice(0, max).map((a, i) => (
        <View key={i} style={i === 0 ? undefined : styles.overlap}>
          <View style={styles.ringed}>
            <Avatar data={a} size={size} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  av: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avDefaultBg: {
    backgroundColor: theme.colors.active,
  },
  initial: {
    letterSpacing: 0,
    lineHeight: undefined,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlap: {
    marginLeft: -7,
  },
  ringed: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
}));
