// Sheet title bar (the Atelier sheet header): leading title (+ optional eyebrow
// subtitle) and a trailing close affordance. Presentational — `onClose` is the
// host's dismiss intent. The body content is composed below it by the feature
// screen.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { IconButton } from '../../controls/IconButton';
import { Text } from '../../primitives/Text';

export interface SheetHeaderProps {
  title: string;
  /** Small uppercase eyebrow above the title. */
  eyebrow?: string;
  /** Custom trailing slot (replaces the default close button when set). */
  trailing?: ReactNode;
  /** Show the default close button (default true when no `trailing`). */
  onClose?: () => void;
  closeAccessibilityLabel?: string;
}

export function SheetHeader({
  title,
  eyebrow,
  trailing,
  onClose,
  closeAccessibilityLabel = 'Close',
}: SheetHeaderProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.titleCol}>
        {eyebrow != null && (
          <Text variant="eyebrow" color="ink3" numberOfLines={1}>
            {eyebrow}
          </Text>
        )}
        <Text variant="h3" color="ink" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {trailing ?? (onClose && <IconButton icon="x" onPress={onClose} accessibilityLabel={closeAccessibilityLabel} />)}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space[3],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
  titleCol: {
    flex: 1,
    gap: 3,
  },
}));
