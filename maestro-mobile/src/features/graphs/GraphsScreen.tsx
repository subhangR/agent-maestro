// GraphsScreen (Forge, Stream A). Task graphs live in the entity store (no
// dedicated REST list in the v1 client surface); this reads them reactively and
// filters to the active project. Phase 3 adds mutations: create a graph (arrives
// via its taskGraph:created WS event — no optimistic insert) and validate a
// graph (one-shot REST call whose result is shown inline). Rendered inside More.
import { useState } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge, Button, Card, Input, MetaButton, Text } from '@/components';
import type { TaskGraph } from '@/domain';
import { getMaestroClient, useEntityStore, useUiStore } from '@/state';
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

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function GraphsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const graphs = useEntityStore(
    useShallow((s) => Object.values(s.taskGraphs).filter((g) => g.projectId === projectId)),
  );

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<string, ValidationResult>>({});

  const createGraph = () => {
    const name = newName.trim();
    if (!name || !projectId) return;
    setBusy(true);
    setActionError(null);
    // No optimistic insert — the taskGraph:created WS event delivers the graph.
    getMaestroClient()
      .createTaskGraph({ projectId, name })
      .then(() => {
        setNewName('');
        setShowCreate(false);
      })
      .catch((e: unknown) =>
        setActionError(e instanceof Error ? e.message : 'Could not create the graph.'),
      )
      .finally(() => setBusy(false));
  };

  const validate = (id: string) => {
    setActionError(null);
    getMaestroClient()
      .validateTaskGraph(id)
      .then((res) => setValidations((m) => ({ ...m, [id]: { valid: res.valid, errors: res.errors } })))
      .catch((e: unknown) =>
        setActionError(e instanceof Error ? e.message : 'Could not validate the graph.'),
      );
  };

  const status = (
    <StatusBlock
      noProject={!projectId}
      empty={graphs.length === 0 && !showCreate}
      emptyLabel="No task graphs."
    />
  );

  return (
    <Screen
      title="Graphs"
      eyebrow="Task graphs"
      onBack={onBack}
      trailing={
        <MetaButton
          label={showCreate ? 'Cancel' : 'New'}
          icon={showCreate ? 'x' : 'plus'}
          onPress={() => setShowCreate((v) => !v)}
        />
      }
    >
      {showCreate && (
        <Card padding={3}>
          <View style={{ gap: theme.space[2] }}>
            <Input value={newName} onChangeText={setNewName} placeholder="Graph name" autoFocus />
            <Button
              label={busy ? 'Creating…' : 'Create graph'}
              variant="primary"
              fullWidth
              disabled={busy || newName.trim().length === 0 || !projectId}
              onPress={createGraph}
            />
          </View>
        </Card>
      )}

      {actionError != null && (
        <Text variant="secondary" color="blockText">
          {actionError}
        </Text>
      )}

      {status ?? (
        <View style={{ gap: theme.space[2] }}>
          {graphs.map((g) => {
            const v = validations[g.id];
            return (
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

                  <View style={{ flexDirection: 'row', marginTop: theme.space[1] }}>
                    <MetaButton label="Validate" icon="check" onPress={() => validate(g.id)} />
                  </View>

                  {v != null && (
                    <View style={{ gap: 2, marginTop: theme.space[1] }}>
                      <Text variant="secondary" color={v.valid ? 'runText' : 'blockText'}>
                        {v.valid ? 'Valid graph' : `Invalid — ${v.errors.length} issue${v.errors.length === 1 ? '' : 's'}`}
                      </Text>
                      {v.errors.map((err, i) => (
                        <Text key={i} variant="secondary" color="ink3">
                          • {err}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
