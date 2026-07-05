// Resolve a color prop that may be a theme color TOKEN ('run', 'ink2', …) or an
// already-resolved raw color string, falling back to a token when undefined.
// Lets SVG/text components accept either a token (the common case) or a computed
// color from a composite tile, without a parallel hex table.
import type { Theme, ColorToken } from '@/theme';

export function resolveColor(
  theme: Theme,
  color: ColorToken | (string & {}) | undefined,
  fallback: ColorToken,
): string {
  if (color && color in theme.colors) return theme.colors[color as ColorToken];
  return color ?? theme.colors[fallback];
}
