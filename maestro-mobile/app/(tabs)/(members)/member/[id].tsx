// Member detail (pushed). Mounts Forge (Stream A) MemberDetailScreen.
import { useLocalSearchParams } from 'expo-router';

import { MemberDetailScreen } from '@/features/members';

export default function MemberDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MemberDetailScreen id={id} />;
}
