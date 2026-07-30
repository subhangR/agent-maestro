import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { User } from "firebase/auth";
import {
  MESSAGE_MAX_LENGTH,
  Mentionable,
  MessageAttachment,
  MessageMention,
} from "../../../firebase/messagingTypes";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import { encodeFileToBase64 } from "../../../firebase/SpaceFilesClient";
import { SPACE_FILE_MAX_RAW_BYTES } from "../../../firebase/spaceShareTypes";
import { extractImageFiles, dataTransferHasFiles } from "../../../utils/clipboardImages";
import { Icon } from "../redesign/kit";

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

  // Attachments are staged LOCALLY (the picked File objects) and only uploaded
  // when the message is actually sent — abandoning a draft (channel switch,
  // close) must never leave orphaned file docs in the space.
  const [staged, setStaged] = useState<{ id: string; file: File }[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionStartRef = useRef<number>(-1);
  const [activeIndex, setActiveIndex] = useState(0);

  const canAttach = Boolean(spaceId && user);

  // Reset draft when switching channels. Staged attachments are local File
  // objects only — nothing has been uploaded yet, so dropping them is free.
  useEffect(() => {
    setValue("");
    setPicked([]);
    setMentionQuery(null);
    setStaged([]);
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
    (trimmed.length > 0 || staged.length > 0) &&
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

  /**
   * Stage files for upload-on-send, enforcing the per-message count and size
   * limits. Shared by the file picker and by image paste/drop so both routes
   * obey exactly the same rules and surface errors the same way.
   */
  const stageFiles = (files: File[]) => {
    if (files.length === 0 || !spaceId || !user) return;

    const room = MAX_ATTACHMENTS_PER_MESSAGE - staged.length;
    if (room <= 0) {
      setAttachError(`A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`);
      return;
    }

    // Accept what fits; the last rejection is what the user sees, so a partly
    // accepted batch still explains why the rest did not make it.
    const accepted: { id: string; file: File }[] = [];
    let rejection: string | null = null;
    for (const file of files) {
      if (accepted.length >= room) {
        rejection = `A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`;
        break;
      }
      if (file.size === 0) {
        rejection = `"${file.name}" is empty — there's nothing to attach.`;
        continue;
      }
      if (file.size > SPACE_FILE_MAX_RAW_BYTES) {
        rejection = `"${file.name}" is ${formatKb(file.size)} — attachments must be ${MAX_ATTACHMENT_KB} KB or smaller.`;
        continue;
      }
      accepted.push({ id: `staged_${Date.now()}_${staged.length + accepted.length}`, file });
    }

    setAttachError(rejection);
    if (accepted.length > 0) setStaged((prev) => [...prev, ...accepted]);
    ref.current?.focus();
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same files
    if (files.length === 0) return;
    stageFiles(files);
  };

  // Pasting or dropping a screenshot stages it as a real Collab attachment
  // rather than injecting a maestro-server path the way the session composers
  // do: a channel is read from other machines, where an absolute local path
  // resolves to nothing. Non-image pastes fall through to the browser, so plain
  // text still pastes natively.
  const claimImages = (data: DataTransfer | null, e: React.SyntheticEvent) => {
    if (sending || !canAttach) return;
    const images = extractImageFiles(data, { renameAll: true });
    if (images.length === 0) return;
    e.preventDefault();
    stageFiles(images);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    claimImages(e.clipboardData, e);
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    claimImages(e.dataTransfer, e);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (sending || !canAttach) return;
    if (dataTransferHasFiles(e.dataTransfer)) e.preventDefault();
  };

  const removeAttachment = (id: string) => {
    // Purely local — nothing has been uploaded yet.
    setStaged((prev) => prev.filter((s) => s.id !== id));
  };

  // ─── Send ─────────────────────────────────────────────────────────

  const send = async () => {
    if (!canSend) return;
    const content = trimmed;
    const mentions = picked.filter((m) => content.includes(`@${m.displayName}`));
    const toUpload = staged;

    // Upload staged attachments now (tagged as chat attachments so they don't
    // surface in the Files tab). If any upload fails, keep the whole draft so
    // nothing is lost and no half-referenced message goes out.
    let outgoing: MessageAttachment[] = [];
    if (toUpload.length > 0 && spaceId && user) {
      setAttaching(true);
      setAttachError(null);
      try {
        for (const s of toUpload) {
          const data = await encodeFileToBase64(s.file);
          const fileId = await SpaceShareClient.shareFile(user, spaceId, {
            name: s.file.name,
            mimeType: s.file.type || "application/octet-stream",
            size: s.file.size,
            data,
            caption: null,
            origin: "chat-attachment",
          });
          outgoing.push({
            fileId,
            name: s.file.name,
            mimeType: s.file.type || "application/octet-stream",
            size: s.file.size,
          });
        }
      } catch (err: any) {
        setAttachError(err?.message ?? "Failed to upload an attachment. Try again.");
        setAttaching(false);
        return;
      }
      setAttaching(false);
    }

    setSending(true);
    setValue("");
    setPicked([]);
    setMentionQuery(null);
    setStaged([]);
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
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
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

      {(staged.length > 0 || attachError) && (
        <div className="messagingComposerAttachments">
          {staged.map((s) => (
            <span key={s.id} className="messagingAttachChip messagingAttachChip--pending">
              <span className="messagingAttachChipName" title={s.file.name}>
                {s.file.name}
              </span>
              <span className="messagingAttachChipSize">{formatKb(s.file.size)}</span>
              <button
                type="button"
                className="messagingAttachChipRemove"
                aria-label={`Remove attachment ${s.file.name}`}
                onClick={() => removeAttachment(s.id)}
                disabled={sending || attaching}
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

      <div className="messagingComposerFooter">
        <button
          type="button"
          className={`messagingAttachBtn ${attaching ? "messagingAttachBtn--busy" : ""} ${!canAttach ? "messagingAttachBtn--disabled" : ""}`}
          title={
            canAttach
              ? `Attach any file (max ${MAX_ATTACHMENT_KB} KB)`
              : "Sign in to attach files"
          }
          aria-label={attaching ? "Uploading attachment" : "Attach any file"}
          aria-busy={attaching}
          onClick={openFilePicker}
          disabled={!canAttach || attaching || sending}
        >
          {attaching ? (
            <span className="messagingAttachSpinner" aria-hidden="true" />
          ) : (
            <Icon name="paperclip" size={13} sw={1.5} />
          )}
          <span>{attaching ? "Uploading…" : "Attach file"}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="messagingAttachInput"
          onChange={(e) => void handleFilePicked(e)}
          aria-label="Choose files to attach"
          tabIndex={-1}
        />
        <div className="messagingComposerHint">
          {tooLong
            ? `Message too long (${value.length}/${MESSAGE_MAX_LENGTH})`
            : "Enter to send · Shift+Enter for newline"}
        </div>
      </div>
    </div>
  );
}
