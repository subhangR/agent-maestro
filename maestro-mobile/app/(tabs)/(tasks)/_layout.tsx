// (tasks) tab — native Stack. Compass owns the layout; Forge fills the bodies
// (Stream A — maestro panel).
import { Stack } from 'expo-router';

export default function TasksStack(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
