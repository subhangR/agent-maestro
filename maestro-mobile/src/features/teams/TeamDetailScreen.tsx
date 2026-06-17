// TeamDetailScreen (Forge, Stream A · read-only). Resolves the team's leader +
// members (live from project members) and its sub-teams. Re-fetches teams on
// mount so a deep-linked team hydrates (teams are REST-poll only).
import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Card, FieldRow, Text } from '@/components';
import { asProjectId, asTeamId } from '@/domain';
import { fetchTeams, useProjectMembers, useProjectTeams, useTeam, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { Screen, SectionLabel, StatusBlock } from '../more/kit';
import { MemberRow } from '../members';
import { TeamRow } from './TeamRow';

export function TeamDetailScreen({ id }: { id: string }): React.JSX.Element {
  const theme = useTheme();
  const team = useTeam(asTeamId(id));
  const activeProject = useUiStore((s) => s.activeProjectId);
  const pid = team?.projectId ? asProjectId(team.projectId) : activeProject ?? asProjectId('');
  const allMembers = useProjectMembers(pid);
  const allTeams = useProjectTeams(pid);

  useEffect(() => {
    if (activeProject) void fetchTeams(activeProject);
  }, [activeProject]);

  if (!team) {
    return (
      <Screen title="Team" eyebrow={`#${id}`} onBack={() => router.back()}>
        <StatusBlock empty emptyLabel="Team not found." />
      </Screen>
    );
  }

  const memberIds = new Set(team.memberIds);
  const members = allMembers.filter((m) => memberIds.has(m.id) || m.id === team.leaderId);
  const subTeams = allTeams.filter((t) => team.subTeamIds.includes(t.id));

  return (
    <Screen
      title={`${team.avatar || '👥'}  ${team.name}`}
      eyebrow={team.status === 'archived' ? 'Archived' : 'Team'}
      onBack={() => router.back()}
    >
      {team.description?.trim() ? (
        <Text variant="body" color="ink2">
          {team.description}
        </Text>
      ) : null}

      <Card padding={2}>
        <FieldRow label="Members" value={String(team.memberIds.length)} />
        <FieldRow label="Sub-teams" value={String(team.subTeamIds.length)} />
        <FieldRow label="Status" value={team.status} />
      </Card>

      <View style={{ gap: theme.space[2] }}>
        <SectionLabel label="Members" count={members.length} />
        {members.length === 0 ? (
          <Text variant="secondary" color="ink3">
            No members resolved.
          </Text>
        ) : (
          members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              leader={m.id === team.leaderId}
              onPress={() => router.push(routes.member(m.id))}
            />
          ))
        )}
      </View>

      {subTeams.length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Sub-teams" count={subTeams.length} />
          {subTeams.map((t) => (
            <TeamRow key={t.id} team={t} onPress={() => router.push(routes.team(t.id))} />
          ))}
        </View>
      )}
    </Screen>
  );
}
