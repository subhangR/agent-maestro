// AppState reconnect driver.
//
// iOS/Android suspend sockets in the background; they can die without a clean
// `onclose`. On foreground (`active`) we force a fresh entity-sync connection.
// PTY re-attach on foreground is Relay's policy (lazy attach-on-open), not ours.

import { AppState, type AppStateStatus } from 'react-native';
import type { EntitySyncClient } from '../types';

/**
 * Wire AppState → entity-sync. Returns an unsubscribe fn. Forces a reconnect
 * when the app returns to the foreground from background/inactive.
 */
export function wireAppState(entitySync: EntitySyncClient): () => void {
  let previous: AppStateStatus = AppState.currentState;

  const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
    const cameToForeground = previous.match(/inactive|background/) && next === 'active';
    previous = next;
    if (cameToForeground) {
      entitySync.forceReconnect();
    }
  });

  return () => subscription.remove();
}
