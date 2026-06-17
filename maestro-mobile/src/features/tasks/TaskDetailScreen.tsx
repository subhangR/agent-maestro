// TaskDetailScreen (Forge, Stream A · read-only). Header + status/priority badges,
// description & initial prompt, the live subtask tree (collapsible MTaskTiles),
// and the sessions linked to this task. Navigation only — no mutations (Phase 3).
import { Fragment, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import {
  Badge,
  Card,
  FieldRow,
  MSessionTile,
  MTaskTile,
  Tag,
  Text,
} from '@/components';
import { toUiSessionStatus, type Session } from '@/domain';
import type { TaskTreeNode } from '@/state';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { Screen, SectionLabel, StatusBlock } from '../more/kit';
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (tid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(tid) ? next.delete(tid) : next.add(tid);
      return next;
    });

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
    </Screen>
  );
}
