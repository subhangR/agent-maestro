// The single typography primitive: maps the Atelier `.t-*` scale to a typed
// `variant` union, resolving the per-variant default color from the active theme
// (typeColor) unless an explicit `color` token overrides it. allowFontScaling on,
// with a capped multiplier so the dense grid survives large Dynamic Type.
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typePresets, typeColor, useTheme, type TypeVariant, type ColorToken } from '@/theme';

import { resolveColor } from './resolveColor';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Theme color token or raw color; defaults to the variant's `typeColor`. */
  color?: ColorToken | (string & {});
}

export function Text({
  variant = 'body',
  color,
  style,
  maxFontSizeMultiplier = 1.3,
  ...rest
}: TextProps): React.JSX.Element {
  const theme = useTheme();
  const resolved = resolveColor(theme, color, typeColor[variant] as ColorToken);
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typePresets[variant], { color: resolved }, style]}
      {...rest}
    />
  );
}
