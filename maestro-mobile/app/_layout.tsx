// app/_layout.tsx — RootStack (Compass).
//
// The single root layout: providers (Gesture → SafeArea → BottomSheetModal),
// ThemeBoot for status bar + paper background, the root-mounted <SheetHost>, and
// a headerless <Stack>. Fonts gate first paint (return null until loaded) so the
// embedded per-weight families are ready before any Text renders.
//
// Routes: `index` (boot gate) · `connect` (host entry) · `(tabs)` (the shell) ·
// `terminal/[sessionId]` (full-screen modal frame for Relay's terminal body) ·
// `whiteboard/[sessionId]` (full-screen modal frame for Relay's whiteboard).
// The connect gate lives in app/index.tsx — it auto-reconnects to the stored
// host or redirects to /connect.
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';

import { ThemeBoot, useAppFonts } from '@/theme';
import { initFirebaseAuth, getIdToken, signInAndGetIdToken } from '@/services/firebaseAuth';
import { setHubFirebaseAuth } from '@/services/api';
import { useCollabRuntime } from '@/features/collab/collabRuntime';
import { NotificationToaster } from '@/features/collab/notifications';

// Direct module import (NOT the '../navigation/sheets' barrel): SheetHost pulls
// in SHEET_REGISTRY → @/features/* bodies. The barrel is a leaf consumed by
// features, so routing SheetHost through it would create a navigation⇄features
// cycle. app/ is never imported by features, so this stays one-way.
import { SheetHost } from '../navigation/sheets/SheetHost';

export default function RootLayout(): React.JSX.Element | null {
  const { loaded, error } = useAppFonts();

  // Stand up the shared Firebase auth seam once (idempotent): configures Google
  // Sign-In + wires the id-token listener. Independent of server connection —
  // Collab (Firebase-direct) and the Hub (id token) both read from it. See
  // planning/MOBILE_COLLAB_SPEC.md §4a.
  useEffect(() => {
    initFirebaseAuth();
    // Merge-time wiring (feat/mobile-multi-server ⋈ feat/mobile-collab): hand the
    // Hub's token seam the Firebase accessors so a firebase-authMode server profile
    // rides the current id token, and can trigger Google sign-in on demand.
    setHubFirebaseAuth({ getIdToken, signIn: signInAndGetIdToken });
  }, []);

  // Collab notifications + push lifecycle, bound to the Firebase auth snapshot.
  useCollabRuntime();

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
              <Stack.Screen
                name="whiteboard/[sessionId]"
                options={{ presentation: 'fullScreenModal' }}
              />
            </Stack>
            <NotificationToaster />
            <SheetHost />
          </BottomSheetModalProvider>
        </ThemeBoot>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
