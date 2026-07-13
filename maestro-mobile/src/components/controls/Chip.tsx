// Compact chips used in tile detail rows: `activity` (status-toned mono pill,
// `.m-actchip`), `task` (task reference, `.m-taskchip`), and `doc` (doc/diagram
// pill, `.m-docpill`, with a dashed `add` form). Optionally pressable.
import { Pressable, View, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme, type ColorToken, type IconName } from '@/theme';

import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';

export type ChipVariant = 'activity' | 'task' | 'doc';
export type ActivityTone = 'working' | 'completed' | 'needsInput' | 'failed';

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  /** activity variant tone. */
  tone?: ActivityTone;
  /** Leading line icon (activity/task). */
  icon?: IconName;
  /** Mono prefix for doc pills (e.g. "MD", "EX"). */
  ic?: string;
  /** doc variant: dashed "add" affordance. */
  add?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
}

const ACTIVITY_TONE: Record<ActivityTone, { fg: ColorToken; bg: ColorToken }> = {
  working: { fg: 'runText', bg: 'runSoft' },
  completed: { fg: 'runText', bg: 'runSoft' },
  needsInput: { fg: 'waitText', bg: 'waitSoft' },
  failed: { fg: 'blockText', bg: 'blockSoft' },
};

export function Chip({
  label,
  variant = 'task',
  tone,
  icon,
  ic,
  add = false,
  onPress,
  accessibilityHint,
}: ChipProps): React.JSX.Element {
  const theme = useTheme();
  styles.useVariants({ variant, add });

  const activity = tone ? ACTIVITY_TONE[tone] : undefined;
  const fg: ColorToken =
    variant === 'activity' ? (activity?.fg ?? 'ink3') : add ? 'ink3' : 'ink2';
  const dynamicBg: ViewStyle | undefined =
    variant === 'activity' && activity ? { backgroundColor: theme.colors[activity.bg] } : undefined;

  const content = (
    <>
      {icon && <Icon name={icon} size={variant === 'activity' ? 11 : 12} color={fg} />}
      {ic && (
        <Text variant="eyebrow" color={add ? 'brand' : 'ink4'} style={styles.docIc}>
          {ic}
        </Text>
      )}
      <Text
        variant={variant === 'activity' ? 'eyebrow' : 'secondary'}
        color={fg}
        numberOfLines={1}
        style={variant === 'activity' ? styles.actLabel : styles.label}
      >
        {label}
      </Text>
    </>
  );

  if (!onPress) {
    return <View style={[styles.chip, dynamicBg]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.chip, dynamicBg, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    variants: {
      variant: {
        activity: {
          height: 24,
          paddingHorizontal: 9,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.active,
        },
        task: {
          height: 26,
          paddingHorizontal: 9,
          borderRadius: theme.radii.pill,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.card,
          maxWidth: 200,
        },
        doc: {
          height: 26,
          paddingLeft: 7,
          paddingRight: 9,
          gap: 6,
          borderRadius: theme.radii.sm,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.card,
          maxWidth: 190,
        },
      },
      add: {
        true: { borderStyle: 'dashed' },
        false: {},
      },
    },
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  label: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: undefined,
  },
  actLabel: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 9.5,
    lineHeight: undefined,
    letterSpacing: 0.04 * 9.5,
    textTransform: 'none',
  },
  docIc: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 9,
    lineHeight: undefined,
    letterSpacing: 0,
    textTransform: 'none',
  },
}));
