// src/features/collab/SpacesHome.tsx — the signed-in Collab Spaces home.
// Subscribes to the user's spaces on mount, groups by repo, shows per-repo
// section headers + space rows. Header trailing: + (CreateSpaceSheet) and
// sign-out. JoinPrivateCard at top; Discover entry below.
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { Avatar, Divider, Icon, IconButton, Text } from '@/components';
import { useFirebaseAuth } from '@/services/firebaseAuth';
import { type CollabSpace } from '@/services/collab';
import { useTheme } from '@/theme';
import { router } from 'expo-router';

import { routes } from '../../../navigation/routes';
import { startSpacesSubscription, stopSpacesSubscription, useSpacesStore } from '../../state/collab/spacesStore';
import { Screen, StatusBlock } from '../more/kit';
import { NotificationBell } from './notifications';
import { CreateSpaceSheet } from './spaces/CreateSpaceSheet';
import { DiscoverSheet } from './spaces/DiscoverSheet';
import { JoinPrivateCard } from './spaces/JoinPrivateCard';

function spaceAvatarData(space: CollabSpace) {
  return {
    initial: space.name[0]?.toUpperCase() ?? '?',
    color: '#fff',
    bg: undefined,
  };
}

function SpaceRow({ space }: { space: CollabSpace }): React.JSX.Element {
  const theme = useTheme();
  const memberCount = space.memberIds.length;

  return (
    <Pressable
      onPress={() => router.push(routes.space(space.id))}
      accessibilityRole="button"
      accessibilityLabel={space.name}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          paddingVertical: theme.space[3],
          paddingHorizontal: theme.space[4],
        },
        pressed && { backgroundColor: theme.colors.hover },
      ]}
    >
      <Avatar data={spaceAvatarData(space)} size={32} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Text variant="body" color="ink" numberOfLines={1} style={{ flex: 1 }}>
            {space.name}
          </Text>
          {space.visibility === 'private' && (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: theme.colors.line2,
                backgroundColor: theme.colors.card,
              }}
            >
              <Text variant="label" color="ink3">Private</Text>
            </View>
          )}
        </View>
        <Text variant="secondary" color="ink3">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
      <Icon name="chevronR" size={16} color="ink4" />
    </Pressable>
  );
}

export function SpacesHome(): React.JSX.Element {
  const theme = useTheme();
  const { user, signOut } = useFirebaseAuth();
  const { spaces, loading, error, spacesByRepo } = useSpacesStore();

  const createSheetRef = useRef<BottomSheetModal>(null);
  const discoverSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (user?.uid) {
      startSpacesSubscription(user.uid);
    }
    return () => {
      stopSpacesSubscription();
    };
  }, [user?.uid]);

  const grouped = spacesByRepo();

  return (
    <>
      <Screen
        title="Spaces"
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
            <NotificationBell />
            <IconButton
              icon="plus"
              onPress={() => createSheetRef.current?.present()}
              accessibilityLabel="Create space"
              size={36}
              iconSize={18}
            />
            <IconButton
              icon="arrowRight"
              onPress={() => void signOut()}
              accessibilityLabel="Sign out"
              size={36}
              iconSize={18}
            />
          </View>
        }
      >
        {/* Join private space card */}
        <JoinPrivateCard />

        {/* Discover public spaces */}
        <Pressable
          onPress={() => discoverSheetRef.current?.present()}
          accessibilityRole="button"
          accessibilityLabel="Discover public spaces"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[3],
              paddingVertical: theme.space[3],
              paddingHorizontal: theme.space[4],
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.line2,
              backgroundColor: theme.colors.card,
            },
            pressed && { backgroundColor: theme.colors.hover },
          ]}
        >
          <Icon name="search" size={16} color="ink3" />
          <Text variant="body" color="ink2" style={{ flex: 1 }}>Discover public spaces…</Text>
          <Icon name="chevronR" size={16} color="ink4" />
        </Pressable>

        {/* Status: loading / error / empty */}
        {((): React.JSX.Element | null => {
          const status = (
            <StatusBlock
              loading={loading}
              error={error ?? undefined}
              empty={!loading && !error && spaces.length === 0}
              emptyLabel="No spaces yet. Create one or join via invite."
            />
          );
          return status;
        })()}

        {/* Grouped space list */}
        {grouped.map((group) => (
          <View
            key={group.githubUrl}
            style={{
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.line2,
              backgroundColor: theme.colors.card,
              overflow: 'hidden',
            }}
          >
            {/* Repo header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space[2],
                paddingHorizontal: theme.space[4],
                paddingVertical: theme.space[2],
                backgroundColor: theme.colors.surface,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.line2,
              }}
            >
              <Icon name="gitBranch" size={14} color="ink3" />
              <Text variant="eyebrow" color="ink3" numberOfLines={1} style={{ flex: 1 }}>
                {group.githubOwner}/{group.githubRepo}
              </Text>
            </View>

            {/* Space rows */}
            {group.spaces.map((space, i) => (
              <View key={space.id}>
                <SpaceRow space={space} />
                {i < group.spaces.length - 1 && <Divider />}
              </View>
            ))}
          </View>
        ))}
      </Screen>

      {/* Sheets (rendered outside Screen's ScrollView) */}
      <CreateSpaceSheet sheetRef={createSheetRef} />
      <DiscoverSheet sheetRef={discoverSheetRef} />
    </>
  );
}
