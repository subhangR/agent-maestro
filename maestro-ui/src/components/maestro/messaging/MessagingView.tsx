import React, { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { useMessagingStore } from "../../../stores/useMessagingStore";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import {
  Channel,
  Mentionable,
  MessageMention,
} from "../../../firebase/messagingTypes";
import { ChannelList } from "./ChannelList";
import { ChannelHeader } from "./ChannelHeader";
import { MessagesPane } from "./MessagesPane";
import { MessageComposer } from "./MessageComposer";
import { CreateChannelModal } from "./CreateChannelModal";

type Props = {
  space: CollabSpace;
  user: User | null;
  isMember: boolean;
  isOwner: boolean;
};

// Stable empty reference used as fallback. Returning a fresh `[]` from a
// Zustand selector breaks useSyncExternalStore equality and triggers an
// infinite re-render loop ("getSnapshot should be cached").
const EMPTY_CHANNELS: Channel[] = [];

export function MessagingView({ space, user, isMember, isOwner }: Props) {
  const channels = useMessagingStore(
    (s) => s.channelsBySpace[space.id] ?? EMPTY_CHANNELS,
  );
  const channelsLoading = useMessagingStore((s) => s.channelsLoading[space.id] ?? false);
  const activeChannelId = useMessagingStore((s) => s.activeChannelBySpace[space.id] ?? null);

  const subscribeToChannels = useMessagingStore((s) => s.subscribeToChannels);
  const unsubscribeFromChannels = useMessagingStore((s) => s.unsubscribeFromChannels);
  const selectChannel = useMessagingStore((s) => s.selectChannel);

  const subscribeToMessages = useMessagingStore((s) => s.subscribeToMessages);
  const unsubscribeFromMessages = useMessagingStore((s) => s.unsubscribeFromMessages);

  const messagesByChannel = useMessagingStore((s) => s.messagesByChannel);
  const messagesLoadingMap = useMessagingStore((s) => s.messagesLoading);
  const messagesHasMoreMap = useMessagingStore((s) => s.messagesHasMore);
  const messagesLoadingOlderMap = useMessagingStore((s) => s.messagesLoadingOlder);
  const pendingByChannel = useMessagingStore((s) => s.pendingByChannel);

  const sendMessage = useMessagingStore((s) => s.sendMessage);
  const editMessage = useMessagingStore((s) => s.editMessage);
  const softDeleteMessage = useMessagingStore((s) => s.softDeleteMessage);
  const loadOlder = useMessagingStore((s) => s.loadOlder);
  const retryPending = useMessagingStore((s) => s.retryPending);
  const dismissPending = useMessagingStore((s) => s.dismissPending);

  const [showCreate, setShowCreate] = useState(false);

  // @mention candidates: the space's human members (excluding self).
  // NOTE: agent mentionables (shared team members, kind: 'agent') would be
  // merged in here from the team-members vertical to enable @agent→invoke.
  const mentionables = useMemo<Mentionable[]>(() => {
    const members = Object.values(space.members ?? {});
    return members
      .filter((m) => m.uid !== user?.uid)
      .map((m) => ({
        id: m.uid,
        displayName: m.displayName || m.email || "member",
        kind: "member" as const,
        photoUrl: m.photoUrl,
        subtitle: m.role !== "member" ? m.role : m.email,
      }));
  }, [space.members, user?.uid]);

  // Subscribe to channels for this space
  useEffect(() => {
    if (!isMember) return;
    subscribeToChannels(space.id);
    return () => {
      unsubscribeFromChannels(space.id);
    };
  }, [space.id, isMember, subscribeToChannels, unsubscribeFromChannels]);

  // Subscribe to the active channel's messages
  useEffect(() => {
    if (!isMember || !activeChannelId) return;
    subscribeToMessages(space.id, activeChannelId);
    return () => {
      unsubscribeFromMessages(activeChannelId);
    };
  }, [
    space.id,
    activeChannelId,
    isMember,
    subscribeToMessages,
    unsubscribeFromMessages,
  ]);

  if (!isMember) {
    return (
      <div className="messagingRoot">
        <div className="messagingMain">
          <div className="messagingEmptyState">
            <div className="messagingEmptyStateTitle">Join this space to read messages</div>
            <div>Only members can see channels and post messages.</div>
          </div>
        </div>
      </div>
    );
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const messages = activeChannelId ? messagesByChannel[activeChannelId] ?? [] : [];
  const pending = activeChannelId ? pendingByChannel[activeChannelId] ?? [] : [];
  const messagesLoading = activeChannelId ? messagesLoadingMap[activeChannelId] ?? false : false;
  const hasMore = activeChannelId ? messagesHasMoreMap[activeChannelId] ?? false : false;
  const loadingOlder = activeChannelId
    ? messagesLoadingOlderMap[activeChannelId] ?? false
    : false;

  const handleSend = async (content: string, mentions: MessageMention[]) => {
    if (!user || !activeChannelId) return;
    await sendMessage(user, space.id, activeChannelId, content, mentions);
  };

  const handleEdit = async (messageId: string, content: string) => {
    if (!activeChannelId) return;
    await editMessage(space.id, activeChannelId, messageId, content);
  };

  const handleDelete = async (messageId: string) => {
    if (!activeChannelId) return;
    await softDeleteMessage(space.id, activeChannelId, messageId);
  };

  const handleLoadOlder = () => {
    if (!activeChannelId) return;
    void loadOlder(space.id, activeChannelId);
  };

  const handleRetry = (tempId: string) => {
    if (!user || !activeChannelId) return;
    void retryPending(user, space.id, activeChannelId, tempId);
  };

  const handleDismiss = (tempId: string) => {
    if (!activeChannelId) return;
    dismissPending(activeChannelId, tempId);
  };

  return (
    <div className="messagingRoot">
      <ChannelList
        channels={channels}
        loading={channelsLoading}
        activeChannelId={activeChannelId}
        onSelectChannel={(id) => selectChannel(space.id, id)}
        onRequestCreate={() => setShowCreate(true)}
        canCreate={isMember && Boolean(user)}
      />

      <div className="messagingMain">
        {activeChannel ? (
          <>
            <ChannelHeader channel={activeChannel} />
            <MessagesPane
              channelId={activeChannel.id}
              messages={messages}
              pending={pending}
              loading={messagesLoading}
              hasMore={hasMore}
              loadingOlder={loadingOlder}
              currentUid={user?.uid ?? null}
              isOwner={isOwner}
              onLoadOlder={handleLoadOlder}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRetryPending={handleRetry}
              onDismissPending={handleDismiss}
            />
            <MessageComposer
              channelId={activeChannel.id}
              channelName={activeChannel.name}
              disabled={!user}
              disabledReason={!user ? "Sign in to post messages." : undefined}
              mentionables={mentionables}
              onSend={handleSend}
            />
          </>
        ) : (
          <div className="messagingEmptyState">
            <div className="messagingEmptyStateTitle">
              {channelsLoading ? "Loading channels…" : "Select a channel"}
            </div>
            {!channelsLoading && channels.length === 0 && (
              <div>Create the first channel for this space.</div>
            )}
          </div>
        )}
      </div>

      {showCreate && user && (
        <CreateChannelModal
          user={user}
          spaceId={space.id}
          onClose={() => setShowCreate(false)}
          onCreated={(channelId) => selectChannel(space.id, channelId)}
        />
      )}
    </div>
  );
}
