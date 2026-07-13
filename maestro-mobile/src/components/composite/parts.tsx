// Composite-internal parts shared by the tiles. NOT exported from the barrel.
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { IconName } from '@/theme';

import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

/** Mono icon + count (the Atelier `.m-mini`) — doc / subtask counters. */
export function MiniCount({ icon, count }: { icon: IconName; count: number }): React.JSX.Element {
  return (
    <View style={styles.mini}>
      <Icon name={icon} size={12} color="ink3" />
      <Text variant="mono" color="ink3" style={styles.miniText}>
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniText: {
    fontSize: 10.5,
    lineHeight: undefined,
  },
}));
