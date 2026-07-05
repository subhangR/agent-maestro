// app/index.tsx — the boot gate (Compass).
//
// First route the Stack lands on. On cold start it runs the auto-reconnect path:
// hydrate prefs → if a host is stored, re-run the full bootstrap (probe + sync +
// realtime). On success → enter the tabs; otherwise → the connect screen. v1
// gates on host-configured (NO AUTH), not on any token/session. A stored-but-
// unreachable host falls through to /connect (bootstrapFromStoredHost never
// throws), so the user is never stranded on a dead host.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { Text } from '@/components';
import { useTheme } from '@/theme';

import { routes } from '../navigation/routes';
import { bootstrapFromStoredHost } from '../navigation/bootstrap';

type Gate = 'booting' | 'connected' | 'connect';

export default function Index(): React.JSX.Element {
  const theme = useTheme();
  const [gate, setGate] = useState<Gate>('booting');

  useEffect(() => {
    let alive = true;
    void bootstrapFromStoredHost().then((connected) => {
      if (alive) setGate(connected ? 'connected' : 'connect');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (gate === 'connected') return <Redirect href={routes.sessions()} />;
  if (gate === 'connect') return <Redirect href={routes.connect()} />;

  // Booting splash — matches the connect/RootScaffold paper brand mark.
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.paper,
        gap: theme.space[2],
      }}
    >
      <Text variant="display" color="ink">
        Maestro
      </Text>
      <Text variant="eyebrow" color="ink3">
        connecting…
      </Text>
    </View>
  );
}
