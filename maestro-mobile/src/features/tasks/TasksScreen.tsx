// TasksScreen (Forge, Stream A · read-only). Live open-task list grouped by
// status, each row an MTaskTile that pushes the task detail. The `+` opens the
// createTask sheet intent (body wired in Phase 3). Pull-to-refresh re-fetches.
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
  const { hasProject, sections, childCountOf, loading, refresh } = useTasksScreen();

  const memberById = new Map(members.map((m) => [m.id, m]));
  const assigneesFor = (task: Task): AvatarData[] => {
    const ids = task.teamMemberIds?.length ? task.teamMemberIds : task.teamMemberId ? [task.teamMemberId] : [];
    return ids
      .map((id) => memberById.get(id))
      .filter((m): m is NonNullable<typeof m> => m != null)
      .map((m) => ({ initial: (m.name.trim()[0] ?? '?').toUpperCase(), color: theme.colors.ink2 }));
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
              {section.tasks.map((task) => (
                <MTaskTile
                  key={task.id}
                  task={task}
                  assignees={assigneesFor(task)}
                  childCount={childCountOf(task.id)}
                  onPress={() => router.push(routes.task(task.id))}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
        status
      )}
    </Screen>
  );
}
