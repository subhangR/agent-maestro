// DocListScreen — the project-wide docs browser (a More-tab leaf). Lists every
// doc across the active project (GET /projects/:id/docs, content hydrated),
// grouped by the owning entity (task / session) with a name header, filterable
// by a title search box and a kind chip row. Taps push the full-screen viewer.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';

import { Input, Text } from '@/components';
import { getMaestroClient, useProjectSessions, useProjectTasks, useUiStore } from '@/state';
import { asProjectId, type DocEntry } from '@/domain';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { Screen, SectionLabel, StatusBlock, useRest } from '../more/kit';
import { DocRow } from './DocRow';
import { resolveDocKind, type DocFilterKind } from './docKind';

const KIND_FILTERS: { key: DocFilterKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'markdown', label: 'Markdown' },
  { key: 'mermaid', label: 'Mermaid' },
  { key: 'excalidraw', label: 'Excalidraw' },
];

interface DocGroup {
  key: string;
  label: string;
  docs: DocEntry[];
}

export function DocListScreen({ onBack }: { onBack: () => void }): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const tasks = useProjectTasks(asProjectId(projectId ?? ''));
  const sessions = useProjectSessions(asProjectId(projectId ?? ''));

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<DocFilterKind | 'all'>('all');

  const { data, loading, error, reload } = useRest<DocEntry[]>(
    () => (projectId ? getMaestroClient().getProjectDocs(projectId) : Promise.resolve([])),
    [projectId],
  );

  // Entity id → display name (for the group headers).
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) m.set(`task:${t.id}`, t.title);
    for (const s of sessions) m.set(`session:${s.id}`, s.name);
    return m;
  }, [tasks, sessions]);

  const groups = useMemo(() => buildGroups(data ?? [], query, kind, names), [data, query, kind, names]);

  const status = (
    <StatusBlock
      noProject={!projectId}
      loading={loading}
      error={error}
      empty={(data?.length ?? 0) === 0}
      emptyLabel="No documents in this project yet."
    />
  );

  return (
    <Screen title="Docs" eyebrow="Project" onBack={onBack} onRefresh={reload} refreshing={loading}>
      {projectId != null && (data?.length ?? 0) > 0 && (
        <View style={{ gap: theme.space[3] }}>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search documents…"
            leadingIcon="search"
            returnKeyType="search"
          />
          <View style={styles.chipRow}>
            {KIND_FILTERS.map((f) => {
              const active = f.key === kind;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setKind(f.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text variant="label" color={active ? 'ink' : 'ink3'}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {status ??
        (groups.length === 0 ? (
          <StatusBlock empty emptyLabel="No documents match your filters." />
        ) : (
          groups.map((g) => (
            <View key={g.key} style={{ gap: theme.space[2] }}>
              <SectionLabel label={g.label} count={g.docs.length} />
              <View style={styles.card}>
                {g.docs.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    onPress={() =>
                      projectId != null && router.push(routes.docViewer(d.id, 'project', projectId))
                    }
                  />
                ))}
              </View>
            </View>
          ))
        ))}
    </Screen>
  );
}

/** Filter by search + kind, then bucket by owning entity (task → session → other). */
function buildGroups(
  docs: DocEntry[],
  query: string,
  kind: DocFilterKind | 'all',
  names: Map<string, string>,
): DocGroup[] {
  const q = query.trim().toLowerCase();
  const filtered = docs.filter((d) => {
    if (q && !d.title.toLowerCase().includes(q)) return false;
    if (kind !== 'all' && resolveDocKind(d) !== kind) return false;
    return true;
  });

  const buckets = new Map<string, DocEntry[]>();
  const order: string[] = [];
  for (const d of filtered) {
    const key = d.taskId ? `task:${d.taskId}` : d.addedBy ? `session:${d.addedBy}` : 'other';
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)?.push(d);
  }

  return order.map((key) => {
    const kindPrefix = key.startsWith('task:') ? 'Task' : key.startsWith('session:') ? 'Session' : '';
    const name = names.get(key);
    const label = name != null ? `${kindPrefix} · ${name}` : kindPrefix || 'Other';
    return { key, label, docs: buckets.get(key) ?? [] };
  });
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space[2],
  },
  chip: {
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[2],
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  chipActive: {
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.brandSoft,
  },
}));
