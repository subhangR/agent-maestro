// navigation/TabPlaceholder.tsx — a themed placeholder body (Compass).
//
// Each route renders this so the route tree compiles and runs before Forge wires
// real feature bodies (Wave 2). It's a simple safe-area-aware themed screen
// showing the route title — no business logic, no state reads beyond theme.
// Detail routes pass a `subtitle` (e.g. the entity id) so the seam is visible.
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { useTheme } from '@/theme';

export interface TabPlaceholderProps {
  title: string;
  /** Optional second line — detail routes pass the entity id / param here. */
  subtitle?: string;
}

export function TabPlaceholder({ title, subtitle }: TabPlaceholderProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.paper,
        paddingTop: insets.top + theme.space[6],
        paddingHorizontal: theme.space[4],
        gap: theme.space[2],
      }}
    >
      <Text variant="display" color="ink">
        {title}
      </Text>
      <Text variant="eyebrow" color="ink3">
        {subtitle ?? 'Wave 2 · Forge fills this body'}
      </Text>
    </View>
  );
}
