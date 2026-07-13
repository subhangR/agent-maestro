import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  useSpellNotificationsStore,
  type SpellNotification,
} from '../../stores/useSpellNotificationsStore';
import { useMaestroStore } from '../../stores/useMaestroStore';

const TOAST_TIMEOUT_MS = 6000;

const LEVEL_ICON: Record<SpellNotification['level'], string> = {
  info: '🔔',
  success: '✅',
  warn: '⚠️',
};

/**
 * SpellNotificationToasts — the in-app delivery surface for notify-channel
 * rules (C3). Renders the transient toast stack; every toast is also kept in
 * the store's persistent history. Mounted once in AppModals next to UndoToast.
 */
export const SpellNotificationToasts = React.memo(function SpellNotificationToasts() {
  const toasts = useSpellNotificationsStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  const node = (
    <div className="spell-notify-stack" role="region" aria-label="Spell notifications">
      {toasts.map((t) => <NotifyToast key={t.id} toast={t} />)}
    </div>
  );
  return createPortal(node, document.body);
});

function NotifyToast({ toast }: { toast: SpellNotification }) {
  const dismissToast = useSpellNotificationsStore((s) => s.dismissToast);
  const sessionName = useMaestroStore((s) =>
    toast.sessionId ? s.sessions[toast.sessionId]?.name ?? null : null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(toast.id), TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, dismissToast]);

  return (
    <div
      className={`spell-notify-toast spell-notify-toast--${toast.level}`}
      role="status"
      aria-live="polite"
    >
      <span className="spell-notify-toast__icon" aria-hidden>{LEVEL_ICON[toast.level]}</span>
      <div className="spell-notify-toast__body">
        <span className="spell-notify-toast__msg">{toast.message}</span>
        {sessionName && <span className="spell-notify-toast__meta">{sessionName}</span>}
      </div>
      <button
        type="button"
        className="spell-notify-toast__close"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
      >×</button>
    </div>
  );
}
