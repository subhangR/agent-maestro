// Toggle pill (the Atelier `.m-toggle`): safe/danger + worktree. `on` selects the
// colored tone; off is the neutral outline. `size="lg"` is the full-width form
// variant. Emits `onToggle` — controlled, no internal on-state.
import { Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme, type ColorToken, type IconName } from '@/theme';

import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

export type ToggleTone = 'danger' | 'worktree';

export interface ToggleProps {
  label: string;
  on: boolean;
  tone: ToggleTone;
  onToggle?: (next: boolean) => void;
  icon?: IconName;
  size?: 'sm' | 'lg';
  accessibilityHint?: string;
}

const ON_COLOR: Record<ToggleTone, { fg: ColorToken; border: ColorToken; bg: ColorToken }> = {
  danger: { fg: 'blockText', border: 'block', bg: 'blockSoft' },
  worktree: { fg: 'runText', border: 'run', bg: 'runSoft' },
};

export function Toggle({
  label,
  on,
  tone,
  onToggle,
  icon,
  size = 'sm',
  accessibilityHint,
}: ToggleProps): React.JSX.Element {
  const theme = useTheme();
  const onc = ON_COLOR[tone];
  const fg: ColorToken = on ? onc.fg : 'ink3';
  styles.useVariants({ size });
  return (
    <Pressable
      onPress={() => onToggle?.(!on)}
      disabled={!onToggle}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [
        styles.toggle,
        {
          borderColor: on ? theme.colors[onc.border] : theme.colors.line2,
          backgroundColor: on ? theme.colors[onc.bg] : 'transparent',
        },
        pressed && styles.pressed,
      ]}
    >
      {icon && <Icon name={icon} size={13} color={fg} />}
      <Text variant="label" color={fg} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    variants: {
      size: {
        sm: {
          height: 28,
          paddingHorizontal: 10,
          borderRadius: theme.radii.pill,
          alignSelf: 'flex-start',
        },
        lg: {
          height: 40,
          paddingHorizontal: 14,
          borderRadius: theme.radii.sm,
          alignSelf: 'stretch',
        },
      },
    },
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  label: {
    fontFamily: fontFamily.uiSemiBold,
    fontSize: 11.5,
    lineHeight: undefined,
  },
}));
