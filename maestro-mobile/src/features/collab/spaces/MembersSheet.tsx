// MembersSheet — BottomSheetModal showing members of a Collab Space.
// Owner/admin: can set roles (admin/member) and remove members (not owner).
// Any member: can leave the space.
// Props: { space: CollabSpace }
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { Avatar, Button, Divider, Icon, Text } from '@/components';
import { SheetHandle, SheetHeader } from '@/components';
import type { BottomSheetHandleProps } from '@gorhom/bottom-sheet';

function HandleAdapter(_props: BottomSheetHandleProps): React.JSX.Element {
  return <SheetHandle />;
}
import { SpacesClient, type CollabSpace, type CollabSpaceMember, type MemberRole } from '@/services/collab';
import { currentUser } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';

export interface MembersSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  space: CollabSpace;
}

const SNAP_POINTS = ['85%'];

function roleLabel(role: MemberRole): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function avatarData(member: CollabSpaceMember) {
  const name = member.displayName ?? member.email ?? member.uid;
  return {
    initial: name[0]?.toUpperCase() ?? '?',
    color: '#fff',
    bg: undefined,
  };
}

function MemberRow({
  member,
  space,
  currentUid,
  canManage,
  onAction,
}: {
  member: CollabSpaceMember;
  space: CollabSpace;
  currentUid: string;
  canManage: boolean;
  onAction: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = member.role === 'owner';
  const isSelf = member.uid === currentUid;

  async function handleSetRole(role: 'admin' | 'member') {
    setBusy(true);
    setError(null);
    try {
      await SpacesClient.setMemberRole(space.id, member.uid, role);
      onAction();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    Alert.alert(
      'Remove member',
      `Remove ${member.displayName ?? member.email ?? member.uid} from this space?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await SpacesClient.removeMember(space.id, member.uid);
              onAction();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          paddingVertical: theme.space[3],
          paddingHorizontal: theme.space[4],
        }}
      >
        <Avatar data={avatarData(member)} size={32} />
        <View style={{ flex: 1 }}>
          <Text variant="body" color="ink" numberOfLines={1}>
            {member.displayName ?? member.email ?? member.uid}
            {isSelf ? ' (you)' : ''}
          </Text>
          {member.email != null && (
            <Text variant="secondary" color="ink3" numberOfLines={1}>{member.email}</Text>
          )}
        </View>

        {busy ? (
          <ActivityIndicator color={theme.colors.brand} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
            <View
              style={{
                paddingHorizontal: theme.space[2],
                paddingVertical: 2,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.colors.line2,
                backgroundColor: theme.colors.card,
              }}
            >
              <Text variant="label" color="ink3">{roleLabel(member.role)}</Text>
            </View>
            {canManage && !isOwner && !isSelf && (
              <>
                <Pressable
                  onPress={() => void handleSetRole(member.role === 'admin' ? 'member' : 'admin')}
                  accessibilityLabel={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                  style={({ pressed }) => [
                    { padding: theme.space[2], borderRadius: theme.radii.sm },
                    pressed && { backgroundColor: theme.colors.hover },
                  ]}
                >
                  <Icon name={member.role === 'admin' ? 'chevronD' : 'chevronUp'} size={16} color="ink3" />
                </Pressable>
                <Pressable
                  onPress={() => void handleRemove()}
                  accessibilityLabel="Remove member"
                  style={({ pressed }) => [
                    { padding: theme.space[2], borderRadius: theme.radii.sm },
                    pressed && { backgroundColor: theme.colors.hover },
                  ]}
                >
                  <Icon name="x" size={16} color="blockText" />
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
      {error != null && (
        <Text variant="secondary" color="blockText" style={{ paddingHorizontal: theme.space[4] }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function MembersSheet({ sheetRef, space }: MembersSheetProps): React.JSX.Element {
  const theme = useTheme();
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  // We re-read from the live space prop passed by the caller; a counter forces
  // the row list to re-render after a mutation completes.
  const [tick, setTick] = useState(0);

  const user = currentUser();
  const currentUid = user?.uid ?? '';
  const myMember = space.members[currentUid];
  const canManage = myMember?.role === 'owner' || myMember?.role === 'admin';

  const memberList = Object.values(space.members).sort((a, b) => {
    const roleOrder: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 };
    const rd = roleOrder[a.role] - roleOrder[b.role];
    if (rd !== 0) return rd;
    return (a.displayName ?? '').localeCompare(b.displayName ?? '');
  });

  function dismiss() {
    sheetRef.current?.dismiss();
  }

  async function handleLeave() {
    Alert.alert(
      'Leave space',
      `Leave "${space.name}"? You will need an invite to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeaveBusy(true);
            setLeaveError(null);
            try {
              await SpacesClient.leave(currentUid, space.id);
              dismiss();
            } catch (e) {
              setLeaveError(e instanceof Error ? e.message : String(e));
            } finally {
              setLeaveBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      handleComponent={HandleAdapter}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <SheetHeader
        title="Members"
        eyebrow={space.name}
        onClose={dismiss}
      />

      <ScrollView>
        {memberList.map((m, i) => (
          <View key={m.uid}>
            <MemberRow
              member={m}
              space={space}
              currentUid={currentUid}
              canManage={canManage}
              onAction={() => setTick((t) => t + 1)}
            />
            {i < memberList.length - 1 && <Divider />}
          </View>
        ))}

        <Divider />
        <View style={{ padding: theme.space[4], gap: theme.space[2] }}>
          {myMember?.role !== 'owner' && (
            <>
              {leaveBusy ? (
                <ActivityIndicator color={theme.colors.brand} />
              ) : (
                <Button
                  label="Leave space"
                  variant="secondary"
                  icon="arrowRight"
                  onPress={() => void handleLeave()}
                  fullWidth
                />
              )}
              {leaveError != null && (
                <Text variant="secondary" color="blockText">{leaveError}</Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}
