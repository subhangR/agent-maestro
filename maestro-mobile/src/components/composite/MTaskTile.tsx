// MTaskTile — presentational task tile (the Atelier `.m-tt`). Renders a `Task`'s
// title, status glyph (toggle complete), priority tag, `#id` + subtask count, pin,
// assignee avatars and a doc count, with a trailing run affordance + expand caret.
//
// Data in, intents out: editable fields are NOT stored locally (Forge owns the
// store + optimistic edits) — the tile renders `task.*` and emits callbacks. Only
// the pure view affordances (`collapsed`, `detailOpen`) are local state. Status →
// glyph is direct: TaskStatus ⊂ GlyphKind. Recursion (subtask trees) is the
// feature layer's concern; this tile renders ONE node + a `childCount`.
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { Task } from '@/domain';
import { fontFamily } from '@/theme';

import { Avatar, type AvatarData } from '../primitives/Avatar';
import { Icon } from '../primitives/Icon';
import { StatusGlyph } from '../primitives/StatusGlyph';
import { Text } from '../primitives/Text';
import { IconButton } from '../controls/IconButton';
import { Tag, type TagTone } from '../controls/Tag';
import { MiniCount } from './parts';

const PRIO_TONE: Record<Task['priority'], TagTone> = { high: 'high', medium: 'med', low: 'low' };
const PRIO_LABEL: Record<Task['priority'], string> = { high: 'high', medium: 'med', low: 'low' };

export interface MTaskTileProps {
  task: Task;
  /** Pre-resolved assignee avatar bubbles (Forge resolves member → tint). */
  assignees?: AvatarData[];
  /** Number of attached docs (shown as a mini count). */
  docCount?: number;
  /** Number of direct subtasks (shown next to the collapse arrow + `#id`). */
  childCount?: number;
  /** Subtask tree collapsed state (controlled when provided; else local). */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Selected/active highlight. */
  active?: boolean;
  /** Tap the title/body — opens the task detail. */
  onPress?: () => void;
  /** Tap the status glyph — toggle complete. */
  onToggleComplete?: () => void;
  /** Tap the run affordance. */
  onRun?: () => void;
}

export function MTaskTile({
  task,
  assignees = [],
  docCount = 0,
  childCount = 0,
  collapsed,
  onToggleCollapsed,
  active = false,
  onPress,
  onToggleComplete,
  onRun,
}: MTaskTileProps): React.JSX.Element {
  const hasKids = childCount > 0;
  const done = task.status === 'completed';
  const isCollapsed = collapsed ?? true;

  return (
    <View style={[styles.tile, active && styles.tileActive]}>
      <View style={styles.main}>
        <IconButton
          icon={hasKids && !isCollapsed ? 'chevronD' : 'chevronR'}
          onPress={onToggleCollapsed}
          disabled={!hasKids}
          accessibilityLabel="Toggle subtasks"
          size={28}
          iconSize={14}
        />
        {hasKids && (
          <Text variant="mono" color="ink3" style={styles.count}>
            {childCount}
          </Text>
        )}
        <Pressable
          onPress={onToggleComplete}
          disabled={!onToggleComplete}
          accessibilityRole="checkbox"
          accessibilityLabel="Toggle complete"
          accessibilityState={{ checked: done }}
          hitSlop={12}
          style={styles.glyphBtn}
        >
          <StatusGlyph kind={task.status} size={18} />
        </Pressable>

        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessibilityRole="button"
          accessibilityLabel={`Task: ${task.title}`}
          style={styles.titleBtn}
        >
          <Text variant="title" color={done ? 'ink4' : 'ink'} numberOfLines={2} style={done && styles.struck}>
            {task.pinned ? '★  ' : ''}
            {task.title}
          </Text>
          <View style={styles.subRow}>
            <Tag label={PRIO_LABEL[task.priority]} tone={PRIO_TONE[task.priority]} />
            <Text variant="mono" color="ink3" style={styles.id}>
              #{task.id}
              {hasKids ? ` · ${childCount}` : ''}
            </Text>
            {assignees.length > 0 &&
              assignees.slice(0, 3).map((a, i) => <Avatar key={i} data={a} size={18} />)}
            {docCount > 0 && <MiniCount icon="doc" count={docCount} />}
          </View>
        </Pressable>

        <View style={styles.trail}>
          {onRun && (
            <IconButton icon="play" onPress={onRun} accessibilityLabel="Run task" size={32} iconSize={14} />
          )}
          {onPress && <Icon name="chevronD" size={15} color="ink4" />}
        </View>
      </View>
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
    alignItems: 'flex-start',
    gap: theme.space[1],
    paddingVertical: theme.space[2],
    paddingHorizontal: theme.space[2],
  },
  count: {
    fontSize: 9,
    lineHeight: undefined,
    fontFamily: fontFamily.monoSemiBold,
    marginTop: 8,
    marginHorizontal: -2,
  },
  glyphBtn: {
    marginTop: 1,
    paddingHorizontal: 2,
  },
  titleBtn: {
    flex: 1,
    gap: 5,
    paddingTop: 1,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  subRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space[2],
  },
  id: {
    fontSize: 11,
    lineHeight: undefined,
  },
  trail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
}));
