// (spaces) tab — native Stack (Collab, Firebase-direct). Compass owns the layout;
// the collab feature fills the bodies (spaces list → space chat).
import { Stack } from 'expo-router';

export default function SpacesStack(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
