import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format, isToday, isYesterday } from "date-fns";
import {
  Message,
  MessageAttachment,
  MessageMention,
  PendingMessage,
} from "../../../firebase/messagingTypes";
import { SpaceFilesClient, spaceFileToBlob } from "../../../firebase/SpaceFilesClient";
import { SpaceFile } from "../../../firebase/spaceShareTypes";
import { registerCollabTeardown } from "../../../firebase/collabTeardown";

/* ------------------------------------------------------------------ */
/*  Attachments                                                        */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentGlyph(mimeType: string): string {
  const mt = (mimeType || "").toLowerCase();
  if (mt.startsWith("image/")) return "🖼";
  if (mt.startsWith("audio/")) return "🎵";
  if (mt.startsWith("video/")) return "🎬";
  if (mt === "application/pdf") return "📕";
  return "📎";
}

/**
 * Small bounded cache of file-doc fetches so re-renders / repeat clicks on
 * the same attachment don't refetch its (potentially ~800KB) payload.
 * Failed fetches are evicted immediately so transient errors can be retried.
 */
const FILE_CACHE_MAX = 20;
const fileFetchCache = new Map<string, Promise<SpaceFile | null>>();

// On sign-out / account switch, drop cached payloads so a previous identity's
// file contents don't linger in memory.
registerCollabTeardown(() => fileFetchCache.clear());

function fetchSpaceFile(spaceId: string, fileId: string): Promise<SpaceFile | null> {
  const key = `${spaceId}/${fileId}`;
  const hit = fileFetchCache.get(key);
  if (hit) return hit;
  const promise = SpaceFilesClient.get(spaceId, fileId).catch((err) => {
    fileFetchCache.delete(key);
    throw err;
  });
  fileFetchCache.set(key, promise);
  if (fileFetchCache.size > FILE_CACHE_MAX) {
    const oldest = fileFetchCache.keys().next().value;
    if (oldest !== undefined) fileFetchCache.delete(oldest);
  }
  return promise;
}

/**
 * One attachment on a delivered message. File content is fetched lazily —
 * on click for downloads, and on first visibility for image previews. If the
 * underlying file doc was deleted, the chip degrades to a "no longer
 * available" note instead of a dead button.
 */
