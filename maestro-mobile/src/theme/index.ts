// PUBLIC @/theme surface — the FROZEN contract every consumer imports. Token
// names, the Theme type, type-preset keys, useTheme shape and the SVG data are
// stable from this first deliverable. Downstream teams (Palette, Compass, Relay,
// Ledger) code against exactly these exports.

// Tokens + Theme types (the locked shape)
export {
  lightTheme,
  darkTheme,
  type Theme,
  type ThemeColors,
  type ColorToken,
  type SpaceStep,
  type RadiusToken,
  type ShadowKey,
} from './tokens';

// Typography presets + per-variant default color map
export { typePresets, typeColor, type TypeVariant } from './typography';

// Fonts (offline-embedded; per-weight family names + dev gate)
export { fontFamily, useAppFonts, type FontFamilyKey } from './fonts';

// Boot + theme hooks (over Unistyles)
export { ThemeBoot, useTheme, useThemeName, setThemeMode, type ThemeMode } from './ThemeBoot';

// Adapters for consumers with their own theme format
export {
  buildNavigationTheme,
  type NavigationTheme,
  type NavigationThemeColors,
  type NavigationFontStyle,
} from './navigationTheme';
export { buildTerminalTheme, type XtermTheme } from './terminalTheme';

// SVG path-DATA registry + status→token color map (Palette authors the components)
export * from './svg';
