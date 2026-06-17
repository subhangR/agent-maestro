// Member detail (pushed). FORGE (Stream A): replace with <MemberDetail/> from
// features/members; read `id` via useLocalSearchParams.
import { useLocalSearchParams } from 'expo-router';

import { TabPlaceholder } from '../../../../navigation/TabPlaceholder';

export default function MemberDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TabPlaceholder title="Member" subtitle={`id: ${id ?? '—'}`} />;
}
