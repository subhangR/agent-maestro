// MemberDetailScreen (Forge, Stream A · read-only). The member's persona + launch
// config, their remembered notes, and the sessions they currently own (filtered
// live from the project sessions). Navigation only.
import { View } from 'react-native';
import { router } from 'expo-router';

import { Badge, Card, FieldRow, MSessionTile, Text } from '@/components';
import {
  asProjectId,
  asTeamMemberId,
  displayToolLabel,
  modeDisplayLabel,
  toUiSessionStatus,
  type Session,
} from '@/domain';
import { useProjectSessions, useTeamMember, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { Screen, SectionLabel, StatusBlock } from '../more/kit';

const ownsSession = (memberId: string, s: Session): boolean =>
  s.teamMemberId === memberId || (s.teamMemberIds?.includes(memberId) ?? false);

const isLive = (s: Session): boolean => {
  const ui = toUiSessionStatus(s);
  return ui === 'working' || ui === 'run' || ui === 'wait';
};

export function MemberDetailScreen({ id }: { id: string }): React.JSX.Element {
  const theme = useTheme();
  const member = useTeamMember(asTeamMemberId(id));
  const activeProject = useUiStore((s) => s.activeProjectId);
  const sessions = useProjectSessions(member?.projectId ? asProjectId(member.projectId) : activeProject ?? asProjectId(''));
  const ownSessions = sessions.filter((s) => ownsSession(id, s));

  if (!member) {
    return (
      <Screen title="Member" eyebrow={`#${id}`} onBack={() => router.back()}>
        <StatusBlock empty emptyLabel="Member not found." />
      </Screen>
    );
  }

  return (
    <Screen title={`${member.avatar || '🎯'}  ${member.name}`} eyebrow={member.role || 'Member'} onBack={() => router.back()}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {member.mode && <Badge variant="plain" label={modeDisplayLabel(member.mode)} caret={false} />}
        <Badge variant="model" label={displayToolLabel(member.agentTool)} caret={false} />
        <Badge variant="plain" label={member.status} caret={false} />
        {member.scope === 'global' && <Badge variant="override" label="global" caret={false} />}
      </View>

      <Card padding={2}>
        <FieldRow label="Role" value={member.role || '—'} />
        <FieldRow label="Mode" value={member.mode ? modeDisplayLabel(member.mode) : '—'} />
        <FieldRow label="Tool" value={displayToolLabel(member.agentTool)} />
        <FieldRow label="Model" value={member.model || member.modelProfileId || '—'} />
        <FieldRow label="Permission" value={member.permissionMode || '—'} />
        <FieldRow label="Skills" value={String(member.skillIds?.length ?? 0)} />
      </Card>

      {member.identity && member.identity.trim().length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Identity" />
          <Card padding={3}>
            <Text variant="body" color="ink2">
              {member.identity}
            </Text>
          </Card>
        </View>
      )}

      {member.memory && member.memory.length > 0 && (
        <View style={{ gap: theme.space[2] }}>
          <SectionLabel label="Memory" count={member.memory.length} />
          {member.memory.map((entry, i) => (
            <Card key={i} padding={3}>
              <Text variant="secondary" color="ink2">
                {entry}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <View style={{ gap: theme.space[2] }}>
        <SectionLabel label="Sessions" count={ownSessions.length} />
        {ownSessions.length === 0 ? (
          <Text variant="secondary" color="ink3">
            No active sessions.
          </Text>
        ) : (
          ownSessions.map((s) => (
            <MSessionTile
              key={s.id}
              session={s}
              docCount={s.docs.length}
              live={isLive(s)}
              onPress={() => router.push(routes.session(s.id))}
            />
          ))
        )}
      </View>
    </Screen>
  );
}
