// app/connect.tsx — the NO-AUTH host-entry gate (Compass).
//
// v1 connect flow: type a bare `host:port`, tap Connect → run the production
// bootstrapper (probe /health → hydrate store → start realtime). On success,
// persist the host to prefs and enter the tabs. No login, no token.
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Input, Button, Card } from '@/components';
import { useTheme } from '@/theme';
import { usePrefsStore } from '@/state';

import { bootstrap } from '../navigation/bootstrap';

type Phase = 'idle' | 'connecting' | 'error';

export default function Connect(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const setLastHost = usePrefsStore((s) => s.setLastHost);
  const initialHost = usePrefsStore((s) => s.lastHost) ?? '';

  const [host, setHost] = useState(initialHost);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onConnect = useCallback(async () => {
    const trimmed = host.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    setPhase('connecting');
    try {
      await bootstrap(trimmed);
      // Persist only after a successful health probe + sync.
      setLastHost(trimmed);
      router.replace('/(tabs)');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [host, setLastHost]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.paper,
        paddingTop: insets.top + theme.space[8],
        paddingHorizontal: theme.space[4],
        paddingBottom: insets.bottom + theme.space[4],
        gap: theme.space[4],
      }}
    >
      <View style={{ gap: theme.space[1] }}>
        <Text variant="display" color="ink">
          Maestro
        </Text>
        <Text variant="eyebrow" color="ink3">
          connect to a server · no login
        </Text>
      </View>

      <Card style={{ gap: theme.space[3] }}>
        <Text variant="label" color="ink2">
          Server host
        </Text>
        <Input
          value={host}
          onChangeText={setHost}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="192.168.1.5:4569"
          onSubmitEditing={onConnect}
        />
        <Button
          label={phase === 'connecting' ? 'Connecting…' : 'Connect'}
          variant="primary"
          fullWidth
          disabled={phase === 'connecting' || host.trim().length === 0}
          onPress={onConnect}
        />
        {errorMsg ? (
          <Text variant="body" color="block">
            {errorMsg}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
