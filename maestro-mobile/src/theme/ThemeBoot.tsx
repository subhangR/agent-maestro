// Thin theme boot + hooks over Unistyles. ThemeBoot owns ONLY the StatusBar
// style + the root background; it sits ABOVE Compass's expo-router navigator
// (Ledger's stores mount inside). Theme registration itself lives in
// ./unistyles (imported at the app entry, before first render).
import type { ReactNode } from 'react';
import { StatusBar, View } from 'react-native';
import { UnistylesRuntime, useUnistyles } from 'react-native-unistyles';

import type { Theme } from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

/** Reactive theme read for non-StyleSheet consumers (SVG color props, the nav/
 *  terminal adapters — anything outside a StyleSheet.create callback). */
export function useTheme(): Theme {
  return useUnistyles().theme;
}

/** Current resolved theme name ('light' | 'dark'). */
export function useThemeName(): 'light' | 'dark' {
  return useUnistyles().rt.themeName ?? 'light';
}

/** Set the theme mode. Bedrock owns this; Ledger's prefsStore owns the stored
 *  value and calls this pre-paint on boot. 'system' re-enables OS following. */
export function setThemeMode(mode: ThemeMode): void {
  if (mode === 'system') {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }
  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(mode);
  // TODO(ledger): persistence is prefsStore.theme (sync MMKV). Stubbed here.
}

export function ThemeBoot({ children }: { children: ReactNode }): React.JSX.Element {
  const { theme, rt } = useUnistyles();
  const isDark = (rt.themeName ?? 'light') === 'dark';
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {children}
    </View>
  );
}
