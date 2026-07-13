// Task detail (pushed). Mounts Forge (Stream A) TaskDetailScreen.
import { useLocalSearchParams } from 'expo-router';

import { TaskDetailScreen } from '@/features/tasks';

export default function TaskDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetailScreen id={id} />;
}
