// Session detail (pushed). FORGE (Stream B): replace with <SessionDetail/> from
// features/sessions; read `id` via useLocalSearchParams. The "open terminal" CTA
// pushes routes.terminal(id).
import { useLocalSearchParams } from 'expo-router';

import { TabPlaceholder } from '../../../../navigation/TabPlaceholder';

export default function SessionDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TabPlaceholder title="Session" subtitle={`id: ${id ?? '—'}`} />;
}
