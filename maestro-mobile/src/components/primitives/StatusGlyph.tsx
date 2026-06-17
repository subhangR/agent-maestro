// The drawn status state-machine: a GlyphKind → SVG shape switch over the @/theme
// GLYPHS data. `current` paint = the status token color (derived from kind, or a
// `color` override); named-token paints (the completed-check / needsInput knockouts
// referencing 'card'/'surface') resolve from the active theme — CSS vars don't
// exist in RN. The in_progress arc recomputes its real dash length (pathLength is
// unreliable in react-native-svg).
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  GLYPHS,
  GLYPH_VIEWBOX,
  statusColorToken,
  useTheme,
  type GlyphKind,
  type GlyphPrimitive,
  type GlyphPaint,
  type Theme,
  type ColorToken,
} from '@/theme';

import { GLYPH_STATUS_KEY } from './statusKind';
import { resolveColor } from './resolveColor';

export interface StatusGlyphProps {
  kind: GlyphKind;
  size?: number;
  /** Override the status-derived color (token or raw). */
  color?: ColorToken | (string & {});
}

function paint(theme: Theme, value: GlyphPaint | undefined, current: string): string | undefined {
  if (value == null) return undefined;
  if (value === 'none') return 'none';
  if (value === 'current') return current;
  return resolveColor(theme, value, 'ink');
}

// Scale a normalized "dash gap" dasharray (authored against pathLength) to the
// circle's REAL circumference, so the arc fills the intended fraction.
function scaleDash(dasharray: string, pathLength: number | undefined, r: number): string {
  if (!pathLength) return dasharray;
  const c = 2 * Math.PI * r;
  return dasharray
    .trim()
    .split(/\s+/)
    .map((n) => ((Number(n) / pathLength) * c).toFixed(2))
    .join(' ');
}

export function StatusGlyph({ kind, size = 16, color }: StatusGlyphProps): React.JSX.Element {
  const theme = useTheme();
  const current = color
    ? resolveColor(theme, color, 'idle')
    : theme.colors[statusColorToken[GLYPH_STATUS_KEY[kind]].solid];

  return (
    <Svg width={size} height={size} viewBox={GLYPH_VIEWBOX}>
      {GLYPHS[kind].map((p: GlyphPrimitive, i) => {
        if (p.shape === 'circle') {
          const dash = p.strokeDasharray ? scaleDash(p.strokeDasharray, p.pathLength, p.r) : undefined;
          return (
            <Circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={paint(theme, p.fill, current)}
              stroke={paint(theme, p.stroke, current)}
              strokeWidth={p.strokeWidth}
              strokeLinecap={p.strokeLinecap}
              opacity={p.opacity}
              strokeDasharray={dash}
              origin={p.rotate != null ? `${p.cx}, ${p.cy}` : undefined}
              rotation={p.rotate}
            />
          );
        }
        if (p.shape === 'rect') {
          return (
            <Rect
              key={i}
              x={p.x}
              y={p.y}
              width={p.width}
              height={p.height}
              rx={p.rx}
              fill={paint(theme, p.fill, current)}
              stroke={paint(theme, p.stroke, current)}
              strokeWidth={p.strokeWidth}
            />
          );
        }
        return (
          <Path
            key={i}
            d={p.d}
            fill={paint(theme, p.fill, current)}
            stroke={paint(theme, p.stroke, current)}
            strokeWidth={p.strokeWidth}
            strokeLinecap={p.strokeLinecap}
            strokeLinejoin={p.strokeLinejoin}
          />
        );
      })}
    </Svg>
  );
}
