// ProjectSheet — the project switcher (sheets.open({ type:'project' })). Lists
// every project; picking one sets the active project AND re-syncs its data so the
// tabs repopulate (Members has no on-mount fetch, so we resync explicitly).
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components';
import { asProjectId } from '@/domain';
import { useProjects, useUiStore, resyncProject, usePrefsStore } from '@/state';
import { useTheme } from '@/theme';

import type { SheetBodyProps } from './types';

export function ProjectSheet({ sheet }: SheetBodyProps<{ type: 'project' }>): React.JSX.Element {
  const theme = useTheme();
  const projects = useProjects();
  const activeId = useUiStore((s) => s.activeProjectId);
  const setActiveProject = useUiStore((s) => s.setActiveProject);

  const select = (id: string) => {
    const pid = asProjectId(id);
    setActiveProject(pid);
    usePrefsStore.getState().setLastProjectId(id); // remember across cold restart
    void resyncProject(id); // hydrate the new project's tasks/sessions/members/teams
    sheet.dismiss();
  };

  return (
    <View style={{ padding: theme.space[4], gap: theme.space[3], minHeight: 200 }}>
      <Text variant="title" color="ink">
        Switch project
      </Text>
      <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: theme.space[1] }}>
        {projects.length === 0 ? (
          <Text variant="body" color="ink3">
            No projects.
          </Text>
        ) : (
          projects.map((p) => {
            const isActive = p.id === activeId;
            return (
              <Pressable
                key={p.id}
                onPress={() => select(p.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.space[2],
                  paddingVertical: theme.space[2],
                  paddingHorizontal: theme.space[3],
                  borderRadius: theme.radii.md,
                  backgroundColor: isActive ? theme.colors.hover : 'transparent',
                }}
              >
                <Text variant="body" color="ink">
                  {p.name}
                </Text>
                {isActive ? (
                  <Text variant="body" color="brand">
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
