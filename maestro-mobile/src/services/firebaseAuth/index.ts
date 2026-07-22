// src/services/firebaseAuth/ — the SHARED mobile Firebase auth module.
// Owned by the Collab-mobile session; consumed by Collab (useFirebaseAuth) and
// the Maestro Hub (getIdToken). See planning/MOBILE_COLLAB_SPEC.md §4a.
export {
  initFirebaseAuth,
  disposeFirebaseAuth,
  getIdToken,
  signInWithGoogle,
  signInAndGetIdToken,
  signOut,
  getSnapshot,
  currentUser,
  subscribe,
  type AuthStatus,
  type AuthUser,
  type AuthSnapshot,
} from './firebaseAuth';
export { useFirebaseAuth, type UseFirebaseAuth } from './useFirebaseAuth';
export { GOOGLE_WEB_CLIENT_ID, isGoogleConfigured } from './config';
