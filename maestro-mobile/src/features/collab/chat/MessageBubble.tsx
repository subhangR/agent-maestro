// src/features/collab/chat/MessageBubble.tsx — single message row.
// Shows author avatar (initial-based), name, time, content, edit/delete for own
// messages, and pending (sending/failed) status with retry/dismiss actions.
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Avatar, IconButton, Text, type AvatarData } from '@/components';
import { useTheme } from '@/theme';
import type { Message, MessageMention, PendingMessage } from '@/services/collab';
import { MESSAGE_MAX_LENGTH } from '@/services/collab';

// ── Time formatter ───────────────────────────────────────────────────────────
function formatTime(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── Initial + tint from display name ─────────────────────────────────────────
const TINTS = ['#6B7FC7', '#5BAA7A', '#B26A2B', '#9966AA', '#C0795A', '#4A9FC0'];
function avatarFromName(name: string): AvatarData {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const color = '#fff';
  const idx = name.charCodeAt(0) % TINTS.length;
  const bg = TINTS[idx]!;
  return { initial, color, bg };
}

// ── Inline mention rendering ──────────────────────────────────────────────────
function renderContent(
  content: string,
  mentions: MessageMention[],
  isDeleted: boolean,
  theme: ReturnType<typeof useTheme>,
): React.JSX.Element {
  if (isDeleted) {
    return (
      <Text variant="secondary" color="ink4" style={{ fontStyle: 'italic' }}>
        Message deleted
      </Text>
    );
  }

  if (mentions.length === 0) {
    return (
      <Text variant="body" color="ink" style={{ lineHeight: 20 }}>
        {content}
      </Text>
    );
  }

  // Split content around @mention tokens and highlight them
  const parts: React.JSX.Element[] = [];
  let remaining = content;
  let key = 0;

  for (const mention of mentions) {
    const token = `@${mention.displayName}`;
    const idx = remaining.indexOf(token);
    if (idx === -1) continue;
    if (idx > 0) {
      parts.push(
        <Text key={key++} variant="body" color="ink" style={{ lineHeight: 20 }}>
          {remaining.slice(0, idx)}
        </Text>,
      );
    }
    parts.push(
      <Text
        key={key++}
        variant="body"
        color="brand"
        style={{ lineHeight: 20, fontWeight: '600', backgroundColor: theme.colors.brandSoft, borderRadius: 4 }}
      >
        {token}
      </Text>,
    );
    remaining = remaining.slice(idx + token.length);
  }

  if (remaining.length > 0) {
    parts.push(
      <Text key={key++} variant="body" color="ink" style={{ lineHeight: 20 }}>
        {remaining}
      </Text>,
    );
  }

  return <Text variant="body" color="ink" style={{ lineHeight: 20 }}>{parts}</Text>;
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
export interface MessageBubbleProps {
  message: Message;
  currentUid: string;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => void;
}

export function MessageBubble({ message, currentUid, onEdit, onDelete }: MessageBubbleProps): React.JSX.Element {
  const theme = useTheme();
  const isOwn = message.authorUid === currentUid;
  const isDeleted = message.deletedAtMs != null && message.deletedAtMs > 0;
  const isEdited = message.editedAtMs != null && message.editedAtMs > 0 && !isDeleted;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const avatarData = avatarFromName(message.authorDisplayName);

  function startEdit() {
    setDraft(message.content);
    setEditing(true);
  }

  async function commitEdit() {
    if (draft.trim().length === 0 || draft.trim() === message.content) {
      setEditing(false);
      return;
    }
    await onEdit(message.id, draft.trim());
    setEditing(false);
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.space[2],
        paddingHorizontal: theme.space[4],
        paddingVertical: 6,
      }}
    >
      {/* Avatar */}
      <View style={{ marginTop: 2 }}>
        <Avatar data={avatarData} size={28} />
      </View>

      {/* Content column */}
      <View style={{ flex: 1, gap: 2 }}>
        {/* Header row: name + time */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space[2] }}>
          <Text variant="label" color="ink" style={{ fontWeight: '600' }} numberOfLines={1}>
            {message.authorDisplayName}
          </Text>
          <Text variant="secondary" color="ink4" style={{ fontSize: 11 }}>
            {formatTime(message.createdAtMs)}
          </Text>
          {isEdited && (
            <Text variant="secondary" color="ink4" style={{ fontSize: 11, fontStyle: 'italic' }}>
              (edited)
            </Text>
          )}
        </View>

        {/* Body or inline editor */}
        {editing ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.colors.brand,
              borderRadius: theme.radii.sm,
              backgroundColor: theme.colors.brandSoft,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <TextInput
              autoFocus
              multiline
              maxLength={MESSAGE_MAX_LENGTH}
              value={draft}
              onChangeText={setDraft}
              style={{
                color: theme.colors.ink,
                fontSize: 14,
                lineHeight: 20,
                minHeight: 36,
              }}
              placeholderTextColor={theme.colors.ink4}
            />
            <View style={{ flexDirection: 'row', gap: theme.space[2], marginTop: 6, justifyContent: 'flex-end' }}>
              <Pressable
                onPress={() => setEditing(false)}
                style={{ paddingHorizontal: 10, paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Cancel edit"
              >
                <Text variant="label" color="ink3">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={commitEdit}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: theme.radii.sm,
                  backgroundColor: theme.colors.ink,
                }}
                accessibilityRole="button"
                accessibilityLabel="Save edit"
              >
                <Text variant="label" color="paper">Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          renderContent(message.content, message.mentions, isDeleted, theme)
        )}
      </View>

      {/* Own-message actions (edit + delete), hidden when deleted or editing */}
      {isOwn && !isDeleted && !editing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <IconButton
            icon="pen"
            size={28}
            iconSize={13}
            onPress={startEdit}
            accessibilityLabel="Edit message"
          />
          <IconButton
            icon="x"
            size={28}
            iconSize={13}
            onPress={() => onDelete(message.id)}
            accessibilityLabel="Delete message"
          />
        </View>
      )}
    </View>
  );
}

