// TasksScreen (Forge, Stream A · read-only). Live open-task list grouped by
// status, each row an MTaskTile that pushes the task detail. The `+` opens the
// createTask sheet intent (body wired in Phase 3). Pull-to-refresh re-fetches.
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { IconButton, MTaskTile, type AvatarData } from '@/components';
import { asProjectId, type Task } from '@/domain';
import { useProjectMembers, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { routes, sheets } from '../../../navigation';
import { Screen, SectionLabel, StatusBlock } from '../more/kit';
import { useTasksScreen } from './useTasksScreen';

export function TasksScreen(): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const members = useProjectMembers(projectId ?? asProjectId(''));
  const { hasProject, sections, childCountOf, childrenOf, loading, refresh } = useTasksScreen();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const memberById = new Map(members.map((m) => [m.id, m]));
  const assigneesFor = (task: Task): AvatarData[] => {
    const ids = task.teamMemberIds?.length ? task.teamMemberIds : task.teamMemberId ? [task.teamMemberId] : [];
    return ids
      .map((id) => memberById.get(id))
      .filter((m): m is NonNullable<typeof m> => m != null)
      .map((m) => ({ initial: (m.name.trim()[0] ?? '?').toUpperCase(), color: theme.colors.ink2 }));
  };

  const renderNode = (task: Task): React.JSX.Element => {
    const childCount = childCountOf(task.id);
    const isExpanded = expanded.has(task.id);
    return (
      <View key={task.id} style={{ gap: theme.space[2] }}>
        <MTaskTile
          task={task}
          assignees={assigneesFor(task)}
          childCount={childCount}
          collapsed={!isExpanded}
          onToggleCollapsed={childCount > 0 ? () => toggle(task.id) : undefined}
          onPress={() => router.push(routes.task(task.id))}
          onRun={() => sheets.open({ type: 'runConfig', taskId: task.id })}
        />
        {isExpanded && childCount > 0 && (
          <View style={{ paddingLeft: theme.space[5], gap: theme.space[2] }}>
            {childrenOf(task.id).map((child) => renderNode(child))}
          </View>
        )}
      </View>
    );
  };

  const status = (
    <StatusBlock
      noProject={!hasProject}
      loading={loading && sections.length === 0}
      empty={sections.length === 0}
      emptyLabel="No open tasks."
    />
  );

  return (
    <Screen
      title="Tasks"
      eyebrow="Maestro"
      refreshing={loading}
      onRefresh={refresh}
      trailing={
        <IconButton
          icon="plus"
          onPress={() => sheets.open({ type: 'createTask', projectId: projectId ?? undefined })}
          accessibilityLabel="New task"
        />
      }
    >
      {sections.length > 0 ? (
        <View style={{ gap: theme.space[4] }}>
          {sections.map((section) => (
            <View key={section.key} style={{ gap: theme.space[2] }}>
              <SectionLabel label={section.label} count={section.tasks.length} />
              {section.tasks.map((task) => renderNode(task))}
            </View>
          ))}
        </View>
      ) : (
        status
      )}
    </Screen>
  );
}
