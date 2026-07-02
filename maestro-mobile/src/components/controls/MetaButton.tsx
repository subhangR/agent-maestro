// Detail-block action button (the Atelier `.m-metabtn`): icon + label, 30px tall.
// `run` flips to ink/paper on press; `danger` reads block. Distinct from Button —
// these are the compact secondary actions inside a tile's expanded meta.
import { Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, type IconName } from '@/theme';

import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

export type MetaButtonVariant = 'normal' | 'run' | 'danger';

export interface MetaButtonProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: MetaButtonVariant;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function MetaButton({
  label,
  onPress,
  icon,
  variant = 'normal',
  disabled = false,
  accessibilityHint,
}: MetaButtonProps): React.JSX.Element {
  styles.useVariants({ variant });
  const baseFg = variant === 'danger' ? 'blockText' : 'ink2';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.btn, pressed && (variant === 'run' ? styles.pressedRun : styles.pressed), disabled && styles.disabled]}
    >
      {({ pressed }) => {
        const fg = variant === 'run' && pressed ? 'paper' : baseFg;
        return (
          <>
            {icon && <Icon name={icon} size={13} color={fg} />}
            <Text variant="label" color={fg} style={styles.label}>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    height: 30,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.line2,
    variants: {
      variant: {
        normal: { borderColor: theme.colors.line2 },
        run: { borderColor: theme.colors.line2 },
        danger: { borderColor: theme.colors.block },
      },
    },
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  pressedRun: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: fontFamily.uiSemiBold,
    fontSize: 11.5,
    lineHeight: undefined,
  },
}));
