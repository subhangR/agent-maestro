// SkillsScreen (Forge, Stream A · read-only). There is no skill REST endpoint in
// the v1 client surface, so this is a live read of the skills actually referenced
// across the project's members and tasks (deduped, with a usage count). Rendered
// inline inside More.
import { useMemo } from 'react';
import { View } from 'react-native';

import { Card, Text } from '@/components';
import { asProjectId } from '@/domain';
import { useProjectMembers, useProjectTasks, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { Screen, StatusBlock } from '../more/kit';

export function SkillsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const pid = projectId ?? asProjectId('');
  const members = useProjectMembers(pid);
  const tasks = useProjectTasks(pid);

  const skills = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
    members.forEach((m) => m.skillIds?.forEach(bump));
    tasks.forEach((t) => t.skillIds.forEach(bump));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [members, tasks]);

  const status = (
    <StatusBlock noProject={!projectId} empty={skills.length === 0} emptyLabel="No skills referenced yet." />
  );

  return (
    <Screen title="Skills" eyebrow="Referenced" onBack={onBack}>
      {status ?? (
        <View style={{ gap: theme.space[2] }}>
          {skills.map(([id, count]) => (
            <Card key={id} padding={3}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[2] }}>
                <Text variant="title" color="ink" numberOfLines={1} style={{ flex: 1 }}>
                  {id}
                </Text>
                <Text variant="mono" color="ink3">
                  {count} use{count === 1 ? '' : 's'}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
