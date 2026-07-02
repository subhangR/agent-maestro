// MembersScreen (Forge, Stream A · read-only). The project roster with live
// session counts (useMembersWithLiveCounts). Tapping a row opens member detail;
// the `+` opens the editMember sheet (body wired in Phase 3).
import { View } from 'react-native';
import { router } from 'expo-router';

import { IconButton } from '@/components';
import { asProjectId } from '@/domain';
import { fetchTeamMembers, useMembersWithLiveCounts, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { routes, sheets } from '../../../navigation';
import { Screen, StatusBlock } from '../more/kit';
import { ProjectSwitcher } from '../more/ProjectSwitcher';
import { MemberRow } from './MemberRow';

export function MembersScreen(): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const rows = useMembersWithLiveCounts(projectId ?? asProjectId(''));

  const status = (
    <StatusBlock noProject={!projectId} empty={rows.length === 0} emptyLabel="No members yet." />
  );

  return (
    <Screen
      title="Members"
      headerAccessory={<ProjectSwitcher />}
      refreshing={false}
      onRefresh={() => projectId && void fetchTeamMembers(projectId)}
      trailing={
        <IconButton
          icon="plus"
          onPress={() => sheets.open({ type: 'editMember', projectId: projectId ?? undefined })}
          accessibilityLabel="New member"
        />
      }
    >
      {rows.length > 0 ? (
        <View style={{ gap: theme.space[2] }}>
          {rows.map(({ member, liveCount }) => (
            <MemberRow
              key={member.id}
              member={member}
              liveCount={liveCount}
              onPress={() => router.push(routes.member(member.id))}
            />
          ))}
        </View>
      ) : (
        status
      )}
    </Screen>
  );
}
