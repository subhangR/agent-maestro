// .t-* type scale → RN TextStyle presets.
//
// Three CSS→RN conversions are done ONCE here (never ad hoc downstream):
//   1. weight → per-weight fontFamily   (RN/Android won't synth-bold custom fonts)
//   2. letterSpacing em → px            (px = em * fontSize)
//   3. lineHeight multiplier → px       (px = round(fontSize * multiplier))
//
// Color is deliberately NOT baked in (the CSS bakes `color:var(--pn-ink-2)` into
// .t-body). In RN, color is applied at render from the theme so presets stay
// mode-invariant. The default color PER VARIANT is published as `typeColor`
// (token-name lookup) for Palette's <Text variant> to wire the right default.
import type { TextStyle } from 'react-native';

import { fontFamily as ff } from './fonts';

// lineHeight multipliers (CSS): tight 1.18, snug 1.35, body 1.5
// letterSpacing (CSS em): mega 0.12, label 0.06, tight -0.01
export const typePresets = {
  display: {
    fontFamily: ff.serifMedium,
    fontSize: 40,
    lineHeight: 47, // 40 * 1.18
    letterSpacing: 0,
  },
  h1: {
    fontFamily: ff.serifMedium,
    fontSize: 28,
    lineHeight: 33, // 28 * 1.18
  },
  h2: {
    fontFamily: ff.uiSemiBold,
    fontSize: 22,
    lineHeight: 30, // 22 * 1.35
    letterSpacing: -0.22, // -0.01em * 22
  },
  h3: {
    fontFamily: ff.uiSemiBold,
    fontSize: 18,
    lineHeight: 24, // 18 * 1.35
    letterSpacing: -0.18,
  },
  title: {
    fontFamily: ff.uiSemiBold,
    fontSize: 15,
    lineHeight: 20, // 15 * 1.35
    letterSpacing: -0.15,
  },
  body: {
    fontFamily: ff.uiRegular,
    fontSize: 14,
    lineHeight: 21, // 14 * 1.5
  },
  secondary: {
    fontFamily: ff.uiRegular,
    fontSize: 13,
    lineHeight: 20, // 13 * 1.5 = 19.5 → 20
  },
  label: {
    fontFamily: ff.uiMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  eyebrow: {
    fontFamily: ff.monoSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.32, // 0.12em * 11
    textTransform: 'uppercase',
  },
  quote: {
    fontFamily: ff.serifItalic,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 26, // 18 * 1.45
  },
  mono: {
    fontFamily: ff.monoRegular,
    fontSize: 12.5,
    lineHeight: 19, // 12.5 * 1.5 = 18.75 → 19
  },
  code: {
    fontFamily: ff.monoMedium,
    fontSize: 12.5,
    lineHeight: 19,
  },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typePresets;

// Default color PER VARIANT, as a colors-token name (NOT a hex — resolved from
// the active theme at render). Mirrors the `color:` each .t-* class bakes in.
// Boundary contract: Palette's <Text variant> reads this for the default color.
export const typeColor = {
  display: 'ink',
  h1: 'ink',
  h2: 'ink',
  h3: 'ink',
  title: 'ink',
  body: 'ink2',
  secondary: 'ink3',
  label: 'ink3',
  eyebrow: 'ink3',
  quote: 'ink2',
  mono: 'ink2',
  code: 'brand',
} as const satisfies Record<TypeVariant, string>;
