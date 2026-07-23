// src/features/collab/share/ShareSheet.tsx — share a LOCAL server entity out to
// a Collab Space.
//
// The phone's "local" is the connected maestro-server. This sheet lists the
// active project's tasks and team members (from the entity store) and writes the
// chosen one into Firestore via the sharedWrite client (shareTask / shareMember),
// matching the CLI's shareShape field layout.
//
// Spells are not offered here: the entity store holds no custom-prompts map, so
// there is nothing to enumerate on the phone in v1 (share via CLI/desktop). Docs
// aren't a first-class local entity either.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { Button, Divider, IconButton, Text } from '@/components';
import { shareTask, shareMember } from '@/services/collab/client/sharedWrite';
import { currentUser } from '@/services/firebaseAuth';
import { useProjectTasks, useProjectMembers } from '@/state';
import { useUiStore } from '@/state/uiStore';
import { asProjectId } from '@/domain';
import { useTheme } from '@/theme';

export interface ShareSheetProps {
  spaceId: string;
  visible: boolean;
  onClose: () => void;
}

type ShareKind = 'task' | 'member';

export function ShareSheet({ spaceId, visible, onClose }: ShareSheetProps): React.JSX.Element {
  const theme = useTheme();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const projectId = activeProjectId ?? asProjectId('');

  const tasks = useProjectTasks(projectId);
  const members = useProjectMembers(projectId);

  const [kind, setKind] = useState<ShareKind>('task');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);

  async function handleShare(kindToShare: ShareKind, id: string) {
    const user = currentUser();
    if (!user) {
      setError('Sign in to Collab first.');
      return;
    }
    setSubmittingId(id);
    setError(null);
    try {
      if (kindToShare === 'task') {
        const task = tasks.find((t) => t.id === id);
        if (!task) throw new Error('Task not found.');
        await shareTask(user, spaceId, task);
      } else {
        const member = members.find((m) => m.id === id);
        if (!member) throw new Error('Member not found.');
        await shareMember(user, spaceId, member);
      }
      setSharedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed. Please try again.');
    } finally {
      setSubmittingId(null);
    }
  }

  function handleClose() {
    if (submittingId) return;
    setError(null);
    setSharedId(null);
    onClose();
  }

  const rows: Array<{ id: string; title: string; subtitle: string }> =
    kind === 'task'
      ? tasks.map((t) => ({ id: t.id, title: t.title, subtitle: t.status }))
      : members.map((m) => ({ id: m.id, title: m.name, subtitle: m.role }));

  const KIND_TABS: Array<{ key: ShareKind; label: string }> = [
    { key: 'task', label: 'Tasks' },
    { key: 'member', label: 'Members' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[4],
          }}
        >
          <Text variant="h1" color="ink">
            Share to space
          </Text>
          <IconButton icon="x" onPress={handleClose} accessibilityLabel="Close" size={36} iconSize={17} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[3],
            paddingBottom: theme.space[12],
            gap: theme.space[3],
          }}
        >
          {/* Kind tabs */}
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            {KIND_TABS.map((tab) => {
              const selected = tab.key === kind;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    setKind(tab.key);
                    setError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: theme.space[3],
                    paddingVertical: theme.space[2],
                    borderRadius: theme.radii.pill,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.brand : theme.colors.line2,
                    backgroundColor: selected ? theme.colors.active : theme.colors.card,
                  }}
                >
                  <Text variant="label" color={selected ? 'brand' : 'ink2'}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Divider />

          {error && (
            <Text variant="secondary" color="blockText">
              {error}
            </Text>
          )}

          {!activeProjectId ? (
            <Text variant="body" color="ink3">
              Connect to a project on the server to share its tasks and members.
            </Text>
          ) : rows.length === 0 ? (
            <Text variant="body" color="ink3">
              No {kind === 'task' ? 'tasks' : 'members'} in this project yet.
            </Text>
          ) : (
            <View style={{ gap: theme.space[1] }}>
              {rows.map((row) => {
                const isSharing = submittingId === row.id;
                const wasShared = sharedId === row.id;
                return (
                  <View
                    key={row.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.space[2],
                      paddingHorizontal: theme.space[3],
                      paddingVertical: theme.space[3],
                      borderRadius: theme.radii.sm,
                      borderWidth: 1,
                      borderColor: theme.colors.line2,
                      backgroundColor: theme.colors.card,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="body" color="ink" numberOfLines={1}>
                        {row.title}
                      </Text>
                      <Text variant="secondary" color="ink3" numberOfLines={1}>
                        {row.subtitle}
                      </Text>
                    </View>
                    {wasShared ? (
                      <Text variant="eyebrow" color="brand">
                        SHARED
                      </Text>
                    ) : (
                      <Button
                        label={isSharing ? 'Sharing…' : 'Share'}
                        variant="secondary"
                        disabled={submittingId != null}
                        onPress={() => handleShare(kind, row.id)}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
