// src/services/firebaseAuth/useFirebaseAuth.ts — the React face of the shared
// auth seam. Thin useSyncExternalStore binding over the module-level store in
// firebaseAuth.ts, plus the two actions. Collab screens consume this; the Hub
// consumes the non-hook getIdToken() instead.
import { useSyncExternalStore } from 'react';

import {
  type AuthSnapshot,
  type AuthUser,
  getSnapshot,
  signInWithGoogle,
  signOut,
  subscribe,
} from './firebaseAuth';

export interface UseFirebaseAuth extends AuthSnapshot {
  signInWithGoogle: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

export function useFirebaseAuth(): UseFirebaseAuth {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snapshot, signInWithGoogle, signOut };
}
