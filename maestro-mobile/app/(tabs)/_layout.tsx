// app/(tabs)/_layout.tsx — the tab shell (Compass).
//
// Four tabs, each a route GROUP holding its own native Stack so every tab keeps
// independent history (switch away from a deep detail, come back, it's still
// there). The custom <CustomTabBar> render-prop draws the 5-slot bar (Sessions /
// Tasks / [Conduct FAB] / Members / More) plus the persistent NowPlaying strip.
import { Tabs } from 'expo-router';

import { CustomTabBar } from '../../navigation/tabBar';

export default function TabsLayout(): React.JSX.Element {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="(sessions)" options={{ title: 'Sessions' }} />
      <Tabs.Screen name="(tasks)" options={{ title: 'Tasks' }} />
      <Tabs.Screen name="(members)" options={{ title: 'Members' }} />
      <Tabs.Screen name="(spaces)" options={{ title: 'Spaces' }} />
      <Tabs.Screen name="(more)" options={{ title: 'More' }} />
    </Tabs>
  );
}
