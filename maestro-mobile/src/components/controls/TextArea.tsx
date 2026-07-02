// Multi-line text input (the Atelier `.m-textarea`). Focus paints the brass
// border + soft ring; `mono` switches to the code face. forwardRef for focus mgmt.
import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme } from '@/theme';

export interface TextAreaProps extends Omit<TextInputProps, 'style' | 'multiline'> {
  mono?: boolean;
}

export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  { mono = false, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  styles.useVariants({ mono });
  return (
    <TextInput
      ref={ref}
      multiline
      textAlignVertical="top"
      placeholderTextColor={theme.colors.ink4}
      style={[
        styles.area,
        { borderColor: focused ? theme.colors.brand : theme.colors.line2 },
        focused && { backgroundColor: theme.colors.brandSoft },
      ]}
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
  );
});

const styles = StyleSheet.create((theme) => ({
  area: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.card,
    color: theme.colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 11,
    variants: {
      mono: {
        true: { fontFamily: fontFamily.monoRegular, fontSize: 12.5, lineHeight: 19 },
        false: { fontFamily: fontFamily.uiRegular, fontSize: 14, lineHeight: 21 },
      },
    },
  },
}));
