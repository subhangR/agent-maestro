// Sheet body rows.
//
//  - `FieldRow` — a labelled row: a fixed-width label on the left, a value or
//    control slot on the right (the Atelier metadata key/value line). Either a
//    plain `value` string or an arbitrary `children` control (Badge, Toggle…).
//    Optionally pressable as a whole (tap to edit).
//  - `PickerRow` — a selectable option row for a picker sheet: optional leading
//    glyph/avatar slot + label, with a trailing check when `selected`. Single- or
//    multi-select are the caller's concern (it owns the selection state); this
//    just renders the checked state and emits `onPress`.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '../../primitives/Icon';
import { Text } from '../../primitives/Text';

// ── FieldRow ─────────────────────────────────────────────────────────────────
export interface FieldRowProps {
  label: string;
  /** Plain value text (ignored when `children` is provided). */
  value?: string;
  /** Control slot (Badge / Toggle / chips) rendered on the right. */
  children?: ReactNode;
  /** Makes the whole row tappable (e.g. to open a picker). */
  onPress?: () => void;
  accessibilityHint?: string;
}

export function FieldRow({ label, value, children, onPress, accessibilityHint }: FieldRowProps): React.JSX.Element {
  const body = (
    <>
      <Text variant="label" color="ink3" style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.fieldValue}>
        {children ?? (
          <Text variant="body" color="ink" numberOfLines={1}>
            {value ?? ''}
          </Text>
        )}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.fieldRow}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

// ── PickerRow ────────────────────────────────────────────────────────────────
export interface PickerRowProps {
  label: string;
  /** Secondary line under the label. */
  detail?: string;
  /** Leading slot (StatusGlyph / Avatar / AgentAvatar). */
  leading?: ReactNode;
  selected?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function PickerRow({
  label,
  detail,
  leading,
  selected = false,
  onPress,
  accessibilityHint,
}: PickerRowProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}
    >
      {leading != null && <View style={styles.pickerLeading}>{leading}</View>}
      <View style={styles.pickerTextCol}>
        <Text variant="body" color={selected ? 'ink' : 'ink2'} numberOfLines={1}>
          {label}
        </Text>
        {detail != null && (
          <Text variant="secondary" color="ink3" numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      {selected && <Icon name="check" size={16} color="brand" />}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    minHeight: 44,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[2],
  },
  fieldLabel: {
    width: 96,
    flexShrink: 0,
  },
  fieldValue: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.space[2],
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    minHeight: 48,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[2],
  },
  pickerLeading: {
    flexShrink: 0,
  },
  pickerTextCol: {
    flex: 1,
    gap: 1,
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
}));
