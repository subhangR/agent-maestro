import React, { useEffect, useLayoutEffect, useRef } from "react";
import { Message, PendingMessage } from "../../../firebase/messagingTypes";
import { MessageBubble } from "./MessageBubble";

type Props = {
  channelId: string;
  messages: Message[];
  pending: PendingMessage[];
  loading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  currentUid: string | null;
  isOwner: boolean;
  onLoadOlder: () => void;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onRetryPending: (tempId: string) => void;
  onDismissPending: (tempId: string) => void;
};

export function MessagesPane({
  channelId,
  messages,
  pending,
  loading,
  hasMore,
  loadingOlder,
  currentUid,
  isOwner,
  onLoadOlder,
  onEdit,
  onDelete,
  onRetryPending,
  onDismissPending,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastChannelRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastPendingCountRef = useRef<number>(0);
  const wasNearBottomRef = useRef<boolean>(true);

  const totalCount = messages.length + pending.length;

  // Track whether the user is near the bottom, so we know whether to auto-scroll on new messages.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasNearBottomRef.current = distance < 100;
  };

  // Scroll to bottom when channel switches, or when a new message arrives
  // and the user was already near the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const channelChanged = lastChannelRef.current !== channelId;
    const lastMsgId = messages[messages.length - 1]?.id ?? null;
    const newMessageArrived = lastMsgId !== null && lastMsgId !== lastMessageIdRef.current;
    const newPendingArrived = pending.length > lastPendingCountRef.current;

    if (channelChanged) {
      el.scrollTop = el.scrollHeight;
      wasNearBottomRef.current = true;
    } else if ((newMessageArrived || newPendingArrived) && wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }

    lastChannelRef.current = channelId;
    lastMessageIdRef.current = lastMsgId;
    lastPendingCountRef.current = pending.length;
  }, [channelId, messages, pending.length]);

  // Reset scroll-state when channel changes, before render
  useEffect(() => {
    wasNearBottomRef.current = true;
  }, [channelId]);

  if (loading && messages.length === 0 && pending.length === 0) {
    return (
      <div className="messagingPane">
        <div className="messagingEmptyState">
          <div className="messagingEmptyStateTitle">Loading messages…</div>
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="messagingPane">
        <div className="messagingEmptyState">
          <div className="messagingEmptyStateTitle">No messages yet</div>
          <div>Be the first to say something.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="messagingPane" ref={scrollRef} onScroll={handleScroll}>
      <div className="messagingPaneInner">
        {hasMore && (
          <div className="messagingLoadOlderRow">
            <button
              type="button"
              className="messagingLoadOlderBtn"
              onClick={onLoadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            currentUid={currentUid}
            isOwner={isOwner}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}

        {pending.map((p) => (
          <MessageBubble
            key={p.tempId}
            pending={p}
            currentUid={currentUid}
            isOwner={isOwner}
            onRetry={onRetryPending}
            onDismiss={onDismissPending}
          />
        ))}
      </div>
    </div>
  );
}
