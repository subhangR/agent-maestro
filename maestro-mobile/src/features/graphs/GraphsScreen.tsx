// GraphsScreen (Forge, Stream A · read-only). Task graphs live in the entity store
// (no dedicated REST list in the v1 client surface); this reads them reactively
// and filters to the active project. Rendered inline inside More.
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge, Card, Text } from '@/components';
import type { TaskGraph } from '@/domain';
import { useEntityStore, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { Screen, StatusBlock } from '../more/kit';

const GRAPH_STATUS_TONE: Record<TaskGraph['status'], 'high' | 'med' | 'low'> = {
  draft: 'low',
  ready: 'med',
  running: 'high',
  completed: 'med',
  failed: 'high',
  paused: 'med',
};

export function GraphsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const graphs = useEntityStore(
    useShallow((s) => Object.values(s.taskGraphs).filter((g) => g.projectId === projectId)),
  );

  const status = (
    <StatusBlock noProject={!projectId} empty={graphs.length === 0} emptyLabel="No task graphs." />
  );

  return (
    <Screen title="Graphs" eyebrow="Task graphs" onBack={onBack}>
      {status ?? (
        <View style={{ gap: theme.space[2] }}>
          {graphs.map((g) => (
            <Card key={g.id} padding={3}>
              <View style={{ gap: theme.space[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
                  <Text variant="title" color="ink" numberOfLines={1} style={{ flex: 1 }}>
                    {g.name}
                  </Text>
                  <Badge variant="prio" prio={GRAPH_STATUS_TONE[g.status]} label={g.status} caret={false} />
                </View>
                <Text variant="mono" color="ink3">
                  {g.nodes.length} node{g.nodes.length === 1 ? '' : 's'}  ·  {g.edges.length} edge
                  {g.edges.length === 1 ? '' : 's'}
                </Text>
                {g.description?.trim() ? (
                  <Text variant="secondary" color="ink3" numberOfLines={2}>
                    {g.description}
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