function AttachmentChip({
  spaceId,
  attachment,
  currentUid,
}: {
  spaceId: string;
  attachment: MessageAttachment;
  currentUid: string | null;
}) {
  const isImage = attachment.mimeType.toLowerCase().startsWith("image/");
  const [downloading, setDownloading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Lazy inline preview for images: fetch on first visibility only.
  useEffect(() => {
    if (!isImage || !spaceId) return;
    const el = rootRef.current;
    if (!el) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const file = await fetchSpaceFile(spaceId, attachment.fileId);
        if (cancelled) return;
        if (!file) {
          setMissing(true);
          return;
        }
        objectUrl = URL.createObjectURL(spaceFileToBlob(file));
        setPreviewUrl(objectUrl);
      } catch {
        // Preview is best-effort; a download click surfaces the real error.
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      void load();
      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, spaceId, attachment.fileId]);

  const handleDownload = async () => {
    if (downloading || missing || !spaceId) return;
    setDownloading(true);
    setError(null);
    try {
      const file = await fetchSpaceFile(spaceId, attachment.fileId);
      if (!file) {
        setMissing(true);
        return;
      }
      const url = URL.createObjectURL(spaceFileToBlob(file));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || attachment.name || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a beat to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (currentUid) {
        // Best-effort download tracking — never blocks the download itself.
        SpaceFilesClient.recordDownload(spaceId, attachment.fileId, currentUid).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[Messaging] recordDownload failed:", err);
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (missing) {
    return (
      <div
        ref={rootRef}
        className="messagingAttachChip messagingAttachChip--missing"
        role="note"
        aria-label={`Attachment ${attachment.name} is no longer available`}
      >
        <span className="messagingAttachChipIcon" aria-hidden="true">
          {attachmentGlyph(attachment.mimeType)}
        </span>
        <span className="messagingAttachChipName" title={attachment.name}>
          {attachment.name}
        </span>
        <span className="messagingAttachChipGone">file no longer available</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="messagingAttachment">
      {isImage && previewUrl && (
        <button
          type="button"
          className="messagingAttachPreviewBtn"
          onClick={() => void handleDownload()}
          disabled={downloading}
          aria-label={`Download image ${attachment.name} (${formatBytes(attachment.size)})`}
        >
          <img src={previewUrl} alt={attachment.name} className="messagingAttachPreview" />
        </button>
      )}
      <button
        type="button"
        className="messagingAttachChip"
        onClick={() => void handleDownload()}
        disabled={downloading || !spaceId}
        aria-busy={downloading}
        aria-label={`Download attachment ${attachment.name} (${formatBytes(attachment.size)})`}
      >
        <span className="messagingAttachChipIcon" aria-hidden="true">
          {attachmentGlyph(attachment.mimeType)}
        </span>
        <span className="messagingAttachChipName" title={attachment.name}>
          {attachment.name}
        </span>
        <span className="messagingAttachChipSize">
          {downloading ? "downloading…" : formatBytes(attachment.size)}
        </span>
      </button>
      {error && (
        <span className="messagingAttachError" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps `@mention` tokens found in plain-text children with a highlight span.
 * Only string children are processed so it composes safely inside markdown
 * output (paragraphs, list items, emphasis, …).
 */
function highlightMentions(
  children: React.ReactNode,
  mentions: MessageMention[],
): React.ReactNode {
  if (!mentions || mentions.length === 0) return children;
  const tokens = Array.from(
    new Set(mentions.map((m) => `@${m.displayName}`)),
  ).sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return children;
  const re = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "g");
  return React.Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    const parts = child.split(re);
    return parts.map((part, i) =>
      tokens.includes(part) ? (
        <span key={i} className="messagingMention">
          {part}
        </span>
      ) : (
        part
      ),
    );
  });
}

// Preserve single newlines (chat UX) outside of fenced code blocks by
// converting them into markdown hard breaks (trailing two spaces).
function preserveSoftBreaks(content: string): string {
  const lines = content.split("\n");
  let inCode = false;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      out.push(line);
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    const isLast = i === lines.length - 1;
    const nextEmpty = !isLast && lines[i + 1].trim() === "";
    if (!isLast && line.trim() !== "" && !nextEmpty) {
      out.push(line + "  ");
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

type Props = {
  message?: Message;
  pending?: PendingMessage;
  currentUid: string | null;
  isOwner: boolean;
  /** Grouped under the previous same-author message: hide avatar + header. */
  grouped?: boolean;
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  onRetry?: (tempId: string) => void;
  onDismiss?: (tempId: string) => void;
  /** Open a thread panel for this message. */
  onReply?: (messageId: string) => void;
};

function formatTimestamp(date: Date): string {
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday ${format(date, "h:mm a")}`;
  return format(date, "MMM d, h:mm a");
}

function authorInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className="messagingAvatar"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className="messagingAvatar messagingAvatarFallback">
      {authorInitials(name)}
    </div>
  );
}

export function MessageBubble({
  message,
  pending,
  currentUid,
  isOwner,
  grouped = false,
  onEdit,
  onDelete,
  onRetry,
  onDismiss,
  onReply,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(
        editRef.current.value.length,
        editRef.current.value.length,
      );
    }
  }, [editing]);

  // Pending bubble (optimistic / failed)
  if (pending) {
    const created = new Date(pending.createdAtMs);
    return (
      <div
        className={`messagingBubble ${
          pending.status === "failed" ? "messagingBubbleFailed" : "messagingBubblePending"
        }`}
      >
        <Avatar name={pending.authorDisplayName} photoUrl={pending.authorPhotoUrl} />
        <div className="messagingBubbleMain">
          <div className="messagingBubbleHeader">
            <span className="messagingBubbleAuthor">{pending.authorDisplayName}</span>
            <span className="messagingBubbleTime">{formatTimestamp(created)}</span>
            {pending.status === "sending" && (
              <span className="messagingBubblePendingTag">sending…</span>
            )}
          </div>
          {pending.content && (
            <div className="messagingBubbleContent messagingBubbleContentPlain">
              {highlightMentions(pending.content, pending.mentions ?? [])}
            </div>
          )}
          {(pending.attachments?.length ?? 0) > 0 && (
            <div className="messagingAttachmentList" aria-label="Attachments">
              {(pending.attachments ?? []).map((a) => (
                <span key={a.fileId} className="messagingAttachChip messagingAttachChip--static">
                  <span className="messagingAttachChipIcon" aria-hidden="true">
                    {attachmentGlyph(a.mimeType)}
                  </span>
                  <span className="messagingAttachChipName" title={a.name}>
                    {a.name}
                  </span>
                  <span className="messagingAttachChipSize">{formatBytes(a.size)}</span>
                </span>
              ))}
            </div>
          )}
          {pending.status === "failed" && (
            <div className="messagingBubbleFailedTag">
              <span>Failed to send{pending.error ? ` — ${pending.error}` : ""}</span>
              <button
                type="button"
                className="messagingBubbleActionBtn"
                onClick={() => onRetry?.(pending.tempId)}
              >
                Retry
              </button>
              <button
                type="button"
                className="messagingBubbleActionBtn messagingBubbleActionBtnDanger"
                onClick={() => onDismiss?.(pending.tempId)}
              >
                Discard
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!message) return null;

  const createdAt = message.createdAt?.toDate?.() ?? new Date();
  const isAuthor = currentUid != null && message.authorUid === currentUid;
  const isDeleted = Boolean(message.deletedAt);
  const wasEdited = Boolean(message.editedAt) && !isDeleted;
  const canEdit = isAuthor && !isDeleted;
  const canDelete = (isAuthor || isOwner) && !isDeleted;

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };

  const saveEdit = async () => {
    const v = draft.trim();
    if (!v || v === message.content) {
      cancelEdit();
      return;
    }
    if (!onEdit) return;
    setBusy(true);
    try {
      await onEdit(message.id, v);
      setEditing(false);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("Delete this message?")) return;
    setBusy(true);
    try {
      await onDelete(message.id);
    } finally {
      setBusy(false);
    }
  };

  const handleEditKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const mentions = message.mentions ?? [];
  const mdComponents = {
    a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p>{highlightMentions(children, mentions)}</p>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li>{highlightMentions(children, mentions)}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong>{highlightMentions(children, mentions)}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => (
      <em>{highlightMentions(children, mentions)}</em>
    ),
  };

  return (
    <div className={`messagingBubble ${grouped ? "messagingBubbleGrouped" : ""}`}>
      {grouped ? (
        <div className="messagingAvatarSpacer" aria-hidden="true" />
      ) : (
        <Avatar
          name={message.authorDisplayName}
          photoUrl={message.authorPhotoUrl}
        />
      )}
      <div className="messagingBubbleMain">
        {!grouped && (
          <div className="messagingBubbleHeader">
            <span className="messagingBubbleAuthor">{message.authorDisplayName}</span>
            <span className="messagingBubbleTime">{formatTimestamp(createdAt)}</span>
            {wasEdited && <span className="messagingBubbleEdited">(edited)</span>}
          </div>
        )}
        {grouped && wasEdited && (
          <span className="messagingBubbleEdited messagingBubbleEditedInline">(edited)</span>
        )}

        {isDeleted ? (
          <div className="messagingBubbleContent messagingBubbleDeleted">[deleted]</div>
        ) : editing ? (
          <div className="messagingEditForm">
            <textarea
              ref={editRef}
              className="messagingEditTextarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKey}
              disabled={busy}
            />
            <div className="messagingEditActions">
              <button
                type="button"
                className="collabSpaceButton collabSpaceButtonPrimary"
                onClick={() => void saveEdit()}
                disabled={busy || !draft.trim()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="collabSpaceTextButton"
                onClick={cancelEdit}
                disabled={busy}
              >
                Cancel
              </button>
              <span className="messagingEditHint">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <>
            {message.content && (
              <div className="messagingBubbleContent">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {preserveSoftBreaks(message.content)}
                </ReactMarkdown>
              </div>
            )}
            {(message.attachments?.length ?? 0) > 0 && (
              <div className="messagingAttachmentList" aria-label="Attachments">
                {message.attachments.map((a) => (
                  <AttachmentChip
                    key={a.fileId}
                    spaceId={message.spaceId}
                    attachment={a}
                    currentUid={currentUid}
                  />
                ))}
              </div>
            )}
            {message.replyCount > 0 && onReply && (
              <button
                type="button"
                className="messagingThreadReplyCount"
                onClick={() => onReply(message.id)}
              >
                {message.replyCount}{" "}
                {message.replyCount === 1 ? "reply" : "replies"}
              </button>
            )}
          </>
        )}
      </div>

      {!editing && (canEdit || canDelete || onReply) && (
        <div className="messagingBubbleActions">
          {onReply && !isDeleted && (
            <button
              type="button"
              className="messagingBubbleActionBtn"
              onClick={() => onReply(message.id)}
              title="Reply in thread"
              disabled={busy}
            >
              ↩
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className="messagingBubbleActionBtn"
              onClick={startEdit}
              title="Edit"
              disabled={busy}
            >
              ✎
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="messagingBubbleActionBtn messagingBubbleActionBtnDanger"
              onClick={() => void handleDelete()}
              title="Delete"
              disabled={busy}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
