// Team detail (pushed). Mounts Forge (Stream A) TeamDetailScreen.
import { useLocalSearchParams } from 'expo-router';

import { TeamDetailScreen } from '@/features/teams';

export default function TeamDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeamDetailScreen id={id} />;
}
