// SessionDetailScreen — the pushed session-detail body. A header (agent + name +
// derived status), an "Open terminal" CTA (→ Relay's full-screen terminal), and
// four READ tabs: Stats (derived fields), Timeline (session.timeline), Prompts
// (inbound prompt events), and Docs (session.docs → DocsViewer). View-model lives
// in useSessionDetail; mutations/cast are Phase 3.
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { AgentAvatar, Button, FieldRow, IconButton, Input, StatusGlyph, StatusDot, Text } from '@/components';
import { getPtyTransport, hasPtyTransport } from '@/state';
import { asSessionId, toUiSessionStatus, toDisplayTool, type DocEntry } from '@/domain';
import { useTheme } from '@/theme';

import { routes } from '../../../navigation';
import { encodeUtf8 } from '../_shared';
import { DocsViewer } from '../docs';
import {
  useSessionDetail,
  SESSION_DETAIL_TABS,
  type SessionDetailTab,
  type TimelineRow,
} from './useSessionDetail';

/** Display statuses that imply a (re-)attachable live PTY worth replying to. */
const REPLYABLE = new Set(['spawning', 'idle', 'working', 'run', 'wait']);

export function SessionDetailScreen({ id }: { id: string }): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<SessionDetailTab>('stats');
  const [reply, setReply] = useState('');

  const { session, statusLabel, agentLabel, stats, timeline, prompts, docs, status } = useSessionDetail(id);

  const canReply = session != null && REPLYABLE.has(toUiSessionStatus(session)) && hasPtyTransport();

  // Warm the PTY socket while a replyable session is open so a reply lands
  // promptly. attach() is idempotent (reuses Relay's socket); we don't detach —
  // tearing the shared socket down is Relay's terminal lifecycle, not ours.
  useEffect(() => {
    if (!canReply) return;
    getPtyTransport().attach(asSessionId(id));
  }, [canReply, id]);

  function sendReply(): void {
    const text = reply.trim();
    if (!text || !canReply) return;
    const pty = getPtyTransport();
    const sid = asSessionId(id);
    pty.attach(sid); // idempotent — re-open if the socket was closed since mount
    pty.write(sid, encodeUtf8(text + '\r'));
    setReply('');
  }

  if (!session) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top + theme.space[6] }]}>
        <Text variant="title" color="ink2">
          {status.status === 'error' ? 'Couldn’t load session' : status.status === 'loading' ? 'Loading…' : 'Session not found'}
        </Text>
        {status.error != null && (
          <Text variant="secondary" color="ink3" style={styles.centerHint}>
            {status.error}
          </Text>
        )}
      </View>
    );
  }

  const displayTool = toDisplayTool(session.teamMemberSnapshot?.agentTool ?? null);

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.space[2] }]}>
      <View style={styles.header}>
        <IconButton icon="chevronL" onPress={() => router.back()} accessibilityLabel="Back" />
        <AgentAvatar kind={displayTool} size={34} />
        <View style={styles.headerCol}>
          <Text variant="h3" color="ink" numberOfLines={1}>
            {session.name}
          </Text>
          <View style={styles.statusLine}>
            <StatusDot status="run" live={status.status === 'ready' && timeline.length > 0} />
            <Text variant="secondary" color="ink3" numberOfLines={1}>
              {statusLabel} · {agentLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.ctaRow}>
        <Button label="Open terminal" icon="terminal" variant="primary" onPress={() => router.push(routes.terminal(id))} />
      </View>

      {canReply && (
        <View style={styles.replyRow}>
          <View style={styles.replyInput}>
            <Input
              value={reply}
              onChangeText={setReply}
              placeholder="Reply to agent…"
              leadingIcon="at"
              returnKeyType="send"
              onSubmitEditing={sendReply}
              blurOnSubmit={false}
            />
          </View>
          <IconButton
            icon="arrowUp"
            onPress={sendReply}
            disabled={reply.trim().length === 0}
            accessibilityLabel="Send reply"
          />
        </View>
      )}

      <TabBar tab={tab} onChange={setTab} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.space[8] }]}
      >
        {tab === 'stats' && (
          <View style={styles.card}>
            {stats.map((row) => (
              <FieldRow key={row.label} label={row.label} value={row.value} />
            ))}
          </View>
        )}

        {tab === 'timeline' &&
          (timeline.length ? (
            <View style={styles.timeline}>
              {timeline.map((t) => (
                <TimelineItem key={t.id} row={t} />
              ))}
            </View>
          ) : (
            <Empty label="No timeline events yet." />
          ))}

        {tab === 'prompts' &&
          (prompts.length ? (
            <View style={styles.timeline}>
              {prompts.map((t) => (
                <TimelineItem key={t.id} row={t} />
              ))}
            </View>
          ) : (
            <Empty label="No prompts received." />
          ))}

        {tab === 'docs' && <DocsTab docs={docs} />}
      </ScrollView>
    </View>
  );
}

