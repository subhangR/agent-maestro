// src/features/collab/SpaceScreen.tsx — full chat view for a Collab Space.
//
// Layout (top → bottom):
//   Header: back + space name + "Manage" placeholder
//   ChannelBar: horizontal channel switcher + "+" to create
//   MessagesPane: paginated message list (flex: 1)
//   MessageComposer: pinned above keyboard
//
// Subscribes to: space (for name + members), channels (for bar), messages (for
// the active channel). All subscriptions are set up / torn down in useEffect.
// KeyboardAvoidingView wraps the bottom half so the composer lifts on keyboard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Text } from '@/components';
import { SpacesClient, type CollabSpace } from '@/services/collab';
import { currentUser } from '@/services/firebaseAuth';
import { useFirebaseAuth } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';
import {
  useMessagingStore,
  selectChannels,
  selectActiveChannelId,
  selectMessages,
  selectPending,
  selectHasMore,
  selectLoadingOlder,
} from '@/state/collab/messagingStore';

import { ChannelBar } from './chat/ChannelBar';
import { MessagesPane } from './chat/MessagesPane';
import { MessageComposer } from './chat/MessageComposer';
import { CreateChannelSheet } from './chat/CreateChannelSheet';

export function SpaceScreen({ spaceId }: { spaceId: string }): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useFirebaseAuth();

  // ── Space subscription ────────────────────────────────────────────────────
  const [space, setSpace] = useState<CollabSpace | null>(null);
  useEffect(() => {
    if (!spaceId) return undefined;
    return SpacesClient.subscribeToSpace(spaceId, setSpace);
  }, [spaceId]);

  // ── Store selectors ───────────────────────────────────────────────────────
  const channels = useMessagingStore(selectChannels(spaceId));
  const activeChannelId = useMessagingStore(selectActiveChannelId(spaceId));

  const messages = useMessagingStore(
    activeChannelId ? selectMessages(spaceId, activeChannelId) : () => [],
  );
  const pending = useMessagingStore(
    activeChannelId ? selectPending(spaceId, activeChannelId) : () => [],
  );
  const hasMore = useMessagingStore(
    activeChannelId ? selectHasMore(spaceId, activeChannelId) : () => false,
  );
  const loadingOlder = useMessagingStore(
    activeChannelId ? selectLoadingOlder(spaceId, activeChannelId) : () => false,
  );

  const store = useMessagingStore;

  // ── Subscribe channels on mount ───────────────────────────────────────────
  useEffect(() => {
    const unsub = useMessagingStore.getState().subscribeChannels(spaceId);
    return unsub;
  }, [spaceId]);

  // ── Subscribe messages when active channel changes ─────────────────────────
  const prevChannelRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeChannelId) return undefined;
    if (prevChannelRef.current === activeChannelId) return undefined;
    prevChannelRef.current = activeChannelId;
    const unsub = useMessagingStore.getState().subscribeMessages(spaceId, activeChannelId);
    return unsub;
  }, [spaceId, activeChannelId]);

  // ── Sheet state ───────────────────────────────────────────────────────────
  const [showCreateChannel, setShowCreateChannel] = useState(false);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSelectChannel = useCallback(
    (channelId: string) => {
      store.getState().selectChannel(spaceId, channelId);
    },
    [spaceId],
  );

  const handleChannelCreated = useCallback(
    (channelId: string) => {
      store.getState().selectChannel(spaceId, channelId);
    },
    [spaceId],
  );

  const handleLoadOlder = useCallback(() => {
    if (!activeChannelId) return;
    store.getState().loadOlder(spaceId, activeChannelId);
  }, [spaceId, activeChannelId]);

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!activeChannelId) return;
      await store.getState().editMessage(spaceId, activeChannelId, messageId, content);
    },
    [spaceId, activeChannelId],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!activeChannelId) return;
      store.getState().softDeleteMessage(spaceId, activeChannelId, messageId);
    },
    [spaceId, activeChannelId],
  );

  const handleRetryPending = useCallback(
    (tempId: string) => {
      if (!activeChannelId) return;
      const fbUser = currentUser();
      if (!fbUser) return;
      store.getState().retryPending(fbUser, spaceId, activeChannelId, tempId);
    },
    [spaceId, activeChannelId],
  );

  const handleDismissPending = useCallback(
    (tempId: string) => {
      if (!activeChannelId) return;
      store.getState().dismissPending(spaceId, activeChannelId, tempId);
    },
    [spaceId, activeChannelId],
  );

  const handleSend = useCallback(
    async (
      content: string,
      mentions: import('@/services/collab').MessageMention[],
      attachments: import('@/services/collab').MessageAttachment[],
    ) => {
      if (!activeChannelId) return;
      const fbUser = currentUser();
      if (!fbUser) return;
      await store.getState().send(fbUser, spaceId, activeChannelId, content, mentions, attachments);
    },
    [spaceId, activeChannelId],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const fbUser = currentUser();
  const currentUid = user?.uid ?? fbUser?.uid ?? '';

  // Find active channel name for the header eyebrow
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.paper, paddingTop: insets.top }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.line,
          backgroundColor: theme.colors.surface,
          gap: theme.space[1],
        }}
      >
        {/* Back button placeholder — lead wires navigation */}
        <IconButton
          icon="chevronL"
          size={36}
          iconSize={18}
          accessibilityLabel="Back"
          onPress={() => { /* lead wires this to navigation.goBack() */ }}
        />
        <View style={{ flex: 1 }}>
          <Text variant="h2" color="ink" numberOfLines={1}>
            {space?.name ?? 'Space'}
          </Text>
          {activeChannel && (
            <Text variant="secondary" color="ink3" numberOfLines={1} style={{ fontSize: 12 }}>
              #{activeChannel.name}
            </Text>
          )}
        </View>
        {/* "Manage" button — LEAD INTEGRATION POINT: replace onPress to open MembersSheet */}
        <IconButton
          icon="users"
          size={36}
          iconSize={17}
          accessibilityLabel="Manage space"
          onPress={() => { /* LEAD: wire to MembersSheet */ }}
        />
      </View>

      {/* ── Channel bar ────────────────────────────────────────────────── */}
      <ChannelBar
        channels={channels}
        activeChannelId={activeChannelId}
        onSelect={handleSelectChannel}
        onCreate={() => setShowCreateChannel(true)}
      />

      {/* ── Messages + Composer wrapped in KAV ─────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        {activeChannelId ? (
          <MessagesPane
            spaceId={spaceId}
            channelId={activeChannelId}
            messages={messages}
            pending={pending}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
            currentUid={currentUid}
            onLoadOlder={handleLoadOlder}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onRetryPending={handleRetryPending}
            onDismissPending={handleDismissPending}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="secondary" color="ink4">
              {channels.length === 0 ? 'Loading channels…' : 'Select a channel to start chatting.'}
            </Text>
          </View>
        )}

        {/* Composer — only render when signed in and a channel is active */}
        {activeChannelId && fbUser && (
          <MessageComposer
            spaceId={spaceId}
            channelId={activeChannelId}
            space={space}
            user={fbUser}
            onSend={handleSend}
          />
        )}

        {/* Safe-area padding at bottom */}
        <View style={{ height: insets.bottom }} />
      </KeyboardAvoidingView>

      {/* ── Create Channel Sheet ─────────────────────────────────────────── */}
      {fbUser && (
        <CreateChannelSheet
          visible={showCreateChannel}
          spaceId={spaceId}
          user={fbUser}
          onCreated={handleChannelCreated}
          onClose={() => setShowCreateChannel(false)}
        />
      )}
    </View>
  );
}
