// ListsScreen (Forge, Stream A). Task lists are a one-shot REST read (re-fetched
// on mutation + pull-to-refresh). Phase 3 adds mutations: create a list, and
// per-list add / remove / reorder its tasks (addTaskToList / removeTaskFromList /
// reorderTaskListTasks). Lists are not WS-backed, so each mutation calls the
// client then reloads the REST read. Rendered inline inside More.
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Input, MetaButton, Text } from '@/components';
import { asProjectId, type TaskList } from '@/domain';
import { getMaestroClient, useProjectTasks, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { sheets, type PickerOption } from '../../../navigation';
import { Screen, StatusBlock, useRest } from '../more/kit';

export function ListsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const allTasks = useProjectTasks(projectId ?? asProjectId(''));
  const { data, loading, error, reload } = useRest<TaskList[]>(
    () => (projectId ? getMaestroClient().getTaskLists(projectId) : Promise.resolve([])),
    [projectId],
  );
  const lists = data ?? [];

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const taskById = new Map(allTasks.map((t) => [t.id, t]));

  const run = async (op: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await op();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const createList = () => {
    const name = newName.trim();
    if (!name || !projectId) return;
    void run(() => getMaestroClient().createTaskList({ projectId, name }), 'Could not create the list.').then(
      () => {
        setNewName('');
        setShowCreate(false);
      },
    );
  };

  const addTask = (list: TaskList) => {
    const inList = new Set(list.orderedTaskIds);
    const options: PickerOption[] = allTasks
      .filter((t) => !inList.has(t.id))
      .map((t) => ({ id: t.id, label: t.title, sublabel: t.status }));
    if (options.length === 0) {
      setActionError('No more tasks to add.');
      return;
    }
    sheets.open({
      type: 'picker',
      config: {
        title: 'Add task to list',
        options,
        selectedIds: [],
        searchable: true,
        onSubmit: (ids) => {
          const tid = ids[0];
          if (tid) void run(() => getMaestroClient().addTaskToList(list.id, tid), 'Could not add the task.');
        },
      },
    });
  };

  const removeTask = (list: TaskList, taskId: string) =>
    void run(() => getMaestroClient().removeTaskFromList(list.id, taskId), 'Could not remove the task.');

  const move = (list: TaskList, index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= list.orderedTaskIds.length) return;
    const next = [...list.orderedTaskIds];
    const [a, b] = [next[index], next[target]];
    if (a == null || b == null) return;
    next[index] = b;
    next[target] = a;
    void run(() => getMaestroClient().reorderTaskListTasks(list.id, next), 'Could not reorder the list.');
  };

  const status = (
    <StatusBlock
      noProject={!projectId}
      loading={loading && lists.length === 0}
      error={error}
      empty={lists.length === 0 && !showCreate}
      emptyLabel="No task lists."
    />
  );

  return (
    <Screen
      title="Lists"
      eyebrow="Task lists"
      onBack={onBack}
      refreshing={loading}
      onRefresh={reload}
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
            <Input value={newName} onChangeText={setNewName} placeholder="List name" autoFocus />
            <Button
              label={busy ? 'Creating…' : 'Create list'}
              variant="primary"
              fullWidth
              disabled={busy || newName.trim().length === 0 || !projectId}
              onPress={createList}
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
          {lists.map((list) => {
            const open = expandedId === list.id;
            return (
              <Card key={list.id} padding={3}>
                <View style={{ gap: theme.space[2] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.space[2],
                    }}
                  >
                    <Text
                      variant="title"
                      color="ink"
                      numberOfLines={1}
                      style={{ flex: 1 }}
                      onPress={() => setExpandedId(open ? null : list.id)}
                    >
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

                  {open && (
                    <View style={{ gap: theme.space[2], marginTop: theme.space[1] }}>
                      {list.orderedTaskIds.map((tid, i) => {
                        const t = taskById.get(tid);
                        return (
                          <View
                            key={tid}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
                          >
                            <Text variant="body" color="ink2" numberOfLines={1} style={{ flex: 1 }}>
                              {t?.title ?? tid}
                            </Text>
                            <MetaButton label="↑" onPress={() => move(list, i, -1)} />
                            <MetaButton label="↓" onPress={() => move(list, i, 1)} />
                            <MetaButton
                              label="Remove"
                              variant="danger"
                              onPress={() => removeTask(list, tid)}
                            />
                          </View>
                        );
                      })}
                      <MetaButton label="Add task" icon="plus" onPress={() => addTask(list)} />
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
