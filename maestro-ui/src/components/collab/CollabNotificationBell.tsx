import React, { useEffect, useRef, useState } from 'react';
import {
  useCollabNotificationsStore,
  useUnreadCollabNotificationCount,
} from '../../stores/useCollabNotificationsStore';
import { openCollabNotification } from '../../notifications/collabNotificationNav';
import {
  ensureNotificationPermission,
  notificationPermission,
} from '../../notifications/desktopNotify';
import type { CollabNotification } from '../../notifications/collabNotificationTypes';

/** Relative "2m ago" style timestamp, coarse — good enough for an inbox row. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Bell + dropdown inbox for Phase 1 collab notifications. Drop into the collab
 * panel header. Shows an unread count, the recent inbox, per-level preference,
 * and a desktop-notifications opt-in.
 */
export function CollabNotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const unread = useUnreadCollabNotificationCount();
  const inbox = useCollabNotificationsStore((s) => s.inbox);
  const prefs = useCollabNotificationsStore((s) => s.prefs);
  const markAllRead = useCollabNotificationsStore((s) => s.markAllRead);
  const clearInbox = useCollabNotificationsStore((s) => s.clearInbox);
  const setLevel = useCollabNotificationsStore((s) => s.setLevel);
  const setDesktopEnabled = useCollabNotificationsStore((s) => s.setDesktopEnabled);

  // Close on outside-click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onRowClick = (n: CollabNotification) => {
    openCollabNotification(n);
    setOpen(false);
  };

  const onToggleDesktop = async () => {
    if (prefs.desktopEnabled) {
      setDesktopEnabled(false);
      return;
    }
    const perm = await ensureNotificationPermission();
    setDesktopEnabled(perm === 'granted');
  };

  const perm = notificationPermission();

  return (
    <div className="collab-notify-bell" ref={wrapRef}>
      <button
        type="button"
        className="collab-notify-bell__button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="collab-notify-bell__badge">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="collab-notify-panel" role="dialog" aria-label="Notifications">
          <div className="collab-notify-panel__head">
            <strong>Notifications</strong>
            <div className="collab-notify-panel__headActions">
              <button type="button" onClick={markAllRead} disabled={unread === 0}>
                Mark all read
              </button>
              <button type="button" onClick={clearInbox} disabled={inbox.length === 0}>
                Clear
              </button>
            </div>
          </div>

          <div className="collab-notify-panel__prefs">
            <label>
              <span>Notify me about</span>
              <select
                value={prefs.level}
                onChange={(e) => setLevel(e.target.value as 'mentions' | 'all')}
              >
                <option value="all">All messages in my spaces</option>
                <option value="mentions">Only @mentions</option>
              </select>
            </label>
            <label className="collab-notify-panel__toggle">
              <input
                type="checkbox"
                checked={prefs.desktopEnabled && perm === 'granted'}
                onChange={onToggleDesktop}
                disabled={perm === 'unsupported' || perm === 'denied'}
              />
              <span>
                Desktop notifications
                {perm === 'denied' && ' (blocked in browser)'}
                {perm === 'unsupported' && ' (unavailable)'}
              </span>
            </label>
          </div>

          <div className="collab-notify-panel__list">
            {inbox.length === 0 ? (
              <div className="collab-notify-panel__empty">You're all caught up.</div>
            ) : (
              inbox.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`collab-notify-row${n.read ? '' : ' collab-notify-row--unread'}`}
                  onClick={() => onRowClick(n)}
                >
                  <span className="collab-notify-row__icon" aria-hidden>
                    {n.isMention ? '📣' : '💬'}
                  </span>
                  <span className="collab-notify-row__main">
                    <span className="collab-notify-row__top">
                      <span className="collab-notify-row__author">{n.authorName}</span>
                      <span className="collab-notify-row__chan">
                        {n.channelName ? `#${n.channelName}` : ''}
                      </span>
                      <span className="collab-notify-row__time">{ago(n.timestamp)}</span>
                    </span>
                    <span className="collab-notify-row__preview">{n.preview}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
