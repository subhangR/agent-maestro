// Grabber bar for a bottom-sheet (the Atelier sheet drag handle). Purely
// decorative — the gesture is owned by Compass's sheet host; this is the visual
// pill centered at the sheet top.
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface SheetHandleProps {
  /** Override the handle bar width (default 36). */
  width?: number;
}

export function SheetHandle({ width = 36 }: SheetHandleProps): React.JSX.Element {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bar, { width }]} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.space[2],
    paddingBottom: theme.space[1],
  },
  bar: {
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.line2,
  },
}));
