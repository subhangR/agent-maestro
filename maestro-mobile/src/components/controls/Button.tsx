// Primary/secondary action button. Primary flips to brass on press (the Atelier
// `.m-btn--primary:active`); secondary uses the hover surface. 44px tall (a11y).
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, type IconName } from '@/theme';

import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

// Fixed dark "ink on brass" for the pressed-primary label — no theme token exists
// for it; brass is a mid-tone in BOTH themes so one dark value reads correctly on
// each. (Flagged to Bedrock: a future `onBrand` token would replace this.)
const BRASS_INK = '#20160A';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  icon?: IconName;
  fullWidth?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  fullWidth = false,
  disabled = false,
  accessibilityHint,
}: ButtonProps): React.JSX.Element {
  const isPrimary = variant === 'primary';
  styles.useVariants({ variant, fullWidth });
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn,
        pressed && (isPrimary ? styles.pressedPrimary : styles.pressed),
        disabled && styles.disabled,
      ]}
    >
      {({ pressed }) => {
        const fg = isPrimary ? (pressed ? BRASS_INK : 'paper') : 'ink';
        return (
          <View style={styles.row}>
            {icon && <Icon name={icon} size={17} color={fg} />}
            <Text variant="body" color={fg} style={styles.label}>
              {label}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  btn: {
    height: 44,
    paddingHorizontal: theme.space[4],
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.line2,
    variants: {
      variant: {
        primary: {
          backgroundColor: theme.colors.ink,
          borderColor: theme.colors.ink,
        },
        secondary: {},
      },
      fullWidth: {
        true: { alignSelf: 'stretch' },
        false: { alignSelf: 'flex-start' },
      },
    },
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  pressedPrimary: {
    backgroundColor: theme.colors.brand,
    borderColor: theme.colors.brand,
  },
  disabled: {
    opacity: 0.45,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  label: {
    fontFamily: fontFamily.uiSemiBold,
  },
}));
