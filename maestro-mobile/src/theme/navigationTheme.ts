// Adapter: theme → React Navigation Theme (consumed by Compass's expo-router
// ThemeProvider). Structural shape only (no @react-navigation dep here); Compass
// passes the result straight to <ThemeProvider value={…}>.
import { fontFamily } from './fonts';
import type { Theme } from './tokens';

export interface NavigationThemeColors {
  primary: string;
  background: string;
  card: string;
  text: string;
  border: string;
  notification: string;
}

export interface NavigationFontStyle {
  fontFamily: string;
  fontWeight:
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900';
}

export interface NavigationTheme {
  dark: boolean;
  colors: NavigationThemeColors;
  fonts: {
    regular: NavigationFontStyle;
    medium: NavigationFontStyle;
    bold: NavigationFontStyle;
    heavy: NavigationFontStyle;
  };
}

export function buildNavigationTheme(theme: Theme, isDark: boolean): NavigationTheme {
  return {
    dark: isDark,
    colors: {
      primary: theme.colors.brand,
      background: theme.colors.paper,
      card: theme.colors.surface,
      text: theme.colors.ink,
      border: theme.colors.line,
      notification: theme.colors.block,
    },
    fonts: {
      regular: { fontFamily: fontFamily.uiRegular, fontWeight: '400' },
      medium: { fontFamily: fontFamily.uiMedium, fontWeight: '500' },
      bold: { fontFamily: fontFamily.uiSemiBold, fontWeight: '600' },
      heavy: { fontFamily: fontFamily.uiBold, fontWeight: '700' },
    },
  };
}
