// DiscoverSheet — BottomSheetModal for discovering public spaces for a repo.
// User enters a GitHub repo URL → subscribeToPublicForRepo → list with Join buttons.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { Avatar, Button, Divider, Icon, Input, Text } from '@/components';
import { SheetHandle, SheetHeader } from '@/components';
import type { BottomSheetHandleProps } from '@gorhom/bottom-sheet';

function HandleAdapter(_props: BottomSheetHandleProps): React.JSX.Element {
  return <SheetHandle />;
}
import { SpacesClient, type CollabSpace } from '@/services/collab';
import { currentUser } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';
import { router } from 'expo-router';

import { routes } from '../../../../navigation/routes';
import { parseGithubUrl } from './parseGithubUrl';

export interface DiscoverSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
}

const SNAP_POINTS = ['80%'];

function avatarData(name: string | null) {
  const n = name ?? '?';
  return {
    initial: n[0]?.toUpperCase() ?? '?',
    color: '#fff',
    bg: undefined,
  };
}

function SpaceRow({
  space,
  currentUid,
  onJoined,
}: {
  space: CollabSpace;
  currentUid: string;
  onJoined: (spaceId: string) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMember = space.memberIds.includes(currentUid);

  async function handleJoin() {
    const user = currentUser();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await SpacesClient.join(user, space.id);
      onJoined(space.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Pressable
        onPress={() => router.push(routes.space(space.id))}
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
        <Avatar data={avatarData(space.name)} size={32} />
        <View style={{ flex: 1 }}>
          <Text variant="body" color="ink" numberOfLines={1}>{space.name}</Text>
          {space.description ? (
            <Text variant="secondary" color="ink3" numberOfLines={1}>{space.description}</Text>
          ) : null}
          <Text variant="secondary" color="ink4">
            {space.memberIds.length} {space.memberIds.length === 1 ? 'member' : 'members'}
          </Text>
        </View>
        {isMember ? (
          <Icon name="check" size={16} color="brand" />
        ) : busy ? (
          <ActivityIndicator color={theme.colors.brand} />
        ) : (
          <Button label="Join" variant="secondary" onPress={() => void handleJoin()} />
        )}
      </Pressable>
      {error != null && (
        <Text variant="secondary" color="blockText" style={{ paddingHorizontal: theme.space[4] }}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function DiscoverSheet({ sheetRef }: DiscoverSheetProps): React.JSX.Element {
  const theme = useTheme();
  const [repoInput, setRepoInput] = useState('');
  const [repoError, setRepoError] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<CollabSpace[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedUrl, setSearchedUrl] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const currentUid = currentUser()?.uid ?? '';

  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  function handleSearch() {
    setRepoError(null);
    const parsed = parseGithubUrl(repoInput);
    if (!parsed) {
      setRepoError('Enter a valid GitHub URL, e.g. github.com/owner/repo');
      return;
    }
    // Tear down previous subscription
    unsubRef.current?.();
    setLoading(true);
    setSpaces([]);
    setSearchedUrl(parsed.githubUrl);

    unsubRef.current = SpacesClient.subscribeToPublicForRepo(
      parsed.githubUrl,
      (s) => { setSpaces(s); setLoading(false); },
      () => { setLoading(false); },
    );
  }

  function dismiss() {
    sheetRef.current?.dismiss();
  }

  function handleDismiss() {
    unsubRef.current?.();
    unsubRef.current = null;
    setRepoInput('');
    setSpaces([]);
    setSearchedUrl(null);
    setRepoError(null);
  }

  function handleJoined(spaceId: string) {
    router.push(routes.space(spaceId));
    dismiss();
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      handleComponent={HandleAdapter}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      onDismiss={handleDismiss}
    >
      <SheetHeader title="Discover Spaces" onClose={dismiss} />

      <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[3], gap: theme.space[2] }}>
        <Input
          value={repoInput}
          onChangeText={(t) => { setRepoInput(t); setRepoError(null); }}
          placeholder="github.com/owner/repo"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          leadingIcon="search"
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        {repoError != null && (
          <Text variant="secondary" color="blockText">{repoError}</Text>
        )}
        <Button label="Search" variant="secondary" icon="search" onPress={handleSearch} fullWidth />
      </View>

      <Divider />

      <ScrollView keyboardShouldPersistTaps="handled">
        {loading && (
          <View style={{ padding: theme.space[8], alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.brand} />
          </View>
        )}
        {!loading && searchedUrl != null && spaces.length === 0 && (
          <View style={{ padding: theme.space[8], alignItems: 'center' }}>
            <Text variant="secondary" color="ink3">No public spaces found for this repo.</Text>
          </View>
        )}
        {!loading && spaces.map((space, i) => (
          <View key={space.id}>
            <SpaceRow
              space={space}
              currentUid={currentUid}
              onJoined={handleJoined}
            />
            {i < spaces.length - 1 && <Divider />}
          </View>
        ))}
      </ScrollView>
    </BottomSheetModal>
  );
}