// ── PendingBubble ─────────────────────────────────────────────────────────────
export interface PendingBubbleProps {
  pending: PendingMessage;
  onRetry: (tempId: string) => void;
  onDismiss: (tempId: string) => void;
}

export function PendingBubble({ pending, onRetry, onDismiss }: PendingBubbleProps): React.JSX.Element {
  const theme = useTheme();
  const avatarData = avatarFromName(pending.authorDisplayName);
  const isFailed = pending.status === 'failed';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.space[2],
        paddingHorizontal: theme.space[4],
        paddingVertical: 6,
        opacity: isFailed ? 1 : 0.5,
      }}
    >
      <View style={{ marginTop: 2 }}>
        <Avatar data={avatarData} size={28} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space[2] }}>
          <Text variant="label" color="ink" style={{ fontWeight: '600' }}>
            {pending.authorDisplayName}
          </Text>
          <Text variant="secondary" color={isFailed ? 'blockText' : 'ink4'} style={{ fontSize: 11 }}>
            {isFailed ? 'Failed to send' : 'Sending…'}
          </Text>
        </View>
        <Text variant="body" color={isFailed ? 'ink3' : 'ink'} style={{ lineHeight: 20 }}>
          {pending.content}
        </Text>
        {isFailed && (
          <View style={{ flexDirection: 'row', gap: theme.space[2], marginTop: 4 }}>
            <Pressable
              onPress={() => onRetry(pending.tempId)}
              accessibilityRole="button"
              accessibilityLabel="Retry sending"
              style={({ pressed }) => ({
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: theme.radii.sm,
                borderWidth: 1,
                borderColor: theme.colors.line2,
                backgroundColor: pressed ? theme.colors.hover : theme.colors.card,
              })}
            >
              <Text variant="label" color="ink2">Retry</Text>
            </Pressable>
            <Pressable
              onPress={() => onDismiss(pending.tempId)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss failed message"
              style={({ pressed }) => ({
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: theme.radii.sm,
                backgroundColor: pressed ? theme.colors.hover : 'transparent',
              })}
            >
              <Text variant="label" color="ink4">Dismiss</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
