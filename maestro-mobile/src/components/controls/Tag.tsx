// Tiny uppercase mono tag (the Atelier `.m-tag`) — priority high/med/low. Static
// label, not interactive (priority reads by word, not color alone).
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme, type ColorToken } from '@/theme';

import { Text } from '../primitives/Text';

export type TagTone = 'high' | 'med' | 'low' | 'neutral';

export interface TagProps {
  label: string;
  tone?: TagTone;
}

const TONE: Record<TagTone, { fg: ColorToken; border: ColorToken }> = {
  high: { fg: 'blockText', border: 'block' },
  med: { fg: 'ink2', border: 'line2' },
  low: { fg: 'ink4', border: 'line2' },
  neutral: { fg: 'ink3', border: 'line2' },
};

export function Tag({ label, tone = 'neutral' }: TagProps): React.JSX.Element {
  const theme = useTheme();
  const t = TONE[tone];
  return (
    <View style={[styles.tag, { borderColor: theme.colors[t.border] }]}>
      <Text variant="eyebrow" color={t.fg} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: theme.radii.xs,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  label: {
    fontFamily: fontFamily.monoSemiBold,
    fontSize: 9.5,
    lineHeight: 13,
    letterSpacing: 0.05 * 9.5,
  },
}));
