// TeamsScreen (Forge, Stream A · read-only). Teams are REST-poll only (no WS), so
// we re-fetch on screen focus and read the reactive store list (useProjectTeams).
import { useCallback } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { asProjectId } from '@/domain';
import { fetchTeams, useLoading, useProjectTeams, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { Screen, StatusBlock } from '../more/kit';
import { TeamRow } from './TeamRow';

export interface TeamsScreenProps {
  /** Rendered inside More's inline stack — supplies the back affordance. */
  onBack?: () => void;
}

export function TeamsScreen({ onBack }: TeamsScreenProps): React.JSX.Element {
  const theme = useTheme();
  const projectId = useUiStore((s) => s.activeProjectId);
  const pid = projectId ?? asProjectId('');
  const teams = useProjectTeams(pid);
  const loading = useLoading(`teams:${pid}`);

  useFocusEffect(
    useCallback(() => {
      if (projectId) void fetchTeams(projectId);
    }, [projectId]),
  );

  const status = (
    <StatusBlock
      noProject={!projectId}
      loading={loading && teams.length === 0}
      empty={teams.length === 0}
      emptyLabel="No teams yet."
    />
  );

  return (
    <Screen
      title="Teams"
      eyebrow="Ensembles"
      onBack={onBack}
      refreshing={loading}
      onRefresh={() => projectId && void fetchTeams(projectId)}
    >
      {status}{(
        <View style={{ gap: theme.space[2] }}>
          {teams.map((team) => (
            <TeamRow key={team.id} team={team} onPress={() => router.push(routes.team(team.id))} />
          ))}
        </View>
      )}
    </Screen>
  );
}
