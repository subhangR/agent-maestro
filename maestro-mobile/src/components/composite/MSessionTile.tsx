// MSessionTile — presentational session tile (the Atelier `.m-st`). Renders a
// `Session`'s agent avatar + name, the DERIVED UI status (StatusDot + label,
// via `toUiSessionStatus` — never raw `Session.status`, or the "needs input"
// state is lost), an optional linked-task summary line, a doc count, the trailing
// status glyph, and an expand caret. The whole title row is Pressable (opens the
// terminal).
//
// Data in, intents out. The status DOT pulses when `live`; the status LABEL reads
// the AA-safe `*Text` token; the GLYPH reads the canonical solid via StatusGlyph.
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import {
  toUiSessionStatus,
  toDisplayTool,
  UI_SESSION_STATUS_LABEL,
  type Session,
  type UiSessionStatus,
} from '@/domain';
import { type ColorToken, type GlyphKind, type StatusKey } from '@/theme';

import { AgentAvatar } from '../primitives/AgentAvatar';
import { StatusDot } from '../primitives/StatusDot';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Text } from '../primitives/Text';
import { IconButton } from '../controls/IconButton';
import { MiniCount } from './parts';

// UiSessionStatus → drawn glyph kind (run renders as the working glyph; wait as
// the needsInput glyph — the rest map 1:1 onto GlyphKind).
const UI_GLYPH: Record<UiSessionStatus, GlyphKind> = {
  spawning: 'spawning',
  idle: 'idle',
  working: 'working',
  run: 'working',
  wait: 'needsInput',
  completed: 'completed',
  failed: 'failed',
  stopped: 'stopped',
};

// UiSessionStatus → semantic status bucket (dot color + AA-safe label token).
const UI_STATUS_KEY: Record<UiSessionStatus, StatusKey> = {
  spawning: 'info',
  idle: 'idle',
  working: 'run',
  run: 'run',
  wait: 'wait',
  completed: 'run',
  failed: 'block',
  stopped: 'idle',
};

const STATUS_TEXT_TOKEN: Record<StatusKey, ColorToken> = {
  run: 'runText',
  wait: 'waitText',
  block: 'blockText',
  info: 'infoText',
  idle: 'idleText',
};

/** A linked-task summary line shown under the title (pre-resolved by Forge). */
export interface SessionTaskLine {
  title: string;
  glyph: GlyphKind;
}

export interface MSessionTileProps {
  session: Session;
  /** Number of attached docs (mini count). */
  docCount?: number;
  /** Number of spawned child sessions (count next to the collapse arrow). */
  childCount?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Live session — animates the status dot ping. */
  live?: boolean;
  /** Optional linked-task summary lines. */
  taskLines?: SessionTaskLine[];
  /** Selected/active highlight. */
  active?: boolean;
  /** Tap the title row — opens the terminal/detail. */
  onPress?: () => void;
  /** Tap the expand caret. */
  onExpand?: () => void;
}

export function MSessionTile({
  session,
  docCount = 0,
  childCount = 0,
  collapsed,
  onToggleCollapsed,
  live = false,
  taskLines,
  active = false,
  onPress,
  onExpand,
}: MSessionTileProps): React.JSX.Element {
  const ui = toUiSessionStatus({
    status: session.status,
    needsInput: session.needsInput ?? null,
    humanCompletedAt: session.humanCompletedAt,
    archivedAt: session.archivedAt,
  });
  const statusKey = UI_STATUS_KEY[ui];
  const glyphKind = UI_GLYPH[ui];
  const label = UI_SESSION_STATUS_LABEL[ui];
  const displayTool = toDisplayTool(session.teamMemberSnapshot?.agentTool ?? null);

  const hasKids = childCount > 0;
  const isCollapsed = collapsed ?? false;

  return (
    <View style={[styles.tile, active && styles.tileActive]}>
      <View style={styles.main}>
        <IconButton
          icon={hasKids && !isCollapsed ? 'chevronD' : 'chevronR'}
          onPress={onToggleCollapsed}
          disabled={!hasKids}
          accessibilityLabel="Toggle spawned sessions"
          size={28}
          iconSize={14}
        />
        {hasKids && (
          <Text variant="mono" color="ink3" style={styles.count}>
            {childCount}
          </Text>
        )}

        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole="button"
          accessibilityLabel={`Session: ${session.name}, ${label}`}
          style={styles.titleBtn}
        >
          <AgentAvatar kind={displayTool} size={30} />
          <View style={styles.titleCol}>
            <Text variant="title" color="ink" numberOfLines={1}>
              {session.name}
            </Text>
            <View style={styles.statusLine}>
              <StatusDot status={statusKey} live={live} />
              <Text variant="secondary" color={STATUS_TEXT_TOKEN[statusKey]} numberOfLines={1} style={styles.statusText}>
                {label}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.trail}>
          {docCount > 0 && <MiniCount icon="doc" count={docCount} />}
          <StatusGlyph kind={glyphKind} size={16} />
          {onExpand && (
            <IconButton icon="chevronD" onPress={onExpand} accessibilityLabel="Details" size={32} iconSize={15} />
          )}
        </View>
      </View>

      {taskLines && taskLines.length > 0 && (
        <View style={styles.taskLines}>
          {taskLines.map((tl, i) => (
            <View key={i} style={styles.taskLine}>
              <StatusGlyph kind={tl.glyph} size={13} />
              <Text variant="secondary" color="ink2" numberOfLines={1} style={styles.taskLineLabel}>
                {tl.title}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  tileActive: {
    borderColor: theme.colors.brand,
    backgroundColor: theme.colors.brandSoft,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[2],
  },
  count: {
    fontSize: 9,
    lineHeight: undefined,
    marginHorizontal: -2,
  },
  titleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  titleCol: {
    flex: 1,
    gap: 3,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  statusText: {
    fontSize: 12,
    lineHeight: undefined,
    flexShrink: 1,
  },
  trail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[1],
  },
  taskLines: {
    paddingHorizontal: theme.space[3],
    paddingBottom: theme.space[2],
    gap: theme.space[1],
  },
  taskLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
  },
  taskLineLabel: {
    flexShrink: 1,
  },
}));
