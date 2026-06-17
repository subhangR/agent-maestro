import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ThemeBoot, useAppFonts } from '@/theme';

// Phase-0 placeholder root. Confirms the native dev client boots green and the
// theme + fonts resolve. Compass replaces this with the expo-router tree
// (index.ts → 'expo-router/entry'); ThemeBoot stays as the root boot wrapper.
export function RootScaffold() {
  const { loaded } = useAppFonts();
  return (
    <ThemeBoot>
      <View style={styles.center}>
        <Text style={styles.brand}>Maestro</Text>
        <Text style={styles.caption}>{loaded ? 'foundation ready' : 'loading fonts…'}</Text>
      </View>
    </ThemeBoot>
  );
}

const styles = StyleSheet.create((theme) => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.paper,
  },
  brand: {
    ...theme.type.display,
    color: theme.colors.ink,
  },
  caption: {
    ...theme.type.eyebrow,
    color: theme.colors.ink3,
    marginTop: theme.space[3],
  },
}));
