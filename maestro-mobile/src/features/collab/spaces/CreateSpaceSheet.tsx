// CreateSpaceSheet — BottomSheetModal for creating a new Collab Space.
// Form: name, description, GitHub repo URL, visibility (public/private).
// On success: dismiss + navigate to the new space.
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { Button, Input, Text, TextArea, Toggle } from '@/components';
import { SheetHandle, SheetHeader } from '@/components';
import type { BottomSheetHandleProps } from '@gorhom/bottom-sheet';

// Adapter: gorhom passes BottomSheetHandleProps; SheetHandle only needs `width`.
function HandleAdapter(_props: BottomSheetHandleProps): React.JSX.Element {
  return <SheetHandle />;
}
import { currentUser } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';
import { router } from 'expo-router';

import { routes } from '../../../../navigation/routes';
import { useSpacesStore } from '../../../state/collab/spacesStore';
import { parseGithubUrl } from './parseGithubUrl';

export interface CreateSpaceSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
}

const SNAP_POINTS = ['90%'];

export function CreateSpaceSheet({ sheetRef }: CreateSpaceSheetProps): React.JSX.Element {
  const theme = useTheme();
  const { createSpace, createAction } = useSpacesStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  function dismiss() {
    sheetRef.current?.dismiss();
  }

  function resetForm() {
    setName('');
    setDescription('');
    setRepoInput('');
    setIsPrivate(false);
    setRepoError(null);
  }

  async function handleCreate() {
    setRepoError(null);
    const parsed = parseGithubUrl(repoInput);
    if (!parsed) {
      setRepoError('Enter a valid GitHub URL, e.g. github.com/owner/repo');
      return;
    }
    const user = currentUser();
    if (!user) return;

    const created = await createSpace(user, {
      name: name.trim(),
      description: description.trim() || undefined,
      githubUrl: parsed.githubUrl,
      githubHost: parsed.githubHost,
      githubOwner: parsed.githubOwner,
      githubRepo: parsed.githubRepo,
      visibility: isPrivate ? 'private' : 'public',
    });

    if (created) {
      dismiss();
      resetForm();
      router.push(routes.space(created.id));
    }
  }

  const canSubmit = name.trim().length > 0 && repoInput.trim().length > 0 && !createAction.busy;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      handleComponent={HandleAdapter}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      onDismiss={resetForm}
    >
      <SheetHeader title="New Space" onClose={dismiss} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.space[4],
          paddingBottom: theme.space[12],
          gap: theme.space[4],
        }}
      >
        {/* Name */}
        <View style={{ gap: theme.space[1] }}>
          <Text variant="label" color="ink3">Name</Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="My Space"
            autoFocus
          />
        </View>

        {/* Description */}
        <View style={{ gap: theme.space[1] }}>
          <Text variant="label" color="ink3">Description (optional)</Text>
          <TextArea
            value={description}
            onChangeText={setDescription}
            placeholder="What is this space for?"
          />
        </View>

        {/* GitHub Repo */}
        <View style={{ gap: theme.space[1] }}>
          <Text variant="label" color="ink3">GitHub Repo</Text>
          <Input
            value={repoInput}
            onChangeText={(t) => { setRepoInput(t); setRepoError(null); }}
            placeholder="github.com/owner/repo"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {repoError != null && (
            <Text variant="secondary" color="blockText">{repoError}</Text>
          )}
        </View>

        {/* Visibility */}
        <View style={{ gap: theme.space[2] }}>
          <Text variant="label" color="ink3">Visibility</Text>
          <Toggle
            label="Private"
            on={isPrivate}
            tone="worktree"
            onToggle={setIsPrivate}
            icon="shield"
            size="sm"
          />
          {!isPrivate && (
            <Text variant="secondary" color="ink3">
              Public spaces are discoverable by anyone with the same repo.
            </Text>
          )}
        </View>

        {createAction.error != null && (
          <Text variant="secondary" color="blockText">{createAction.error}</Text>
        )}

        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <View style={{ flex: 1 }}>
            <Button label="Cancel" variant="secondary" onPress={dismiss} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            {createAction.busy ? (
              <View style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.brand} />
              </View>
            ) : (
              <Button
                label="Create"
                variant="primary"
                onPress={() => void handleCreate()}
                disabled={!canSubmit}
                fullWidth
              />
            )}
          </View>
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}