function TimelineItem({ row }: { row: TimelineRow }): React.JSX.Element {
  return (
    <View style={styles.tlRow}>
      <View style={styles.tlGlyph}>
        <StatusGlyph kind={row.glyph} size={15} />
      </View>
      <View style={styles.tlBody}>
        <Text variant="body" color="ink" numberOfLines={3}>
          {row.message}
        </Text>
        <Text variant="secondary" color="ink3">
          {row.time}
        </Text>
      </View>
    </View>
  );
}

function DocsTab({ docs }: { docs: DocEntry[] }): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? docs.find((d) => d.id === openId) : undefined;

  if (open) {
    const content = open.content ?? '';
    return (
      <View style={styles.docViewerWrap}>
        <Pressable onPress={() => setOpenId(null)} accessibilityRole="button" style={styles.docBack}>
          <Text variant="label" color="brand">
            ‹ Docs
          </Text>
        </Pressable>
        {content ? (
          <DocsViewer content={content} title={open.title} serverKind={open.kind} />
        ) : (
          <Empty label={`"${open.title}" has no inline content (file: ${open.filePath}).`} />
        )}
      </View>
    );
  }

  if (!docs.length) return <Empty label="No documents attached." />;

  return (
    <View style={styles.card}>
      {docs.map((d) => (
        <Pressable
          key={d.id}
          onPress={() => setOpenId(d.id)}
          accessibilityRole="button"
          style={styles.docRow}
        >
          <StatusGlyph kind="todo" size={14} />
          <View style={styles.docCol}>
            <Text variant="body" color="ink" numberOfLines={1}>
              {d.title}
            </Text>
            <Text variant="secondary" color="ink3" numberOfLines={1}>
              {d.kind === 'diagram' ? 'Diagram' : 'Markdown'}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function TabBar({
  tab,
  onChange,
}: {
  tab: SessionDetailTab;
  onChange: (t: SessionDetailTab) => void;
}): React.JSX.Element {
  return (
    <View style={styles.tabBar}>
      {SESSION_DETAIL_TABS.map((t) => {
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

function Empty({ label }: { label: string }): React.JSX.Element {
  return (
    <View style={styles.emptyTab}>
      <Text variant="secondary" color="ink3" style={styles.centerHint}>
        {label}
      </Text>
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space[2],
  },
  centerHint: {
    textAlign: 'center',
    paddingHorizontal: theme.space[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: theme.space[3],
    paddingBottom: theme.space[2],
  },
  headerCol: {
    flex: 1,
    gap: 2,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  ctaRow: {
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[3],
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[3],
  },
  replyInput: {
    flex: 1,
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
    gap: theme.space[2],
    flexGrow: 1,
  },
  card: {
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    overflow: 'hidden',
  },
  timeline: {
    gap: theme.space[3],
    paddingVertical: theme.space[2],
  },
  tlRow: {
    flexDirection: 'row',
    gap: theme.space[3],
  },
  tlGlyph: {
    paddingTop: 2,
  },
  tlBody: {
    flex: 1,
    gap: 2,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
  docCol: {
    flex: 1,
    gap: 1,
  },
  docViewerWrap: {
    flex: 1,
    minHeight: 420,
    gap: theme.space[2],
  },
  docBack: {
    paddingVertical: theme.space[1],
  },
  emptyTab: {
    paddingVertical: theme.space[8],
    alignItems: 'center',
  },
}));
