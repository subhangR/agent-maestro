// A single tappable doc row — title, a kind chip (MD / Mermaid / Excalidraw),
// and an optional creation date. Shared by the session Docs tab, the task Docs
// section, and the project docs browser so every surface reads identically.
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon, Text } from '@/components';
import type { DocEntry } from '@/domain';

import { docDateLabel, docKindLabel, resolveDocKind } from './docKind';

export function DocRow({ doc, onPress }: { doc: DocEntry; onPress: () => void }): React.JSX.Element {
  const kind = resolveDocKind(doc);
  const icon = kind === 'markdown' ? 'doc' : 'graph';
  const date = docDateLabel(doc.addedAt);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${doc.title}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Icon name={icon} size={16} color="ink3" />
      <View style={styles.col}>
        <Text variant="body" color="ink" numberOfLines={1}>
          {doc.title}
        </Text>
        {date.length > 0 && (
          <Text variant="secondary" color="ink3" numberOfLines={1}>
            {date}
          </Text>
        )}
      </View>
      <View style={styles.chip}>
        <Text variant="eyebrow" color="ink2">
          {docKindLabel(doc)}
        </Text>
      </View>
      <Icon name="chevronR" size={14} color="ink4" />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
  rowPressed: {
    backgroundColor: theme.colors.hover,
  },
  col: {
    flex: 1,
    gap: 1,
  },
  chip: {
    paddingHorizontal: theme.space[2],
    paddingVertical: 2,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
}));
