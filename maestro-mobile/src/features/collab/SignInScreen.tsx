// src/features/collab/SignInScreen.tsx — the Collab auth gate face. Google-only
// sign-in (the locked decision) over the shared firebaseAuth seam. Signing into
// Firebase here is independent of the server connection; it unlocks the Collab
// (Firebase-direct) surface AND supplies the Hub id token.
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components';
import { useFirebaseAuth, isGoogleConfigured } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';

export function SignInScreen(): React.JSX.Element {
  const theme = useTheme();
  const { status, error, signInWithGoogle } = useFirebaseAuth();
  const [busy, setBusy] = useState(false);
  const configured = isGoogleConfigured();

  const onPress = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // error is surfaced via the auth snapshot below
    } finally {
      setBusy(false);
    }
  };

  const signingIn = busy || status === 'signingIn';

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.paper,
        padding: theme.space[6],
        gap: theme.space[5],
      }}
    >
      <View style={{ alignItems: 'center', gap: theme.space[3] }}>
        <Icon name="hash" size={40} color="brand" />
        <Text variant="display" color="ink">
          Collab Spaces
        </Text>
        <Text variant="body" color="ink3" style={{ textAlign: 'center' }}>
          Chat, share tasks, and collaborate with your team on GitHub repos.
        </Text>
      </View>

      <Card style={{ width: '100%', maxWidth: 380, gap: theme.space[4], padding: theme.space[5] }}>
        <Text variant="eyebrow" color="ink3">
          SIGN IN
        </Text>
        <Button
          label={signingIn ? 'Signing in…' : 'Continue with Google'}
          icon="at"
          variant="primary"
          onPress={onPress}
          disabled={signingIn || !configured}
        />
        {!configured ? (
          <Text variant="secondary" color="block">
            Google sign-in isn’t configured yet. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (see
            app.json → extra.googleWebClientId) and rebuild.
          </Text>
        ) : null}
        {error && status === 'error' ? (
          <Text variant="secondary" color="block">
            {error}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
