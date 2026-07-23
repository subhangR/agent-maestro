// PickerSheet — the universal single/multi select that replaces every desktop
// <select>. Opened via sheets.open({ type:'picker', config }). Single-select
// auto-dismisses on pick; multi-select toggles then submits via a Done button.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text, Input, Button } from '@/components';
import { useTheme } from '@/theme';

import type { SheetBodyProps } from './types';

export function PickerSheet({ intent, sheet }: SheetBodyProps<{ type: 'picker'; config: import('./types').PickerConfig }>): React.JSX.Element {
  const theme = useTheme();
  const { title, options, selectedIds, multi, searchable, onSubmit } = intent.config;
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const onRowPress = (id: string) => {
    if (!multi) {
      onSubmit([id]);
      sheet.dismiss();
      return;
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <View style={{ padding: theme.space[4], gap: theme.space[3], minHeight: 200 }}>
      <Text variant="title" color="ink">
        {title}
      </Text>

      {searchable ? (
        <Input value={query} onChangeText={setQuery} placeholder="Search…" autoCapitalize="none" autoCorrect={false} />
      ) : null}

      <View style={{ gap: theme.space[1] }}>
        {filtered.map((o) => {
          const isSel = selected.includes(o.id);
          return (
            <Pressable
              key={o.id}
              disabled={o.disabled}
              onPress={() => onRowPress(o.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel, disabled: o.disabled }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space[2],
                paddingVertical: theme.space[2],
                paddingHorizontal: theme.space[3],
                borderRadius: theme.radii.md,
                opacity: o.disabled ? 0.4 : 1,
                backgroundColor: isSel ? theme.colors.hover : 'transparent',
              }}
            >
              {o.tone && !o.badge ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors[o.tone as keyof typeof theme.colors] ?? o.tone }} />
              ) : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" color="ink">
                  {o.label}
                </Text>
                {o.badge ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {o.tone ? (
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors[o.tone as keyof typeof theme.colors] ?? o.tone }} />
                    ) : null}
                    <Text variant="label" color="ink3">
                      {o.badge}
                    </Text>
                  </View>
                ) : null}
                {o.sublabel ? (
                  <Text variant={o.monoSublabel ? 'mono' : 'secondary'} color="ink3">
                    {o.sublabel}
                  </Text>
                ) : null}
              </View>
              {isSel ? (
                <Text variant="body" color="brand">
                  ✓
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {filtered.length === 0 ? (
          <Text variant="body" color="ink3">
            No options.
          </Text>
        ) : null}
      </View>

      {multi ? (
        <Button
          label="Done"
          variant="primary"
          fullWidth
          onPress={() => {
            onSubmit(selected);
            sheet.dismiss();
          }}
        />
      ) : null}
    </View>
  );
}
