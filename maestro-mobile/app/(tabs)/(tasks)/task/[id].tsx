// Task detail (pushed). FORGE (Stream A): replace with <TaskDetail/> (subtask
// tree) from features/tasks; read `id` via useLocalSearchParams.
import { useLocalSearchParams } from 'expo-router';

import { TabPlaceholder } from '../../../../navigation/TabPlaceholder';

export default function TaskDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TabPlaceholder title="Task" subtitle={`id: ${id ?? '—'}`} />;
}
