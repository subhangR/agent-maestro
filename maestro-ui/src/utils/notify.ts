/**
 * Neutral in-app notification wrapper.
 *
 * The app has exactly ONE toaster. It lives in `useSpellNotificationsStore`
 * (host: components/spells/SpellNotificationToasts, already mounted in
 * AppModals) purely because spells were its first caller — the store itself is
 * generic: `sessionId`/`spellId`/`ruleId` are all optional and the WebSocket
 * `notify:*` relay in useMaestroStore already pushes message+level only.
 *
 * Non-spell surfaces (clipboard copy/paste feedback, uploads, …) go through
 * this wrapper so they don't have to import a spell-named store, and so we
 * never grow a second toaster.
 */
import { useSpellNotificationsStore } from '../stores/useSpellNotificationsStore';
import type { SpellNotifyLevel } from '../app/types/maestro';

export type NotifyLevel = SpellNotifyLevel;

/** Show a transient toast (also recorded in notification history). Returns its id. */
export function notifyUser(
  message: string,
  level: NotifyLevel = 'info',
  sessionId?: string | null,
): string {
  return useSpellNotificationsStore.getState().notify({ message, level, sessionId });
}

/** Dismiss a toast early — used to replace a progress toast with its outcome. */
export function dismissNotice(id: string | null | undefined): void {
  if (!id) return;
  useSpellNotificationsStore.getState().dismissToast(id);
}
