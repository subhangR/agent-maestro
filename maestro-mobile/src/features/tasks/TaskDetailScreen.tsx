// TaskDetailScreen (Forge, Stream A). Header + status/priority badges,
// description & initial prompt, the live subtask tree (collapsible MTaskTiles),
// and the sessions linked to this task. Inline mutations (Phase 3): complete,
// pin/unpin, assign, edit, delete — inline edits go through optimisticEdit; the
// delete calls the client then navigates back.
import { Fragment, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';

import {
  Badge,
  Card,
  FieldRow,
  MetaButton,
  MSessionTile,
  MTaskTile,
  Tag,
  Text,
} from '@/components';
import { asProjectId, toUiSessionStatus, type DocEntry, type Session, type Task } from '@/domain';
import { getMaestroClient, useProjectMembers, type TaskTreeNode } from '@/state';
import { useTheme } from '@/theme';

import { optimisticEdit } from '../_shared';
import { routes, sheets, type PickerOption } from '../../../navigation';
import { DocRow } from '../docs';
import { Screen, SectionLabel, StatusBlock, useRest } from '../more/kit';
import { TASK_STATUS_LABEL } from './useTasksScreen';
import { useTaskDetail } from './useTaskDetail';

const PRIO_TONE = { high: 'high', medium: 'med', low: 'low' } as const;
const isLive = (s: Session): boolean => {
  const ui = toUiSessionStatus(s);
  return ui === 'working' || ui === 'run' || ui === 'wait';
};

function dueLabel(due: string | null): string {
  return due ?? '—';
}

export function TaskDetailScreen({ id }: { id: string }): React.JSX.Element {
  const theme = useTheme();
  const { task, tree, sessions, loading } = useTaskDetail(id);
  const members = useProjectMembers(asProjectId(task?.projectId ?? ''));
  const { data: taskDocs } = useRest<DocEntry[]>(() => getMaestroClient().getTaskDocs(id), [id]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const toggle = (tid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tid) ? next.delete(tid) : next.add(tid);
      return next;
    });

  // ── Inline mutations ──────────────────────────────────────────────────────
  const flag = (res: { ok: boolean; error?: unknown }, fallback: string) => {
    if (!res.ok) setActionError(res.error instanceof Error ? res.error.message : fallback);
    else setActionError(null);
  };

  const onComplete = (t: Task) =>
    void optimisticEdit('tasks', t.id, { status: 'completed' }, () =>
      getMaestroClient().updateTask(t.id, { status: 'completed' }),
    ).then((r) => flag(r, 'Could not complete the task.'));

  const onTogglePin = (t: Task) =>
    void optimisticEdit('tasks', t.id, { pinned: !t.pinned }, () =>
      getMaestroClient().updateTask(t.id, { pinned: !t.pinned }),
    ).then((r) => flag(r, 'Could not update the task.'));

  const onAssign = (t: Task) => {
    const options: PickerOption[] = [
      { id: '', label: 'Unassigned' },
      ...members.map((m) => ({ id: m.id, label: m.name, sublabel: m.role || undefined })),
    ];
    sheets.open({
      type: 'picker',
      config: {
        title: 'Assign task',
        options,
        selectedIds: t.teamMemberId ? [t.teamMemberId] : [''],
        onSubmit: (ids) => {
          const next = ids[0] ?? '';
          if (next === (t.teamMemberId ?? '')) return;
          void optimisticEdit('tasks', t.id, { teamMemberId: next || undefined }, () =>
            getMaestroClient().updateTask(t.id, { teamMemberId: next || undefined }),
          ).then((r) => flag(r, 'Could not assign the task.'));
        },
      },
    });
  };

  const onDelete = (t: Task) =>
    Alert.alert('Delete task', `Delete “${t.title}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          getMaestroClient()
            .deleteTask(t.id)
            .then(() => router.back())
            .catch((e: unknown) =>
              setActionError(e instanceof Error ? e.message : 'Could not delete the task.'),
            );
        },
      },
    ]);

  if (!task) {
    return (
      <Screen title="Task" eyebrow={`#${id}`} onBack={() => router.back()}>
        <StatusBlock loading={loading} empty={!loading} emptyLabel="Task not found." />
      </Screen>
    );
  }

  const renderRows = (node: TaskTreeNode, depth: number): React.JSX.Element[] =>
    node.children.flatMap((child) => {
      const open = expanded.has(child.task.id);
      const rows: React.JSX.Element[] = [
        <View key={child.task.id} style={{ paddingLeft: depth * theme.space[3] }}>
          <MTaskTile
            task={child.task}
            childCount={child.children.length}
            collapsed={!open}
            onToggleCollapsed={() => toggle(child.task.id)}
            onPress={() => router.push(routes.task(child.task.id))}
          />
        </View>,
      ];
      if (open && child.children.length > 0) {
        rows.push(<Fragment key={`${child.task.id}-kids`}>{renderRows(child, depth + 1)}</Fragment>);
      }
      return rows;
    });

  const childRows = tree ? renderRows(tree, 0) : [];

  return (
    <Screen title={task.title} eyebrow={`#${task.id}`} onBack={() => router.back()}>
      {/* Status / priority */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space[2] }}>
        <Badge variant="status" status={task.status} label={TASK_STATUS_LABEL[task.status]} caret={false} />
        <Tag label={task.priority} tone={PRIO_TONE[task.priority]} />
        {task.pinned && <Tag label="pinned" tone="neutral" />}
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <MetaButton
          label="Run"
          icon="play"
          onPress={() => sheets.open({ type: 'runConfig', taskId: task.id })}
        />
        {task.status !== 'completed' && (
          <MetaButton label="Complete" icon="check" variant="run" onPress={() => onComplete(task)} />
        )}
        <MetaButton
          label={task.pinned ? 'Unpin' : 'Pin'}
          icon="pin"
          onPress={() => onTogglePin(task)}
        />
        <MetaButton label="Assign" icon="users" onPress={() => onAssign(task)} />
        <MetaButton
          label="Edit"
          icon="pen"
          onPress={() => sheets.open({ type: 'createTask', taskId: task.id })}
        />
        <MetaButton label="Delete" icon="x" variant="danger" onPress={() => onDelete(task)} />
      </View>

      {actionError != null && (
        <Text variant="secondary" color="blockText">
          {actionError}
        </Text>
      )}

      {/* Meta */}
      <Card padding={2}>
        <FieldRow label="Status" value={TASK_STATUS_LABEL[task.status]} />
        <FieldRow label="Priority" value={task.priority} />
        <FieldRow label="Due" value={dueLabel(task.dueDate)} />
        <FieldRow label="Subtasks" value={String(tree?.children.length ?? 0)} />
        <FieldRow label="Sessions" value={String(task.sessionIds.length)} />
      </Card>

      {/* Description */}
      {task.description.trim().length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Description" />
          <Text variant="body" color="ink2">
            {task.description}
          </Text>
        </View>
      )}

      {/* Initial prompt */}
      {task.initialPrompt.trim().length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Initial Prompt" />
          <Card padding={3}>
            <Text variant="mono" color="ink2">
              {task.initialPrompt}
            </Text>
          </Card>
        </View>
      )}

      {/* Subtasks */}
      {childRows.length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Subtasks" count={tree?.children.length} />
          {childRows}
        </View>
      )}

      {/* Sessions */}
      {sessions.length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Sessions" count={sessions.length} />
          {sessions.map((s) => (
            <MSessionTile
              key={s.id}
              session={s}
              docCount={s.docs.length}
              live={isLive(s)}
              onPress={() => router.push(routes.session(s.id))}
            />
          ))}
        </View>
      )}

      {/* Docs */}
      {(taskDocs?.length ?? 0) > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Docs" count={taskDocs?.length} />
          <View
            style={{
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.line,
              overflow: 'hidden',
            }}
          >
            {taskDocs?.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                onPress={() => router.push(routes.docViewer(d.id, 'task', task.id))}
              />
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}
