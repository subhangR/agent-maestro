// (sessions) tab — native Stack (own history). Compass owns the layout; Forge
// fills the screen bodies (Stream B — session panel).
import { Stack } from 'expo-router';

export default function SessionsStack(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
