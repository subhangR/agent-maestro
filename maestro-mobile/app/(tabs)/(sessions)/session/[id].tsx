// Session detail (pushed). Compass owns this thin route file.
// FORGE (Stream B): body wired to features/sessions.
import { useLocalSearchParams } from 'expo-router';

import { SessionDetailScreen } from '@/features/sessions';

export default function SessionDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen id={id ?? ''} />;
}
