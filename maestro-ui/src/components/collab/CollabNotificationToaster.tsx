import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  useCollabNotificationsStore,
} from '../../stores/useCollabNotificationsStore';
import type { CollabNotification } from '../../notifications/collabNotificationTypes';
import { openCollabNotification } from '../../notifications/collabNotificationNav';

const TOAST_TIMEOUT_MS = 6000;

/**
 * In-app toast surface for Phase 1 collab notifications. Mirrors
 * SpellNotificationToasts: renders the transient stack; every toast is also
 * kept in the store's persistent inbox. Mounted once in AppModals.
 */
export const CollabNotificationToaster = React.memo(function CollabNotificationToaster() {
  const toasts = useCollabNotificationsStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  const node = (
    <div className="collab-notify-stack" role="region" aria-label="Collab notifications">
      {toasts.map((t) => (
        <CollabToast key={t.id} toast={t} />
      ))}
    </div>
  );
  return createPortal(node, document.body);
});

function CollabToast({ toast }: { toast: CollabNotification }) {
  const dismissToast = useCollabNotificationsStore((s) => s.dismissToast);

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismissToast]);

  const channelLabel = toast.channelName ? `#${toast.channelName}` : 'a channel';
  const heading = toast.isMention
    ? `${toast.authorName} mentioned you`
    : `${toast.authorName} · ${channelLabel}`;

  return (
    <div
      className={`collab-notify-toast${toast.isMention ? ' collab-notify-toast--mention' : ''}`}
      role="status"
      aria-live="polite"
      onClick={() => {
        openCollabNotification(toast);
        dismissToast(toast.id);
      }}
    >
      <span className="collab-notify-toast__icon" aria-hidden>
        {toast.isMention ? '📣' : '💬'}
      </span>
      <div className="collab-notify-toast__body">
        <span className="collab-notify-toast__heading">{heading}</span>
        <span className="collab-notify-toast__msg">{toast.preview}</span>
        {toast.spaceName && (
          <span className="collab-notify-toast__meta">{toast.spaceName}</span>
        )}
      </div>
      <button
        type="button"
        className="collab-notify-toast__close"
        onClick={(e) => {
          e.stopPropagation();
          dismissToast(toast.id);
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
