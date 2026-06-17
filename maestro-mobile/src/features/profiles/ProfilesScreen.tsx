// ProfilesScreen (Forge, Stream A · read-only). Workspace-global model profiles
// via a one-shot REST read (re-fetched on pull-to-refresh). Rendered inline in More.
import { View } from 'react-native';

import { Badge, Card, Text } from '@/components';
import { getMaestroClient } from '@/state';
import type { ModelProfile } from '@/domain';
import { useTheme } from '@/theme';

import { Screen, StatusBlock, useRest } from '../more/kit';

function launchSummary(p: ModelProfile): string {
  const { provider, model, reasoningEffort, speed } = p.launchConfig;
  return [provider, model, reasoningEffort, speed].filter(Boolean).join('  ·  ');
}

export function ProfilesScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const { data, loading, error, reload } = useRest<ModelProfile[]>(
    () => getMaestroClient().getModelProfiles(),
    [],
  );
  const profiles = data ?? [];

  const status = (
    <StatusBlock
      loading={loading && profiles.length === 0}
      error={error}
      empty={profiles.length === 0}
      emptyLabel="No model profiles."
    />
  );

  return (
    <Screen title="Profiles" eyebrow="Model profiles" onBack={onBack} refreshing={loading} onRefresh={reload}>
      {status ?? (
        <View style={{ gap: theme.space[2] }}>
          {profiles.map((p) => (
            <Card key={p.id} padding={3}>
              <View style={{ gap: theme.space[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
                  <Text variant="title" color="ink" numberOfLines={1} style={{ flex: 1 }}>
                    {p.name}
                  </Text>
                  {p.isDefault && <Badge variant="plain" label="default" caret={false} />}
                </View>
                <Text variant="mono" color="ink3" numberOfLines={1}>
                  {launchSummary(p)}
                </Text>
                {p.description?.trim() ? (
                  <Text variant="secondary" color="ink3" numberOfLines={2}>
                    {p.description}
                  </Text>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
