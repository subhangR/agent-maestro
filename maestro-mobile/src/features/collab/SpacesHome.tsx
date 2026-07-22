// src/features/collab/SpacesHome.tsx — FOUNDATION PLACEHOLDER.
// The spaces vertical replaces this with the real "all my spaces" list (grouped
// by repo via SpacesClient.subscribeToAllForUser), the create-space + join +
// discover flows, and the private-invite redeem card. For now it proves the
// signed-in gate + sign-out and renders an empty state so the tab is coherent.
import { View } from 'react-native';

import { Button, Text } from '@/components';
import { useFirebaseAuth } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';

import { Screen, StatusBlock } from '../more/kit';

export function SpacesHome(): React.JSX.Element {
  const theme = useTheme();
  const { user, signOut } = useFirebaseAuth();

  return (
    <Screen
      title="Spaces"
      trailing={<Button label="Sign out" variant="secondary" onPress={() => void signOut()} />}
    >
      <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[2] }}>
        <Text variant="secondary" color="ink3">
          Signed in as {user?.email ?? user?.displayName ?? user?.uid ?? 'unknown'}
        </Text>
      </View>
      <StatusBlock empty emptyLabel="Your Collab Spaces will appear here." />
    </Screen>
  );
}
