// A tappable header pill showing the active project; opens the project-switcher
// sheet. Placed on the tab-home headers so changing project is one tap away
// (the same switcher also lives in Settings → Workspace).
import { Pressable } from 'react-native';

import { Icon, Text } from '@/components';
import { asProjectId } from '@/domain';
import { useProject, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { sheets } from '../../../navigation';

export function ProjectSwitcher(): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const project = useProject(projectId ?? asProjectId(''));

  return (
    <Pressable
      onPress={() => sheets.open({ type: 'project' })}
      accessibilityRole="button"
      accessibilityLabel="Switch project"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: theme.space[1],
        paddingVertical: 3,
        paddingHorizontal: theme.space[2],
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.line,
      }}
    >
      <Text variant="eyebrow" color="ink3" numberOfLines={1}>
        {project?.name ?? 'Select project'}
      </Text>
      <Icon name="chevronD" size={12} color="ink3" />
    </Pressable>
  );
}
