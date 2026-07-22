// src/features/collab/chat/MessagesPane.tsx — paginated message list.
// Renders confirmed messages + pending optimistic messages. "Load older"
// is triggered by a header button (shown when hasMore). Empty/loading states handled.
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, View, type ListRenderItem } from 'react-native';

import { Text } from '@/components';
import { useTheme } from '@/theme';
import type { Message, PendingMessage } from '@/services/collab';
import { MessageBubble, PendingBubble } from './MessageBubble';

type ListItem =
  | { kind: 'message'; data: Message }
  | { kind: 'pending'; data: PendingMessage };

function buildItems(messages: Message[], pending: PendingMessage[]): ListItem[] {
  const items: ListItem[] = messages.map((m) => ({ kind: 'message', data: m }));
  for (const p of pending) {
    items.push({ kind: 'pending', data: p });
  }
  return items;
}

export interface MessagesPaneProps {
  spaceId: string;
  channelId: string;
  messages: Message[];
  pending: PendingMessage[];
  hasMore: boolean;
  loadingOlder: boolean;
  currentUid: string;
  onLoadOlder: () => void;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
}

export function MessagesPane({
  messages,
  pending,
  hasMore,
  loadingOlder,
  currentUid,
  onLoadOlder,
  onEditMessage,
  onDeleteMessage,
  onRetryPending,
  onDismissPending,
}: MessagesPaneProps): React.JSX.Element {
  const theme = useTheme();
  const items = buildItems(messages, pending);

  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => {
      if (item.kind === 'message') {
        return (
          <MessageBubble
            message={item.data}
            currentUid={currentUid}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
          />
        );
      }
      return (
        <PendingBubble
          pending={item.data}
          onRetry={onRetryPending}
          onDismiss={onDismissPending}
        />
      );
    },
    [currentUid, onEditMessage, onDeleteMessage, onRetryPending, onDismissPending],
  );

  const keyExtractor = useCallback((item: ListItem) => {
    return item.kind === 'message' ? item.data.id : `pending:${item.data.tempId}`;
  }, []);

  // "Load older" header — shown at top of the inverted list (which renders at bottom of screen)
  const ListFooterComponent = hasMore ? (
    <View style={{ alignItems: 'center', paddingVertical: theme.space[3] }}>
      {loadingOlder ? (
        <ActivityIndicator size="small" color={theme.colors.ink4} />
      ) : (
        <Pressable
          onPress={onLoadOlder}
          accessibilityRole="button"
          accessibilityLabel="Load older messages"
          style={({ pressed }) => ({
            paddingHorizontal: theme.space[4],
            paddingVertical: theme.space[2],
            borderRadius: theme.radii.pill,
            borderWidth: 1,
            borderColor: theme.colors.line,
            backgroundColor: pressed ? theme.colors.hover : theme.colors.card,
          })}
        >
          <Text variant="label" color="ink3">Load older messages</Text>
        </Pressable>
      )}
    </View>
  ) : null;

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
        <Text variant="secondary" color="ink4">
          No messages yet. Say hello!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      inverted
      // FlatList inverted: newest at bottom. We reverse the data so index 0 = newest.
      // Actually data is ascending (oldest→newest) and inverted flips display.
      // With inverted=true, item[0] renders at the bottom (correct for chat).
      contentContainerStyle={{ paddingVertical: theme.space[2] }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={ListFooterComponent}
      // onEndReached fires when user scrolls to the TOP of the inverted list (= oldest msgs)
      onEndReached={hasMore && !loadingOlder ? onLoadOlder : undefined}
      onEndReachedThreshold={0.3}
    />
  );
}
