// Unistyles v3 IS the theme registry — StyleSheet.configure registers light/dark
// once and injects the theme into StyleSheet.create((theme) => …) natively (no
// React re-render on swap). This MUST run before the first StyleSheet.create, so
// it is imported at the very top of the app entry (index.ts).
import { StyleSheet } from 'react-native-unistyles';

import { lightTheme, darkTheme } from './tokens';

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
};

type AppThemes = typeof appThemes;

// Make unistyles aware of our theme shape so StyleSheet.create((theme) => …) and
// useUnistyles().theme are fully typed against the LOCKED Theme.
declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  themes: appThemes,
  settings: {
    // Follow the OS color scheme by default. Ledger overrides pre-paint via
    // setThemeMode(prefsStore.theme) when a user pref is stored.
    adaptiveThemes: true,
  },
});
