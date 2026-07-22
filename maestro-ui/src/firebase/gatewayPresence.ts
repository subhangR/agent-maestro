import { onDisconnect, onValue, ref, remove, serverTimestamp, set } from 'firebase/database';
import { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { GATEWAY_AUTH_MODE } from '../utils/gatewayAuth';
import { getFirebaseDatabase } from './config';

const PRESENCE_PATH = 'gatewayPresence';

export interface GatewayPresence {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  updatedAt?: number | null;
}

/** Keep a user's presence alive while their authenticated Maestro tab is open. */
export function useGatewayPresence(user: User | null): void {
  useEffect(() => {
    if (!GATEWAY_AUTH_MODE || !user) return;
    const db = getFirebaseDatabase();
    const presenceRef = ref(db, `${PRESENCE_PATH}/${user.uid}`);
    const connectedRef = ref(db, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() !== true) return;
      void onDisconnect(presenceRef).remove().then(() => set(presenceRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        updatedAt: serverTimestamp(),
      }));
    });
    return () => {
      unsubscribe();
      void remove(presenceRef);
    };
  }, [user]);
}

/** Subscribe to the complete trusted-team presence feed in real time. */
export function useGatewayPresenceFeed(): Record<string, GatewayPresence> {
  const [presence, setPresence] = useState<Record<string, GatewayPresence>>({});
  useEffect(() => {
    if (!GATEWAY_AUTH_MODE) return;
    const unsubscribe = onValue(
      ref(getFirebaseDatabase(), PRESENCE_PATH),
      (snapshot) => setPresence(snapshot.val() ?? {}),
      () => setPresence({}),
    );
    return unsubscribe;
  }, []);
  return presence;
}
