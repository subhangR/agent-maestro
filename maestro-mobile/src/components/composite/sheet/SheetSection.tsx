// Labelled section inside a sheet body (the Atelier `.m-metasec`): an uppercase
// eyebrow label over a content slot. Generic container — the feature screen drops
// rows / chips / controls inside it.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '../../primitives/Text';

export interface SheetSectionProps {
  /** Uppercase eyebrow label; omit for an unlabelled group. */
  label?: string;
  children: ReactNode;
}

export function SheetSection({ label, children }: SheetSectionProps): React.JSX.Element {
  return (
    <View style={styles.section}>
      {label != null && (
        <Text variant="eyebrow" color="ink3" style={styles.label}>
          {label}
        </Text>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    gap: theme.space[2],
  },
  label: {
    marginBottom: 2,
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
}));
