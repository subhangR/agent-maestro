// The --pn-* token system ported to a typed JS theme. lightTheme/darkTheme are
// two objects of IDENTICAL shape; only colors + shadows diverge (geometry,
// fonts, type and motion are mode-invariant — exactly the CSS's discipline of
// overriding only variable VALUES under html[data-theme="dark"]).
//
// ⚠️ The token KEY NAMES below are the FROZEN @/theme contract (Palette §7.1):
// plural `colors`/`shadows`/`fonts`, flat `motion`, `space[n]`, `radii.*`,
// `type` presets. Do not rename — every consumer keys off these names.
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { fontFamily } from './fonts';
import { typePresets } from './typography';

// ── 1 · COLOR ──────────────────────────────────────────────────────────────
// The only place light/dark diverge. Keys locked to Palette's enumeration.
const lightColors = {
  paper: '#F4F2EC',
  surface: '#FBFAF6',
  card: '#FFFFFF',
  hover: '#F2EFE8',
  active: '#ECE8DF',
  line: '#E7E3D9',
  line2: '#D8D3C6',
  ink: '#23201B',
  ink2: '#5B564C',
  ink3: '#8E897B',
  ink4: '#B7B2A4',
  brand: '#B26A2B',
  brand2: '#9A581F',
  brandSoft: 'rgba(178, 106, 43, 0.11)',
  run: '#3E8E5A',
  runSoft: 'rgba(62, 142, 90, 0.12)',
  wait: '#BD8A2A',
  waitSoft: 'rgba(189, 138, 42, 0.14)',
  block: '#BB4D3D',
  blockSoft: 'rgba(187, 77, 61, 0.12)',
  info: '#3F6C90',
  infoSoft: 'rgba(63, 108, 144, 0.12)',
  idle: '#A29C8E',
  idleSoft: 'rgba(162, 156, 142, 0.16)',
} as const;

// Keys are locked to lightColors; values are plain strings so the two ramps can
// hold different hexes while sharing one shape.
export type ThemeColors = { readonly [K in keyof typeof lightColors]: string };

// Same shape, warm-graphite inversion (the html[data-theme="dark"] block).
const darkColors: ThemeColors = {
  paper: '#15130E',
  surface: '#1B1810',
  card: '#221E15',
  hover: '#262117',
  active: '#302A1D',
  line: '#2C2719',
  line2: '#3B3524',
  ink: '#EFE9DB',
  ink2: '#BDB5A2',
  ink3: '#8C8470',
  ink4: '#665E4C',
  brand: '#E0A45A',
  brand2: '#C98A3E',
  brandSoft: 'rgba(224, 164, 90, 0.15)',
  run: '#5CB381',
  runSoft: 'rgba(92, 179, 129, 0.17)',
  wait: '#D9AA49',
  waitSoft: 'rgba(217, 170, 73, 0.18)',
  block: '#DA7D6A',
  blockSoft: 'rgba(218, 125, 106, 0.17)',
  info: '#6F9FC7',
  infoSoft: 'rgba(111, 159, 199, 0.17)',
  idle: '#7A7360',
  idleSoft: 'rgba(122, 115, 96, 0.20)',
} as const;

// ── 5 · SPACING (4px grid, indexed by step number) ──────────────────────────
const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ── 6 · RADII ────────────────────────────────────────────────────────────────
const radii = {
  xs: 5,
  sm: 7,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

// ── 4 · FONT FAMILIES (base weight per family; per-weight names in fonts.ts) ──
const fonts = {
  serif: fontFamily.serifRegular,
  ui: fontFamily.uiRegular,
  mono: fontFamily.monoRegular,
} as const;

// ── 8 · MOTION (FLAT — durations in ms, eases as bezier arg arrays) ──────────
// Consumed at the call site via Easing.bezier(...) / Reanimated — kept as data.
const motion = {
  easeOut: [0.16, 1, 0.3, 1],
  easeStd: [0.4, 0, 0.2, 1],
  durFast: 120,
  durBase: 180,
  durSlow: 280,
} as const;

// ── 7 · ELEVATION ────────────────────────────────────────────────────────────
// CSS box-shadow has no single RN equivalent: iOS uses shadow*; Android uses
// elevation; web gets boxShadow. The CSS --pn-sh-md is two-layer — RN iOS does
// one, so we approximate with the larger/softer layer (documented fidelity gap;
// these are subtle warm drops). Android elevations kept low (1/4/12).
type ShadowToken = ViewStyle;
type ShadowTokens = { sm: ShadowToken; md: ShadowToken; pop: ShadowToken };

const lightShadows: ShadowTokens = {
  sm: Platform.select({
    ios: { shadowColor: '#282218', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    android: { elevation: 1, shadowColor: '#282218' },
    default: { boxShadow: '0 1px 2px rgba(40, 34, 24, 0.05)' },
  }) as ShadowToken,
  md: Platform.select({
    ios: { shadowColor: '#282218', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 4, shadowColor: '#282218' },
    default: { boxShadow: '0 2px 6px rgba(40,34,24,0.06), 0 8px 24px rgba(40,34,24,0.06)' },
  }) as ShadowToken,
  pop: Platform.select({
    ios: { shadowColor: '#282218', shadowOpacity: 0.14, shadowRadius: 17, shadowOffset: { width: 0, height: 12 } },
    android: { elevation: 12, shadowColor: '#282218' },
    default: { boxShadow: '0 12px 34px rgba(40,34,24,0.14)' },
  }) as ShadowToken,
};

const darkShadows: ShadowTokens = {
  sm: Platform.select({
    ios: { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
    android: { elevation: 1, shadowColor: '#000000' },
    default: { boxShadow: '0 1px 2px rgba(0,0,0,0.45)' },
  }) as ShadowToken,
  md: Platform.select({
    ios: { shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 4, shadowColor: '#000000' },
    default: { boxShadow: '0 2px 8px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.4)' },
  }) as ShadowToken,
  pop: Platform.select({
    ios: { shadowColor: '#000000', shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 16 } },
    android: { elevation: 12, shadowColor: '#000000' },
    default: { boxShadow: '0 16px 44px rgba(0,0,0,0.6)' },
  }) as ShadowToken,
};

// ── THEME SHAPE (LOCKED) ─────────────────────────────────────────────────────
export interface Theme {
  colors: ThemeColors;
  space: typeof space;
  radii: typeof radii;
  shadows: ShadowTokens;
  fonts: typeof fonts;
  type: typeof typePresets;
  motion: typeof motion;
}

export type ColorToken = keyof ThemeColors;
export type SpaceStep = keyof Theme['space'];
export type RadiusToken = keyof Theme['radii'];
export type ShadowKey = keyof ShadowTokens;
export type { TextStyle };

export const lightTheme: Theme = {
  colors: lightColors,
  space,
  radii,
  shadows: lightShadows,
  fonts,
  type: typePresets,
  motion,
};

export const darkTheme: Theme = {
  ...lightTheme,
  colors: darkColors,
  shadows: darkShadows,
};
