// app/_layout.tsx — RootStack (Compass).
//
// The single root layout: providers (Gesture → SafeArea → BottomSheetModal),
// ThemeBoot for status bar + paper background, the root-mounted <SheetHost>, and
// a headerless <Stack>. Fonts gate first paint (return null until loaded) so the
// embedded per-weight families are ready before any Text renders.
//
// Routes: `index` (boot gate) · `connect` (host entry) · `(tabs)` (the shell) ·
// `terminal/[sessionId]` (full-screen modal frame for Relay's terminal body).
// The connect gate lives in app/index.tsx — it auto-reconnects to the stored
// host or redirects to /connect.
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';

import { ThemeBoot, useAppFonts } from '@/theme';

import { SheetHost } from '../navigation/sheets';

export default function RootLayout(): React.JSX.Element | null {
  const { loaded, error } = useAppFonts();

  // Gate first paint on fonts (unless they failed — then proceed with fallbacks).
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeBoot>
          <BottomSheetModalProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="connect" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="terminal/[sessionId]"
                options={{ presentation: 'fullScreenModal' }}
              />
            </Stack>
            <SheetHost />
          </BottomSheetModalProvider>
        </ThemeBoot>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
