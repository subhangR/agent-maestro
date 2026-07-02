// Bare icon affordance (the Atelier `.m-ib`): 40px target, transparent until
// pressed (hover surface). Icon tints to `ink` on press.
import { useState } from 'react';
import { Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { IconName } from '@/theme';

import { Icon } from '../primitives/Icon';

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 40,
  iconSize = 21,
  disabled = false,
}: IconButtonProps): React.JSX.Element {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      hitSlop={size < 44 ? (44 - size) / 2 : undefined}
      style={[styles.ib, { width: size, height: size }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={iconSize} color={pressed ? 'ink' : 'ink3'} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  ib: {
    flexShrink: 0,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  disabled: {
    opacity: 0.45,
  },
}));
