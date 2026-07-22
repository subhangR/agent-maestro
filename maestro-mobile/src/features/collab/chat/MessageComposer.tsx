// src/features/collab/chat/MessageComposer.tsx — message input pinned at bottom.
// Multi-line TextInput, send button, @mention autocomplete over space members.
// Calls store.send on submit. Attachment button is present but stubbed.
import { useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

import { Avatar, Icon, IconButton, Text, type AvatarData } from '@/components';
import { useTheme } from '@/theme';
import type { CollabSpace, Mentionable, MessageAttachment, MessageMention } from '@/services/collab';
import { MESSAGE_MAX_LENGTH } from '@/services/collab';
import { fontFamily } from '@/theme';

// ── Build mentionables from space members ────────────────────────────────────
function buildMentionables(space: CollabSpace | null, currentUid: string): Mentionable[] {
  if (!space) return [];
  return Object.values(space.members)
    .filter((m) => m.uid !== currentUid)
    .map((m) => ({
      id: m.uid,
      displayName: m.displayName ?? m.email ?? m.uid,
      kind: 'member' as const,
      photoUrl: m.photoUrl,
      subtitle: m.email,
    }));
}

// ── Initial-based avatar for mention suggestions ──────────────────────────────
const TINTS = ['#6B7FC7', '#5BAA7A', '#B26A2B', '#9966AA', '#C0795A', '#4A9FC0'];
function avatarFromName(name: string): AvatarData {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  const idx = name.charCodeAt(0) % TINTS.length;
  return { initial, color: '#fff', bg: TINTS[idx]! };
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MessageComposerProps {
  spaceId: string;
  channelId: string;
  space: CollabSpace | null;
  user: FirebaseAuthTypes.User;
  onSend: (
    content: string,
    mentions: MessageMention[],
    attachments: MessageAttachment[],
  ) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MessageComposer({ space, user, onSend }: MessageComposerProps): React.JSX.Element {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [resolvedMentions, setResolvedMentions] = useState<MessageMention[]>([]);

  const mentionables = buildMentionables(space, user.uid);

  // Filter mentionables by current @-query
  const suggestions =
    mentionQuery !== null
      ? mentionables.filter((m) =>
          m.displayName.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
      : [];

  // Detect @-trigger as user types
  function handleChangeText(value: string) {
    setText(value);

    // Find the last @ in the text to open autocomplete
    const atIdx = value.lastIndexOf('@');
    if (atIdx !== -1) {
      const after = value.slice(atIdx + 1);
      // Only show if no space after @
      if (!after.includes(' ') && !after.includes('\n')) {
        setMentionQuery(after);
        return;
      }
    }
    setMentionQuery(null);
  }

  function pickMention(mentionable: Mentionable) {
    // Replace the @query in text with @displayName + space
    const atIdx = text.lastIndexOf('@');
    const newText = text.slice(0, atIdx) + `@${mentionable.displayName} `;
    setText(newText);
    setMentionQuery(null);

    const mention: MessageMention = {
      id: mentionable.id,
      displayName: mentionable.displayName,
      kind: mentionable.kind,
    };
    setResolvedMentions((prev) => {
      // Deduplicate by id
      const exists = prev.some((m) => m.id === mention.id);
      return exists ? prev : [...prev, mention];
    });

    inputRef.current?.focus();
  }

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;

    // Only keep mentions that actually appear in the text
    const activeMentions = resolvedMentions.filter((m) => text.includes(`@${m.displayName}`));

    setSending(true);
    try {
      await onSend(content, activeMentions, []);
      setText('');
      setResolvedMentions([]);
      setMentionQuery(null);
    } finally {
      setSending(false);
    }
  }

  const canSend = text.trim().length > 0 && !sending;
  const remaining = MESSAGE_MAX_LENGTH - text.length;
  const nearLimit = remaining < 200;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.colors.line,
        backgroundColor: theme.colors.surface,
      }}
    >
      {/* Mention suggestions dropdown */}
      {suggestions.length > 0 && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.line,
            backgroundColor: theme.colors.card,
            maxHeight: 180,
          }}
        >
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pickMention(item)}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${item.displayName}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space[2],
                  paddingHorizontal: theme.space[4],
                  paddingVertical: 10,
                  backgroundColor: pressed ? theme.colors.hover : 'transparent',
                })}
              >
                <Avatar data={avatarFromName(item.displayName)} size={24} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" color="ink" numberOfLines={1}>
                    {item.displayName}
                  </Text>
                  {item.subtitle && (
                    <Text variant="secondary" color="ink4" numberOfLines={1} style={{ fontSize: 11 }}>
                      {item.subtitle}
                    </Text>
                  )}
                </View>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Input row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.space[2],
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
        }}
      >
        {/* Attachment stub */}
        <IconButton
          icon="paperclip"
          size={36}
          iconSize={17}
          accessibilityLabel="Add attachment"
          onPress={() => { /* stub — attachments not yet implemented */ }}
        />

        {/* Text input */}
        <View
          style={{
            flex: 1,
            borderWidth: 1,
            borderRadius: theme.radii.md,
            borderColor: theme.colors.line2,
            backgroundColor: theme.colors.card,
            paddingHorizontal: 12,
            paddingVertical: 8,
            minHeight: 40,
            maxHeight: 120,
          }}
        >
          <TextInput
            ref={inputRef}
            multiline
            maxLength={MESSAGE_MAX_LENGTH}
            value={text}
            onChangeText={handleChangeText}
            placeholder="Message…"
            placeholderTextColor={theme.colors.ink4}
            style={{
              fontFamily: fontFamily.uiRegular,
              fontSize: 14,
              color: theme.colors.ink,
              lineHeight: 20,
              // Prevent default margin on Android
              padding: 0,
            }}
            accessibilityLabel="Message input"
          />
        </View>

        {/* Send button */}
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canSend
              ? pressed
                ? theme.colors.brand2
                : theme.colors.ink
              : theme.colors.line,
          })}
        >
          <Icon name="arrowUp" size={17} color={canSend ? 'paper' : 'ink4'} />
        </Pressable>
      </View>

      {/* Character counter near limit */}
      {nearLimit && (
        <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[1] }}>
          <Text
            variant="secondary"
            color={remaining < 0 ? 'blockText' : 'ink3'}
            style={{ fontSize: 11 }}
          >
            {remaining} characters remaining
          </Text>
        </View>
      )}
    </View>
  );
}
