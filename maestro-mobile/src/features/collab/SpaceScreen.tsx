// src/features/collab/SpaceScreen.tsx — FOUNDATION PLACEHOLDER.
// The chat vertical replaces this with the real space view: channel switcher +
// messages pane (paginated) + composer (mentions/attachments) + message actions.
// For now it renders the space title from a live subscription so the route works.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components';
import { SpacesClient, type CollabSpace } from '@/services/collab';
import { useTheme } from '@/theme';

import { Screen, StatusBlock } from '../more/kit';

export function SpaceScreen({ spaceId }: { spaceId: string }): React.JSX.Element {
  const theme = useTheme();
  const [space, setSpace] = useState<CollabSpace | null>(null);

  useEffect(() => {
    if (!spaceId) return undefined;
    return SpacesClient.subscribeToSpace(spaceId, setSpace);
  }, [spaceId]);

  return (
    <Screen title={space?.name ?? 'Space'}>
      <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[2] }}>
        <Text variant="secondary" color="ink3">
          {space ? `${space.memberIds.length} members · ${space.githubRepo}` : 'Loading space…'}
        </Text>
      </View>
      <StatusBlock empty emptyLabel="Channels & messages will appear here." />
    </Screen>
  );
}
