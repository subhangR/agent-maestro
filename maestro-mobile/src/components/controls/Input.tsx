// Single-line text input (the Atelier `.m-input`). Focus paints the brass border
// + soft ring. Optional leading icon. forwardRef for focus management in editor
// sheets. Controlled by the parent (value/onChangeText).
import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme, type IconName } from '@/theme';

import { Icon } from '../primitives/Icon';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  leadingIcon?: IconName;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { leadingIcon, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.wrap,
        { borderColor: focused ? theme.colors.brand : theme.colors.line2 },
        focused && { backgroundColor: theme.colors.brandSoft },
      ]}
    >
      {leadingIcon && (
        <View style={styles.icon}>
          <Icon name={leadingIcon} size={16} color="ink4" />
        </View>
      )}
      <TextInput
        ref={ref}
        style={[styles.input, leadingIcon != null && styles.inputWithIcon]}
        placeholderTextColor={theme.colors.ink4}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.card,
  },
  icon: {
    position: 'absolute',
    left: 11,
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.uiRegular,
    fontSize: 14,
    color: theme.colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputWithIcon: {
    paddingLeft: 34,
  },
}));
