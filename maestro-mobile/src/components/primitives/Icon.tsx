// Line-icon primitive over the @/theme M_ICONS path-DATA registry. Emits ONE
// <Path> with the full multi-subpath `d` (no 'M' split). Stroke cascades via the
// explicit `color` prop → <Svg color> → stroke="currentColor" on the path.
import Svg, { Path } from 'react-native-svg';

import {
  M_ICONS,
  ICON_VIEWBOX,
  ICON_STROKE_WIDTH,
  ICON_LINECAP,
  ICON_LINEJOIN,
  useTheme,
  type IconName,
  type ColorToken,
} from '@/theme';

import { resolveColor } from './resolveColor';

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Theme color token or raw color; defaults to `ink3`. */
  color?: ColorToken | (string & {});
}

export function Icon({ name, size = 16, strokeWidth = ICON_STROKE_WIDTH, color }: IconProps): React.JSX.Element {
  const theme = useTheme();
  const stroke = resolveColor(theme, color, 'ink3');
  return (
    <Svg width={size} height={size} viewBox={ICON_VIEWBOX} color={stroke}>
      <Path
        d={M_ICONS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap={ICON_LINECAP}
        strokeLinejoin={ICON_LINEJOIN}
      />
    </Svg>
  );
}
