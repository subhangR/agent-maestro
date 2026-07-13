// Stream-A shared read-screen scaffolding (Forge). A safe-area `Screen` wrapper
// (big tab-home header OR compact back-header for detail), a loading/empty/error
// `StatusBlock` triad, and a tiny `useRest` one-shot REST hook for the non-WS
// lists (teams/lists/profiles). Lives in more/ (Stream A's shell/misc area) so
// every Stream-A feature can import it WITHOUT crossing into Stream B's
// _shared/useScreenStatus (a different stream's file). Presentational + theme
// only; no store writes.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Text } from '@/components';
import { useTheme } from '@/theme';

// ── Screen ───────────────────────────────────────────────────────────────────
export interface ScreenProps {
  title: string;
  /** Uppercase eyebrow over the title (tab homes) / under the back row (detail). */
  eyebrow?: string;
  /** Node rendered above the eyebrow/title (e.g. the project switcher pill). */
  headerAccessory?: ReactNode;
  /** When set, renders a compact back-header (detail screens). */
  onBack?: () => void;
  /** Trailing header slot (e.g. a `+` IconButton). */
  trailing?: ReactNode;
  children: ReactNode;
  /** Pull-to-refresh — omit to disable. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function Screen({
  title,
  eyebrow,
  headerAccessory,
  onBack,
  trailing,
  children,
  onRefresh,
  refreshing = false,
}: ScreenProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.paper }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingTop: insets.top + theme.space[4],
        paddingBottom: insets.bottom + theme.space[12],
        paddingHorizontal: theme.space[4],
        gap: theme.space[4],
      }}
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.ink3} />
          : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[2] }}>
        {onBack && (
          <View style={{ marginTop: 2, marginLeft: -8 }}>
            <IconButton icon="chevronL" onPress={onBack} accessibilityLabel="Back" size={36} iconSize={18} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          {headerAccessory}
          {eyebrow != null && (
            <Text variant="eyebrow" color="ink3">
              {eyebrow}
            </Text>
          )}
          <Text variant={onBack ? 'h1' : 'display'} color="ink" numberOfLines={2}>
            {title}
          </Text>
        </View>
        {trailing}
      </View>
      {children}
    </ScrollView>
  );
}

// ── StatusBlock ────────────────────────────────────────────────────────────────
export interface StatusBlockProps {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  emptyLabel?: string;
  /** When false, suppress the "Connect to a project" gate even with no projectId. */
  noProject?: boolean;
}

/**
 * The read-surface status triad. Returns a centered message for the FIRST active
 * state (noProject → error → loading → empty), or `null` when content should
 * render. Caller pattern: `const status = <StatusBlock .../>; return status ?? <list/>`.
 */
export function StatusBlock({
  loading,
  error,
  empty,
  emptyLabel = 'Nothing here yet.',
  noProject,
}: StatusBlockProps): React.JSX.Element | null {
  let message: string | null = null;
  let tone: 'ink3' | 'blockText' = 'ink3';
  if (noProject) message = 'Connect to a project to see this.';
  else if (error) {
    message = error;
    tone = 'blockText';
  } else if (loading) message = 'Loading…';
  else if (empty) message = emptyLabel;

  if (message == null) return null;
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <Text variant="secondary" color={tone}>
        {message}
      </Text>
    </View>
  );
}

// ── SectionLabel ───────────────────────────────────────────────────────────────
export function SectionLabel({ label, count }: { label: string; count?: number }): React.JSX.Element {
  return (
    <Text variant="eyebrow" color="ink3" style={{ marginTop: 4 }}>
      {label}
      {count != null ? `  ·  ${count}` : ''}
    </Text>
  );
}

// ── useRest ────────────────────────────────────────────────────────────────────
export interface RestState<T> {
  data: T | null;
  loading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * One-shot REST read for the non-WS lists (teams/task-lists/model-profiles). Runs
 * `fetcher` on mount and whenever `deps` change; `reload()` re-runs it (pull-to-
 * refresh). `fetcher` calls getMaestroClient() internally — thrown boot-order /
 * network errors surface as `error`.
 */
export function useRest<T>(fetcher: () => Promise<T>, deps: React.DependencyList): RestState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error?: string }>({
    data: null,
    loading: true,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ data: s.data, loading: true, error: undefined }));
    Promise.resolve()
      .then(fetcher)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState((s) => ({
            data: s.data,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          }));
      });
    return () => {
      cancelled = true;
    };
  }, deps);

  useEffect(run, [run]);

  return { ...state, reload: run };
}
