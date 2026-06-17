// NetInfo reconnect driver.
//
// When the device regains connectivity, don't wait out the backoff timer —
// reconnect immediately. NetInfo also lets us avoid futile reconnects while the
// device is offline (the heartbeat watchdog still catches half-open sockets).

import NetInfo from '@react-native-community/netinfo';
import type { EntitySyncClient } from '../types';

/**
 * Wire NetInfo → entity-sync. Returns an unsubscribe fn. Calls `forceReconnect`
 * on an offline→online transition.
 */
export function wireNetInfo(entitySync: EntitySyncClient): () => void {
  let wasConnected: boolean | null = null;

  const unsub = NetInfo.addEventListener((state) => {
    const isConnected = state.isConnected === true;
    if (wasConnected === false && isConnected) {
      entitySync.forceReconnect();
    }
    wasConnected = isConnected;
  });

  return unsub;
}
