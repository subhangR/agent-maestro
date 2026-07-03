import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MESSAGE_MAX_LENGTH,
  Mentionable,
  MessageMention,
} from "../../../firebase/messagingTypes";

type Props = {
  channelId: string;
  channelName: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Members + agents that can be @mentioned in this space. */
  mentionables?: Mentionable[];
  onSend: (content: string, mentions: MessageMention[]) => Promise<void>;
};

const MENTION_MAX_QUERY = 30;

/**
 * Finds an in-progress @mention immediately before the caret. The `@` must sit
 * at the start of input or follow whitespace (so emails don't trigger it).
 */
function findMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const upto = text.slice(0, caret);
  const match = /(^|\s)@([^@\n]{0,30})$/.exec(upto);
  if (!match) return null;
  const query = match[2];
  if (query.length > MENTION_MAX_QUERY) return null;
  const start = caret - query.length - 1; // index of the `@`
  return { start, query };
}

export function MessageComposer({
  channelId,
  channelName,
  disabled,
  disabledReason,
  mentionables = [],
  onSend,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Mentions the user has explicitly picked; reconciled against text on send.
  const [picked, setPicked] = useState<MessageMention[]>([]);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionStartRef = useRef<number>(-1);
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset draft when switching channels
  useEffect(() => {
    setValue("");
    setPicked([]);
    setMentionQuery(null);
  }, [channelId]);

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.trim().toLowerCase();
    const list = q
      ? mentionables.filter((m) => m.displayName.toLowerCase().includes(q))
      : mentionables;
    return list.slice(0, 8);
  }, [mentionQuery, mentionables]);

  const popupOpen = mentionQuery != null && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [mentionQuery]);

  const trimmed = value.trim();
  const tooLong = value.length > MESSAGE_MAX_LENGTH;
  const canSend = !disabled && !sending && trimmed.length > 0 && !tooLong;

  const refreshMentionState = (text: string, caret: number) => {
    const found = findMentionQuery(text, caret);
    if (found && mentionables.length > 0) {
      setMentionQuery(found.query);
      mentionStartRef.current = found.start;
    } else {
      setMentionQuery(null);
      mentionStartRef.current = -1;
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);
    refreshMentionState(text, e.target.selectionStart ?? text.length);
  };

  const selectSuggestion = (m: Mentionable) => {
    const start = mentionStartRef.current;
    if (start < 0) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const token = `@${m.displayName}`;
    const next = `${before}${token} ${after}`;
    setValue(next);
    setPicked((prev) =>
      prev.some((p) => p.id === m.id && p.displayName === m.displayName)
        ? prev
        : [...prev, { id: m.id, displayName: m.displayName, kind: m.kind }],
    );
    setMentionQuery(null);
    mentionStartRef.current = -1;
    // Restore caret after the inserted token + trailing space.
    const nextCaret = before.length + token.length + 1;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const send = async () => {
    if (!canSend) return;
    const content = trimmed;
    const mentions = picked.filter((m) => content.includes(`@${m.displayName}`));
    setSending(true);
    setValue("");
    setPicked([]);
    setMentionQuery(null);
    try {
      await onSend(content, mentions);
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const choice = suggestions[activeIndex];
        if (choice) selectSuggestion(choice);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        mentionStartRef.current = -1;
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // Re-evaluate mention state when the caret moves (arrow keys/click).
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    refreshMentionState(el.value, el.selectionStart ?? el.value.length);
  };

  const openMentionPicker = () => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const needsSpace = caret > 0 && !/\s/.test(value[caret - 1]);
    const insert = `${needsSpace ? " " : ""}@`;
    const next = value.slice(0, caret) + insert + value.slice(caret);
    setValue(next);
    const nextCaret = caret + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      refreshMentionState(next, nextCaret);
    });
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
      <div className="messagingComposerToolbar">
        <button
          type="button"
          className="messagingComposerIconBtn"
          title="Attach file (coming soon)"
          aria-label="Attach file"
          disabled
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 7.5l-4 4a2 2 0 1 1-2.8-2.8l5-5a3.2 3.2 0 0 1 4.5 4.5l-5.5 5.5a4.6 4.6 0 0 1-6.5-6.5l5-5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="messagingComposerIconBtn"
          title="Mention someone"
          aria-label="Mention someone"
          onClick={openMentionPicker}
          disabled={mentionables.length === 0}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>@</span>
        </button>
        <button
          type="button"
          className="messagingComposerIconBtn"
          title="Emoji (coming soon)"
          aria-label="Emoji"
          disabled
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" />
            <circle cx="6" cy="7" r="0.6" fill="currentColor" />
            <circle cx="10" cy="7" r="0.6" fill="currentColor" />
            <path d="M5.5 10c.7 1 1.5 1.5 2.5 1.5s1.8-.5 2.5-1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="messagingComposerRow">
        {popupOpen && (
          <div className="messagingMentionPopup" role="listbox">
            {suggestions.map((m, i) => (
              <button
                key={`${m.kind}:${m.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                className={`messagingMentionOption ${
                  i === activeIndex ? "messagingMentionOptionActive" : ""
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                // onMouseDown (not onClick) so the textarea doesn't blur first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(m);
                }}
              >
                <span className="messagingMentionOptionName">
                  {m.displayName}
                </span>
                {m.kind === "agent" && (
                  <span className="messagingMentionOptionKind">agent</span>
                )}
                {m.subtitle && (
                  <span className="messagingMentionOptionSub">{m.subtitle}</span>
                )}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          className="messagingComposerTextarea"
          rows={1}
          placeholder={`Message #${channelName}`}
          value={value}
          onChange={onChange}
          onKeyDown={handleKey}
          onSelect={handleSelect}
          onClick={handleSelect}
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
