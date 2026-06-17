// ListsScreen (Forge, Stream A · read-only). Task lists are a one-shot REST read
// (re-fetched on pull-to-refresh). Rendered inline inside More.
import { View } from 'react-native';

import { Card, Text } from '@/components';
import { getMaestroClient, useUiStore } from '@/state';
import type { TaskList } from '@/domain';
import { useTheme } from '@/theme';

import { Screen, StatusBlock, useRest } from '../more/kit';

export function ListsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const { data, loading, error, reload } = useRest<TaskList[]>(
    () => (projectId ? getMaestroClient().getTaskLists(projectId) : Promise.resolve([])),
    [projectId],
  );
  const lists = data ?? [];

  const status = (
    <StatusBlock
      noProject={!projectId}
      loading={loading && lists.length === 0}
      error={error}
      empty={lists.length === 0}
      emptyLabel="No task lists."
    />
  );

  return (
    <Screen title="Lists" eyebrow="Task lists" onBack={onBack} refreshing={loading} onRefresh={reload}>
      {status ?? (
        <View style={{ gap: theme.space[2] }}>
          {lists.map((list) => (
            <Card key={list.id} padding={3}>
              <View style={{ gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[2] }}>
                  <Text variant="title" color="ink" numberOfLines={1} style={{ flex: 1 }}>
                    {list.name}
                  </Text>
                  <Text variant="mono" color="ink3">
                    {list.orderedTaskIds.length}
                  </Text>
                </View>
                {list.description?.trim() ? (
                  <Text variant="secondary" color="ink3" numberOfLines={2}>
                    {list.description}
                  </Text>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
