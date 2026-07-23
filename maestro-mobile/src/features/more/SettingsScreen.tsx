// SettingsScreen (Forge, Stream A · read + theme toggle). Read-only host + realtime
// status, plus the theme-mode picker. Theme is written through uiStore (persisted)
// AND applied to Unistyles via @/theme.setThemeMode (the only mutation allowed in
// Phase 2 — explicitly sanctioned). Rendered inline inside More.
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { Card, FieldRow, PickerRow, StatusDot, Text } from '@/components';
import {
  useUiStore,
  useProject,
  useServerProfilesStore,
  type ServerProfile,
} from '@/state';
import { asProjectId } from '@/domain';
import { AuthRequiredError, HubSignInRequiredError, type AuthMode } from '@/services/api';
import { setThemeMode as applyThemeMode, type ThemeMode, useTheme } from '@/theme';

import { routes, sheets } from '../../../navigation';
import { teardown, switchToProfile } from '../../../navigation/bootstrap';
import { Screen, SectionLabel } from './kit';

const THEME_OPTIONS: { mode: ThemeMode; label: string; detail: string }[] = [
  { mode: 'system', label: 'System', detail: 'Follow the device appearance' },
  { mode: 'light', label: 'Light', detail: 'Always light' },
  { mode: 'dark', label: 'Dark', detail: 'Always dark' },
];

const STATUS_KEY = { connected: 'run', connecting: 'wait', disconnected: 'block' } as const;
const STATUS_LABEL = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected' } as const;

const AUTH_LABEL: Record<AuthMode, string> = {
  none: 'Open',
  password: 'Password',
  firebase: 'Hub · Google',
};

export function SettingsScreen({ onBack }: { onBack?: () => void }): React.JSX.Element {
  const theme = useTheme();
  const themeMode = useUiStore((s) => s.themeMode);
  const setUiThemeMode = useUiStore((s) => s.setThemeMode);
  const realtimeStatus = useUiStore((s) => s.realtimeStatus);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const activeProject = useProject(activeProjectId ?? asProjectId(''));

  const profiles = useServerProfilesStore((s) => s.profiles);
  const activeProfileId = useServerProfilesStore((s) => s.activeProfileId);
  const removeProfile = useServerProfilesStore((s) => s.removeProfile);

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const pickTheme = (mode: ThemeMode) => {
    setUiThemeMode(mode);
    applyThemeMode(mode);
  };

  // Tapping a saved server switches to it (bootstrap tears the old one down). An
  // 'Open'/'Password' server that now needs a credential, or a Hub needing a
  // Google sign-in, is routed to the connect screen with a clear message.
  const onSwitch = useCallback(
    async (profile: ServerProfile) => {
      if (profile.id === activeProfileId && realtimeStatus === 'connected') return;
      setServerError(null);
      setSwitchingId(profile.id);
      try {
        await switchToProfile(profile.id);
        router.replace(routes.sessions());
      } catch (e) {
        if (e instanceof AuthRequiredError || e instanceof HubSignInRequiredError) {
          router.push(routes.connect());
        } else {
          setServerError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setSwitchingId(null);
      }
    },
    [activeProfileId, realtimeStatus],
  );

  const onAddServer = () => router.push(routes.connect());
  const onDisconnect = () => {
    teardown();
    router.replace(routes.connect());
  };

  return (
    <Screen title="Settings" eyebrow="Preferences" onBack={onBack}>
      <View style={{ gap: theme.space[2] }}>
        <SectionLabel label="Servers" />
        <Card padding={2}>
          <FieldRow label="Realtime">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
              <StatusDot status={STATUS_KEY[realtimeStatus]} live={realtimeStatus === 'connected'} />
              <Text variant="body" color="ink">
                {STATUS_LABEL[realtimeStatus]}
              </Text>
            </View>
          </FieldRow>
          {profiles.length === 0 ? (
            <Text variant="body" color="ink3" style={{ paddingVertical: theme.space[2] }}>
              No saved servers yet.
            </Text>
          ) : (
            profiles.map((profile) => {
              const active = profile.id === activeProfileId;
              return (
                <View
                  key={profile.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}
                >
                  <View style={{ flex: 1 }}>
                    <PickerRow
                      label={profile.label}
                      detail={`${profile.host} · ${AUTH_LABEL[profile.authMode]}${
                        switchingId === profile.id ? ' · connecting…' : ''
                      }`}
                      selected={active}
                      onPress={() => void onSwitch(profile)}
                    />
                  </View>
                  {profiles.length > 1 && !active ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${profile.label}`}
                      hitSlop={8}
                      onPress={() => removeProfile(profile.id)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: theme.space[1] })}
                    >
                      <Text variant="label" color="ink3">
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
          <PickerRow label="Add server" detail="Standalone or Hub" onPress={onAddServer} />
          <PickerRow label="Disconnect" detail="End this connection" onPress={onDisconnect} />
          {serverError ? (
            <Text variant="body" color="block" style={{ paddingTop: theme.space[1] }}>
              {serverError}
            </Text>
          ) : null}
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
