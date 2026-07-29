import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { Message, MessageMention } from "../../../firebase/messagingTypes";
import { useMessagingStore } from "../../../stores/useMessagingStore";
import { MessageBubble } from "./MessageBubble";

type Props = {
  spaceId: string;
  channelId: string;
  parentMessage: Message;
  currentUid: string | null;
  isOwner: boolean;
  user: User | null;
  onClose: () => void;
  onEdit: (messageId: string, content: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
};

export function ThreadPanel({
  spaceId,
  channelId,
  parentMessage,
  currentUid,
  isOwner,
  user,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const subscribeToThread = useMessagingStore((s) => s.subscribeToThread);
  const unsubscribeFromThread = useMessagingStore((s) => s.unsubscribeFromThread);
  const sendReply = useMessagingStore((s) => s.sendReply);
  const threadMessages = useMessagingStore(
    (s) => s.threadMessagesByParent[parentMessage.id] ?? [],
  );
  const threadLoading = useMessagingStore(
    (s) => s.threadLoading[parentMessage.id] ?? false,
  );
  const threadError = useMessagingStore(
    (s) => s.threadError[parentMessage.id] ?? null,
  );

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    subscribeToThread(spaceId, channelId, parentMessage.id);
    return () => unsubscribeFromThread(parentMessage.id);
  }, [spaceId, channelId, parentMessage.id, subscribeToThread, unsubscribeFromThread]);

  // Scroll to bottom when replies arrive.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadMessages.length]);

  const handleSendReply = async () => {
    const content = replyText.trim();
    if (!content || !user) return;
    setSending(true);
    setReplyText("");
    try {
      await sendReply(user, spaceId, channelId, parentMessage.id, content, [] as MessageMention[]);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendReply();
    }
  };

  const replyCount = threadMessages.length;

  return (
    <div className="threadPanel">
      <div className="threadPanelHeader">
        <span className="threadPanelTitle">Thread</span>
        <button
          type="button"
          className="threadPanelClose"
          onClick={onClose}
          aria-label="Close thread"
        >
          ✕
        </button>
      </div>

      <div className="threadPanelScroll" ref={scrollRef}>
        <div className="threadPanelParent">
          <MessageBubble
            message={parentMessage}
            currentUid={currentUid}
            isOwner={isOwner}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>

        <div className="threadPanelDivider">
          <span>
            {replyCount === 0
              ? "No replies yet"
              : `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`}
          </span>
        </div>

        {threadLoading && replyCount === 0 && (
          <div className="messagingEmptyState" style={{ padding: "16px" }}>
            Loading replies…
          </div>
        )}

        {threadError && (
          <div className="collabSpaceError" role="alert" style={{ margin: "8px 16px" }}>
            {threadError}
          </div>
        )}

        {threadMessages.map((m, i) => {
          const prev = threadMessages[i - 1];
          const grouped =
            prev != null &&
            prev.authorUid === m.authorUid &&
            !prev.deletedAt &&
            !m.deletedAt;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              currentUid={currentUid}
              isOwner={isOwner}
              grouped={grouped}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );
        })}
      </div>

      <div className="threadPanelComposer">
        {user ? (
          <>
            <textarea
              className="messagingComposerTextarea threadPanelTextarea"
              placeholder="Reply in thread…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKey}
              disabled={sending}
              rows={1}
            />
            <button
              type="button"
              className="messagingComposerSendBtn"
              onClick={() => void handleSendReply()}
              disabled={!replyText.trim() || sending}
            >
              {sending ? "…" : "Reply"}
            </button>
          </>
        ) : (
          <div className="messagingComposerDisabled">Sign in to reply.</div>
        )}
      </div>
    </div>
  );
}
