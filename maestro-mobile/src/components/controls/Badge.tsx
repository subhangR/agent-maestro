// Inline-editable badge (the Atelier `.m-badge`): glyph/leading + label + caret,
// tapping opens a picker via `onTap`. Tones cover status / priority / model /
// override per the `.m-badge--*` matrix. Presentational — the picker is Forge/
// Compass's; Badge only emits the intent.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, statusColorToken, useTheme, type ColorToken, type GlyphKind, type Theme } from '@/theme';

import { GLYPH_STATUS_KEY } from '../primitives/statusKind';
import { Icon } from '../primitives/Icon';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Text } from '../primitives/Text';

export type BadgeVariant = 'status' | 'prio' | 'model' | 'override' | 'plain';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  /** status variant: drives the leading glyph + color bucket. */
  status?: GlyphKind;
  prio?: 'high' | 'med' | 'low';
  /** Custom leading slot (assignee avatars / agent logo). */
  leading?: ReactNode;
  /** Show the editable caret (default true). */
  caret?: boolean;
  onTap?: () => void;
  accessibilityHint?: string;
}

interface Tone {
  fg: ColorToken;
  border: ColorToken;
  bg: ColorToken;
}

const NEUTRAL_STATUS = new Set<GlyphKind>(['todo', 'idle', 'archived', 'cancelled', 'stopped']);

function statusTone(kind: GlyphKind): Tone {
  if (NEUTRAL_STATUS.has(kind)) return { fg: 'ink2', border: 'line2', bg: 'card' };
  const pair = statusColorToken[GLYPH_STATUS_KEY[kind]];
  return { fg: pair.text, border: pair.solid, bg: kind === 'needsInput' ? pair.soft : 'card' };
}

function toneFor(variant: BadgeVariant, status?: GlyphKind, prio?: 'high' | 'med' | 'low'): Tone {
  switch (variant) {
    case 'status':
      return status ? statusTone(status) : { fg: 'ink2', border: 'line2', bg: 'card' };
    case 'prio':
      if (prio === 'high') return { fg: 'blockText', border: 'block', bg: 'card' };
      if (prio === 'low') return { fg: 'ink4', border: 'line2', bg: 'card' };
      return { fg: 'ink2', border: 'line2', bg: 'card' };
    case 'model':
      return { fg: 'ink3', border: 'line2', bg: 'card' };
    case 'override':
      return { fg: 'brand', border: 'brand', bg: 'brandSoft' };
    default:
      return { fg: 'ink2', border: 'line2', bg: 'card' };
  }
}

export function Badge({
  label,
  variant = 'plain',
  status,
  prio,
  leading,
  caret = true,
  onTap,
  accessibilityHint,
}: BadgeProps): React.JSX.Element {
  const theme: Theme = useTheme();
  const tone = toneFor(variant, status, prio);
  const editable = caret && !!onTap;

  return (
    <Pressable
      onPress={onTap}
      disabled={!onTap}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? (editable ? 'Opens a picker' : undefined)}
      style={({ pressed }) => [
        styles.badge,
        { borderColor: theme.colors[tone.border], backgroundColor: theme.colors[tone.bg] },
        pressed && onTap && styles.pressed,
      ]}
    >
      {variant === 'status' && status && <StatusGlyph kind={status} size={12} />}
      {leading}
      <Text variant="label" color={tone.fg} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      {editable && <Icon name="chevronD" size={12} color="ink4" />}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: theme.radii.xs,
  },
  pressed: {
    backgroundColor: theme.colors.hover,
  },
  label: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    letterSpacing: 0.02 * 11,
    lineHeight: undefined,
  },
}));
