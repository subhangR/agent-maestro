// SessionsScreen — the Sessions tab body. A status-sectioned list of the active
// project's sessions, scoped by an Active / Completed / Archived tab, with
// pull-to-refresh. Tapping a tile opens the session detail. Read-only: spawn +
// lifecycle actions are Phase 3. View-model lives in useSessionsScreen; this is
// presentational + navigation only.
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { MSessionTile, Text } from '@/components';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { useSessionsScreen, SESSION_TABS } from './useSessionsScreen';
import type { SessionTab } from '@/domain';

export function SessionsScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projectId, tab, setTab, groups, liveIds, childCounts, status, refreshing, onRefresh } =
    useSessionsScreen();

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.space[3] }]}>
      <View style={styles.header}>
        <Text variant="display" color="ink">
          Sessions
        </Text>
      </View>

      <TabBar tab={tab} onChange={setTab} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.space[8] }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.ink3} />
        }
      >
        {!projectId ? (
          <EmptyState title="No project selected" hint="Connect to a host and pick a project." />
        ) : status.status === 'loading' ? (
          <EmptyState title="Loading sessions…" />
        ) : status.status === 'error' ? (
          <EmptyState title="Couldn’t load sessions" hint={status.error} />
        ) : status.status === 'empty' ? (
          <EmptyState title={`No ${tab} sessions`} hint="Spawn one from the Conduct button." />
        ) : (
          groups.map((g) => (
            <View key={g.key} style={styles.section}>
              <View style={styles.sectionHead}>
                <Text variant="eyebrow" color="ink3">
                  {g.label}
                </Text>
                <Text variant="eyebrow" color="ink3">
                  {g.sessions.length}
                </Text>
              </View>
              {g.sessions.map((s) => (
                <MSessionTile
                  key={s.id}
                  session={s}
                  live={liveIds.has(s.id)}
                  childCount={childCounts.get(s.id) ?? 0}
                  docCount={s.docs?.length ?? 0}
                  onPress={() => router.push(routes.session(s.id))}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TabBar({ tab, onChange }: { tab: SessionTab; onChange: (t: SessionTab) => void }): React.JSX.Element {
  return (
    <View style={styles.tabBar}>
      {SESSION_TABS.map((t) => {
        const active = t.key === tab;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text variant="label" color={active ? 'ink' : 'ink3'}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }): React.JSX.Element {
  return (
    <View style={styles.empty}>
      <Text variant="title" color="ink2">
        {title}
      </Text>
      {hint != null && (
        <Text variant="secondary" color="ink3" style={styles.emptyHint}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.paper,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[2],
  },
  tabBar: {
    flexDirection: 'row',
    gap: theme.space[2],
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[3],
  },
  tab: {
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[2],
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  tabActive: {
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.brandSoft,
  },
  content: {
    paddingHorizontal: theme.space[4],
    gap: theme.space[4],
  },
  section: {
    gap: theme.space[2],
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.space[1],
  },
  empty: {
    alignItems: 'center',
    paddingVertical: theme.space[8],
    gap: theme.space[2],
  },
  emptyHint: {
    textAlign: 'center',
  },
}));
