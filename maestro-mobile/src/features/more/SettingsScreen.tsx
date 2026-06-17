// SettingsScreen (Forge, Stream A · read + theme toggle). Read-only host + realtime
// status, plus the theme-mode picker. Theme is written through uiStore (persisted)
// AND applied to Unistyles via @/theme.setThemeMode (the only mutation allowed in
// Phase 2 — explicitly sanctioned). Rendered inline inside More.
import { View } from 'react-native';

import { Card, FieldRow, PickerRow, StatusDot, Text } from '@/components';
import { usePrefsStore, useUiStore } from '@/state';
import { setThemeMode as applyThemeMode, type ThemeMode, useTheme } from '@/theme';

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

  const pickTheme = (mode: ThemeMode) => {
    setUiThemeMode(mode);
    applyThemeMode(mode);
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
