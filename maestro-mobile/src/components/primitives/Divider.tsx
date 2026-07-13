// Hairline divider (the Atelier 1px --pn-line rule). Horizontal or vertical.
import { StyleSheet as RNStyleSheet, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useTheme, type ColorToken } from '@/theme';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Line color token; defaults to `line`. */
  color?: ColorToken;
}

export function Divider({ orientation = 'horizontal', color = 'line' }: DividerProps): React.JSX.Element {
  const theme = useTheme();
  styles.useVariants({ orientation });
  return <View style={[styles.line, { backgroundColor: theme.colors[color] }]} />;
}

const HAIRLINE = RNStyleSheet.hairlineWidth;

const styles = StyleSheet.create(() => ({
  line: {
    variants: {
      orientation: {
        horizontal: { height: HAIRLINE, alignSelf: 'stretch' },
        vertical: { width: HAIRLINE, alignSelf: 'stretch' },
      },
    },
  },
}));
