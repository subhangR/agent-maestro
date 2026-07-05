import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { User } from "firebase/auth";
import {
  MESSAGE_MAX_LENGTH,
  Mentionable,
  MessageAttachment,
  MessageMention,
} from "../../../firebase/messagingTypes";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import { SpaceFilesClient, encodeFileToBase64 } from "../../../firebase/SpaceFilesClient";
import { SPACE_FILE_MAX_RAW_BYTES } from "../../../firebase/spaceShareTypes";

type Props = {
  channelId: string;
  channelName: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Members + agents that can be @mentioned in this space. */
  mentionables?: Mentionable[];
  /** Space the channel belongs to — required for file attachments. */
  spaceId?: string;
  /** Signed-in user — required for file attachments. */
  user?: User | null;
  onSend: (
    content: string,
    mentions: MessageMention[],
    attachments: MessageAttachment[],
  ) => Promise<void>;
};

const MENTION_MAX_QUERY = 30;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_ATTACHMENT_KB = Math.floor(SPACE_FILE_MAX_RAW_BYTES / 1024);

function formatKb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  spaceId,
  user,
  onSend,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mentions the user has explicitly picked; reconciled against text on send.
  const [picked, setPicked] = useState<MessageMention[]>([]);

  // Attachments already uploaded to the space's files collection, waiting to
  // ride along with the next send. Removable until the message goes out.
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionStartRef = useRef<number>(-1);
  const [activeIndex, setActiveIndex] = useState(0);

  const canAttach = Boolean(spaceId && user);

  // Reset draft when switching channels
  useEffect(() => {
    setValue("");
    setPicked([]);
    setMentionQuery(null);
    setAttachments([]);
    setAttachError(null);
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
  const canSend =
    !disabled &&
    !sending &&
    !attaching &&
    (trimmed.length > 0 || attachments.length > 0) &&
    !tooLong;

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

  // ─── Attachments ──────────────────────────────────────────────────

  const openFilePicker = () => {
    setAttachError(null);
    fileInputRef.current?.click();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !spaceId || !user) return;
    if (attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setAttachError(`A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`);
      return;
    }
    if (file.size > SPACE_FILE_MAX_RAW_BYTES) {
      setAttachError(
        `"${file.name}" is ${formatKb(file.size)} — attachments must be ${MAX_ATTACHMENT_KB} KB or smaller.`,
      );
      return;
    }
    setAttaching(true);
    setAttachError(null);
    try {
      const data = await encodeFileToBase64(file);
      // The file is shared into the space's files collection; the message
      // only carries a lightweight reference to it.
      const fileId = await SpaceShareClient.shareFile(user, spaceId, {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data,
        caption: null,
      });
      setAttachments((prev) => [
        ...prev,
        {
          fileId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        },
      ]);
    } catch (err: any) {
      setAttachError(err?.message ?? "Failed to attach the file. Try again.");
    } finally {
      setAttaching(false);
      ref.current?.focus();
    }
  };

  const removeAttachment = (fileId: string) => {
    setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));
    // The file doc was pre-uploaded for this message only — clean it up so it
    // doesn't linger in the space's Files tab. Best-effort: the chip is gone
    // either way, and the uploader can still delete it from Files manually.
    if (spaceId) {
      SpaceFilesClient.delete(spaceId, fileId).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[Messaging] failed to clean up removed attachment:", err);
      });
    }
  };

  // ─── Send ─────────────────────────────────────────────────────────

  const send = async () => {
    if (!canSend) return;
    const content = trimmed;
    const mentions = picked.filter((m) => content.includes(`@${m.displayName}`));
    const outgoing = attachments;
    setSending(true);
    setValue("");
    setPicked([]);
    setMentionQuery(null);
    setAttachments([]);
    setAttachError(null);
    try {
      await onSend(content, mentions, outgoing);
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
          className={`messagingComposerIconBtn ${attaching ? "messagingComposerIconBtn--busy" : ""}`}
          title={
            canAttach
              ? `Attach file (max ${MAX_ATTACHMENT_KB} KB)`
              : "Sign in to attach files"
          }
          aria-label={attaching ? "Uploading attachment" : "Attach file"}
          aria-busy={attaching}
          onClick={openFilePicker}
          disabled={!canAttach || attaching || sending}
        >
          {attaching ? (
            <span className="messagingAttachSpinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M11 7.5l-4 4a2 2 0 1 1-2.8-2.8l5-5a3.2 3.2 0 0 1 4.5 4.5l-5.5 5.5a4.6 4.6 0 0 1-6.5-6.5l5-5" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="messagingAttachInput"
          onChange={(e) => void handleFilePicked(e)}
          aria-label="Choose a file to attach"
          tabIndex={-1}
        />
      </div>

      {(attachments.length > 0 || attachError) && (
        <div className="messagingComposerAttachments">
          {attachments.map((a) => (
            <span key={a.fileId} className="messagingAttachChip messagingAttachChip--pending">
              <span className="messagingAttachChipName" title={a.name}>
                {a.name}
              </span>
              <span className="messagingAttachChipSize">{formatKb(a.size)}</span>
              <button
                type="button"
                className="messagingAttachChipRemove"
                aria-label={`Remove attachment ${a.name}`}
                onClick={() => removeAttachment(a.fileId)}
                disabled={sending}
              >
                ×
              </button>
            </span>
          ))}
          {attachError && (
            <span className="messagingAttachError" role="alert">
              {attachError}
            </span>
          )}
        </div>
      )}

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
          : attaching
            ? "Uploading attachment…"
            : "Enter to send · Shift+Enter for newline"}
      </div>
    </div>
  );
}
