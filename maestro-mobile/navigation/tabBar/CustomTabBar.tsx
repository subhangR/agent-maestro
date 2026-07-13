// navigation/tabBar/CustomTabBar.tsx — the 5-slot bottom shell (Compass).
//
// Four real tabs (Sessions / Tasks / Members / More) + a center Conduct FAB
// pseudo-slot. The default <Tabs> bar can't express the center-FAB layout or the
// persistent NowPlaying strip, so this is a custom `tabBar` render-prop. The
// strip mounts ABOVE the bar row (persists across tab switches) and is hidden on
// the More tab, mirroring the Atelier specimen.
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { Text, Icon } from '@/components';
import { useTheme, type IconName } from '@/theme';

import { ConductFab } from './ConductFab';
import { NowPlaying } from './NowPlaying';
import { useNeedsInputCount } from './selectors';

// Group route name → label + icon. The FAB is injected between Tasks and Members
// (mirrors the specimen's center `m-tab--add` slot).
const TAB_META: Record<string, { label: string; icon: IconName }> = {
  '(sessions)': { label: 'Sessions', icon: 'layers' },
  '(tasks)': { label: 'Tasks', icon: 'listChecks' },
  '(members)': { label: 'Members', icon: 'users' },
  '(more)': { label: 'More', icon: 'menu' },
};

export function CustomTabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const needsInput = useNeedsInputCount();

  const activeRouteName = state.routes[state.index]?.name;

  const renderTab = useCallback(
    (routeName: string, showDot: boolean) => {
      const meta = TAB_META[routeName];
      if (!meta) return null;
      const routeIndex = state.routes.findIndex((r) => r.name === routeName);
      const focused = state.index === routeIndex;
      const onPress = () => {
        const route = state.routes[routeIndex];
        if (!route) return;
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
      };
      return (
        <Pressable
          key={routeName}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: focused }}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            paddingVertical: theme.space[2],
          }}
        >
          <View>
            <Icon name={meta.icon} size={22} color={focused ? 'brand' : 'ink3'} />
            {showDot ? (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -6,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.colors.wait,
                }}
              />
            ) : null}
          </View>
          <Text variant="eyebrow" color={focused ? 'brand' : 'ink3'}>
            {meta.label}
          </Text>
        </Pressable>
      );
    },
    [state, navigation, theme.space, theme.colors.wait],
  );

  return (
    <View>
      <NowPlaying visible={activeRouteName !== '(more)'} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.line,
          paddingBottom: insets.bottom,
        }}
      >
        {renderTab('(sessions)', needsInput > 0)}
        {renderTab('(tasks)', false)}

        {/* Center Conduct FAB pseudo-slot (NOT a route). */}
        <View style={{ width: 64, alignItems: 'center', justifyContent: 'center' }}>
          <ConductFab />
        </View>

        {renderTab('(members)', false)}
        {renderTab('(more)', false)}
      </View>
    </View>
  );
}
