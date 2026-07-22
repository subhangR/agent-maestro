// Collab Space chat route — the space's channels + messages. `id` is the
// Firestore space id. Built by the chat vertical (SpaceScreen).
import { useLocalSearchParams } from 'expo-router';

import { SpaceScreen } from '@/features/collab';

export default function SpaceRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpaceScreen spaceId={id} />;
}
