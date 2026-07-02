// (more) tab — native Stack. Compass owns the layout; Forge fills the bodies
// (Stream A — skills / spells / lists / settings / about leaf routes land here).
import { Stack } from 'expo-router';

export default function MoreStack(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
