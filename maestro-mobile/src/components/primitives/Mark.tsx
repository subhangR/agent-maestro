// The Maestro command mark — a chevron spawning parallel agents (›··+). Fixed
// 24×24 viewBox; all strokes/fills cascade from the `color` prop via currentColor.
import Svg, { Circle, Path } from 'react-native-svg';

import { MARK, useTheme, type ColorToken } from '@/theme';

import { resolveColor } from './resolveColor';

export interface MarkProps {
  size?: number;
  /** Theme color token or raw color; defaults to `ink`. */
  color?: ColorToken | (string & {});
}

export function Mark({ size = 22, color }: MarkProps): React.JSX.Element {
  const theme = useTheme();
  const tint = resolveColor(theme, color, 'ink');
  return (
    <Svg width={size} height={size} viewBox={MARK.viewBox} color={tint}>
      <Path
        d={MARK.chevron.d}
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK.chevron.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d={MARK.dot.d} stroke="currentColor" strokeWidth={MARK.dot.strokeWidth} strokeLinecap="round" />
      {MARK.circles.map((c, i) => (
        <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" />
      ))}
    </Svg>
  );
}
