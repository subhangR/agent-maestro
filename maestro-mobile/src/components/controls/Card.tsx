// Card surface (the Atelier `--pn-card` + `--pn-sh-sm`). A themed View wrapper;
// optional padding, radius and elevation. Presentational container only. Uses
// useTheme (not unistyles) so the RN shadow tokens pass through unchanged.
import { View, type ViewProps } from 'react-native';

import { useTheme, type RadiusToken, type ShadowKey, type SpaceStep } from '@/theme';

export interface CardProps extends ViewProps {
  padding?: SpaceStep;
  radius?: RadiusToken;
  elevation?: ShadowKey | 'none';
}

export function Card({
  padding = 4,
  radius = 'md',
  elevation = 'sm',
  style,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii[radius],
          padding: theme.space[padding],
        },
        elevation !== 'none' && theme.shadows[elevation],
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
