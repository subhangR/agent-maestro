// navigation/tabBar/ConductFab.tsx — the center Conduct button (Compass).
//
// NOT a route: a Pressable in the tab bar's center pseudo-slot that fires
// `sheets.open({ type: 'command' })`. Mirrors the specimen's `m-fab` (raised,
// rounded, brand-on-press). Owns its own press affordance; the bar positions it.
import { Pressable } from 'react-native';

import { Icon } from '@/components';
import { useTheme } from '@/theme';

import { sheets } from '../sheets';

export function ConductFab(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => sheets.open({ type: 'command' })}
      accessibilityRole="button"
      accessibilityLabel="Conduct"
      hitSlop={8}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        marginTop: -8,
        borderRadius: theme.radii.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? theme.colors.brand : theme.colors.ink,
        ...theme.shadows.md,
      })}
    >
      <Icon name="plus" size={24} strokeWidth={1.8} color={theme.colors.paper} />
    </Pressable>
  );
}
