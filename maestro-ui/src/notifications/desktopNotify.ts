/**
 * Thin wrapper over the browser Notification API for Phase 1.
 *
 * This is NOT Web Push — it only fires while the app is running (it works even
 * when the tab is backgrounded/unfocused, but not when the tab is closed).
 * True push (service worker + FCM) is Phase 2. Every call is guarded so it is a
 * no-op in environments without Notification (e.g. jsdom tests, some webviews).
 */

export function canUseDesktopNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!canUseDesktopNotifications()) return 'unsupported';
  return Notification.permission;
}

/** Prompts for permission if not yet decided. Safe to call repeatedly. */
export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUseDesktopNotifications()) return 'unsupported';
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }
  return Notification.permission;
}

export interface DesktopNotifyOptions {
  title: string;
  body: string;
  /** Collapses repeats (e.g. one channel's burst) into a single banner. */
  tag?: string;
  onClick?: () => void;
}

export function showDesktopNotification(opts: DesktopNotifyOptions): void {
  if (!canUseDesktopNotifications() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(opts.title, { body: opts.body, tag: opts.tag });
    if (opts.onClick) {
      n.onclick = () => {
        try {
          window.focus();
          opts.onClick?.();
        } finally {
          n.close();
        }
      };
    }
  } catch {
    // best-effort: some webviews throw on construction
  }
}
