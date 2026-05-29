import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MESSAGE_MAX_LENGTH } from "../../../firebase/messagingTypes";

type Props = {
  channelId: string;
  channelName: string;
  disabled?: boolean;
  disabledReason?: string;
  onSend: (content: string) => Promise<void>;
};

export function MessageComposer({
  channelId,
  channelName,
  disabled,
  disabledReason,
  onSend,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Reset draft when switching channels
  useEffect(() => {
    setValue("");
  }, [channelId]);

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const trimmed = value.trim();
  const tooLong = value.length > MESSAGE_MAX_LENGTH;
  const canSend = !disabled && !sending && trimmed.length > 0 && !tooLong;

  const send = async () => {
    if (!canSend) return;
    const content = trimmed;
    setSending(true);
    setValue("");
    try {
      await onSend(content);
    } finally {
      setSending(false);
      // Refocus after send
      ref.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (disabled) {
    return (
      <div className="messagingComposer">
        <div className="messagingComposerDisabled">
          {disabledReason ?? "You don't have permission to post here."}
        </div>
      </div>
    );
  }

  return (
    <div className="messagingComposer">
      <div className="messagingComposerRow">
        <textarea
          ref={ref}
          className="messagingComposerTextarea"
          rows={1}
          placeholder={`Message #${channelName}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          disabled={sending}
        />
        <button
          type="button"
          className="messagingComposerSendBtn"
          onClick={() => void send()}
          disabled={!canSend}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      <div className="messagingComposerHint">
        {tooLong
          ? `Message too long (${value.length}/${MESSAGE_MAX_LENGTH})`
          : "Enter to send · Shift+Enter for newline"}
      </div>
    </div>
  );
}
