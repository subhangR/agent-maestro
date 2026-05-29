import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format, isToday, isYesterday } from "date-fns";
import { Message, PendingMessage } from "../../../firebase/messagingTypes";

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
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  onRetry?: (tempId: string) => void;
  onDismiss?: (tempId: string) => void;
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
  onEdit,
  onDelete,
  onRetry,
  onDismiss,
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
          <div className="messagingBubbleContent messagingBubbleContentPlain">
            {pending.content}
          </div>
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

  return (
    <div className="messagingBubble">
      <Avatar
        name={message.authorDisplayName}
        photoUrl={message.authorPhotoUrl}
      />
      <div className="messagingBubbleMain">
        <div className="messagingBubbleHeader">
          <span className="messagingBubbleAuthor">{message.authorDisplayName}</span>
          <span className="messagingBubbleTime">{formatTimestamp(createdAt)}</span>
          {wasEdited && <span className="messagingBubbleEdited">(edited)</span>}
        </div>

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
          <div className="messagingBubbleContent">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {preserveSoftBreaks(message.content)}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {!editing && (canEdit || canDelete) && (
        <div className="messagingBubbleActions">
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
