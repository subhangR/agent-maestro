// SettingsScreen (Forge, Stream A · read + theme toggle). Read-only host + realtime
// status, plus the theme-mode picker. Theme is written through uiStore (persisted)
// AND applied to Unistyles via @/theme.setThemeMode (the only mutation allowed in
// Phase 2 — explicitly sanctioned). Rendered inline inside More.
import { View } from 'react-native';
import { router } from 'expo-router';

import { Card, FieldRow, PickerRow, StatusDot, Text } from '@/components';
import { usePrefsStore, useUiStore, useProject } from '@/state';
import { asProjectId } from '@/domain';
import { setThemeMode as applyThemeMode, type ThemeMode, useTheme } from '@/theme';

import { routes, sheets } from '../../../navigation';
import { teardown } from '../../../navigation/bootstrap';
import { Screen, SectionLabel } from './kit';

const THEME_OPTIONS: { mode: ThemeMode; label: string; detail: string }[] = [
  { mode: 'system', label: 'System', detail: 'Follow the device appearance' },
  { mode: 'light', label: 'Light', detail: 'Always light' },
  { mode: 'dark', label: 'Dark', detail: 'Always dark' },
];

const STATUS_KEY = { connected: 'run', connecting: 'wait', disconnected: 'block' } as const;
const STATUS_LABEL = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected' } as const;

export function SettingsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const lastHost = usePrefsStore((s) => s.lastHost);
  const themeMode = useUiStore((s) => s.themeMode);
  const setUiThemeMode = useUiStore((s) => s.setThemeMode);
  const realtimeStatus = useUiStore((s) => s.realtimeStatus);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const activeProject = useProject(activeProjectId ?? asProjectId(''));

  const pickTheme = (mode: ThemeMode) => {
    setUiThemeMode(mode);
    applyThemeMode(mode);
  };

  // Switch keeps the current connection live until the new host succeeds (bootstrap
  // tears the old one down itself). Disconnect drops realtime now, then routes to
  // the connect gate where the user can re-enter the same or a different host.
  const onSwitchServer = () => router.push(routes.connect());
  const onDisconnect = () => {
    teardown();
    router.replace(routes.connect());
  };

  return (
    <Screen title="Settings" eyebrow="Preferences" onBack={onBack}>
      <View style={{ gap: theme.space[2] }}>
        <SectionLabel label="Connection" />
        <Card padding={2}>
          <FieldRow label="Host" value={lastHost ?? 'Not connected'} />
          <FieldRow label="Realtime">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
              <StatusDot status={STATUS_KEY[realtimeStatus]} live={realtimeStatus === 'connected'} />
              <Text variant="body" color="ink">
                {STATUS_LABEL[realtimeStatus]}
              </Text>
            </View>
          </FieldRow>
          <PickerRow
            label="Switch server"
            detail="Connect to a different host"
            onPress={onSwitchServer}
          />
          <PickerRow label="Disconnect" detail="End this connection" onPress={onDisconnect} />
        </Card>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <SectionLabel label="Workspace" />
        <Card padding={2}>
          <PickerRow
            label="Active project"
            detail={activeProject?.name ?? 'None selected — tap to choose'}
            onPress={() => sheets.open({ type: 'project' })}
          />
        </Card>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <SectionLabel label="Appearance" />
        <Card padding={2}>
          {THEME_OPTIONS.map((opt) => (
            <PickerRow
              key={opt.mode}
              label={opt.label}
              detail={opt.detail}
              selected={themeMode === opt.mode}
              onPress={() => pickTheme(opt.mode)}
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
}
