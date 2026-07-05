// Circular context gauge (now-playing strip). Two concentric strokes: a track and
// a fill whose strokeDashoffset encodes `pct` (0–100). Geometry comes from the
// @/theme GAUGE helpers (pathLength is unreliable in react-native-svg).
import Svg, { Circle } from 'react-native-svg';

import { GAUGE, useTheme, type ColorToken } from '@/theme';

import { resolveColor } from './resolveColor';

export interface GaugeProps {
  /** Fill percentage, 0–100. */
  pct: number;
  size?: number;
  trackColor?: ColorToken | (string & {});
  fillColor?: ColorToken | (string & {});
}

export function Gauge({ pct, size = GAUGE.defaultSize, trackColor, fillColor }: GaugeProps): React.JSX.Element {
  const theme = useTheme();
  const r = GAUGE.radiusFor(size);
  const c = GAUGE.circumferenceFor(size);
  const clamped = Math.max(0, Math.min(100, pct));
  const center = size / 2;
  const track = resolveColor(theme, trackColor, 'line2');
  const fill = resolveColor(theme, fillColor, 'brand');

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={center} cy={center} r={r} fill="none" stroke={track} strokeWidth={GAUGE.strokeWidth} />
      <Circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={GAUGE.strokeWidth}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
        origin={`${center}, ${center}`}
        rotation={-90}
      />
    </Svg>
  );
}
