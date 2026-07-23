// The Hub (gateway) Firebase-token seam.
//
// CROSS-SESSION BOUNDARY: the shared Firebase auth module (Google sign-in +
// @react-native-firebase session) is owned & landed by the Collab-mobile session
// at `src/services/firebaseAuth/`. This module is the thin, dependency-free seam
// THIS side consumes so our branch compiles and standalone/password profiles work
// before that module exists here. It adds NO Firebase deps and NO native config.
//
// Wiring (a MERGE-TIME step — setHubFirebaseAuth lives on feat/mobile-multi-server
// and signInAndGetIdToken on feat/mobile-collab, so it compiles only once both are
// on staging). Add right after the module's initFirebaseAuth() at app boot:
//   import { getIdToken, signInAndGetIdToken } from '@/services/firebaseAuth';
//   setHubFirebaseAuth({ getIdToken, signIn: signInAndGetIdToken });
// (signInAndGetIdToken returns a FRESH token; the module's signInWithGoogle returns
//  the AuthUser for the Collab UI, so it is NOT the token-returning seam.)
//
// The MaestroClient `getToken` seam and the WS `?token=` builder are SYNCHRONOUS,
// but Firebase's getIdToken is async — so we keep a synchronously-readable cache
// (`cached`) that `refreshHubFirebaseToken()` warms before each connect / on
// socket re-auth. `getHubFirebaseToken()` returns that cache with zero awaits.

import type { AuthMode } from '../config/serverConfig';

/** Async accessor for the current Firebase ID token (null when signed out). */
export type FirebaseTokenSource = (forceRefresh?: boolean) => Promise<string | null>;
/** Trigger the Google sign-in flow; resolves to the fresh ID token (or null). */
export type FirebaseSignIn = () => Promise<string | null>;

let tokenSource: FirebaseTokenSource | null = null;
let signInFn: FirebaseSignIn | null = null;
let cached: string | null = null;

/**
 * Thrown when a firebase-authMode server is contacted but no Firebase session /
 * token is available (module not wired yet, or user signed out). The connect UI
 * surfaces this as "sign in with Google required".
 */
export class HubSignInRequiredError extends Error {
  constructor(message = 'This hub requires a Google sign-in.') {
    super(message);
    this.name = 'HubSignInRequiredError';
  }
}

/**
 * Register the shared Firebase auth module's accessors. Called once by that
 * module's bootstrap. Passing null unregisters (and clears the cache) — e.g. on
 * sign-out. Idempotent.
 */
export function setHubFirebaseAuth(
  auth: { getIdToken: FirebaseTokenSource; signIn?: FirebaseSignIn } | null,
): void {
  tokenSource = auth?.getIdToken ?? null;
  signInFn = auth?.signIn ?? null;
  if (!tokenSource) cached = null;
}

/** Whether the shared Firebase auth module has been wired in this build. */
export function hasHubFirebaseAuth(): boolean {
  return tokenSource != null;
}

/** Synchronously read the last-refreshed Firebase ID token (null if none). */
export function getHubFirebaseToken(): string | null {
  return cached;
}

/**
 * Refresh the cached token from the Firebase session. Safe to call when no source
 * is wired (returns null) and never throws — a failed refresh keeps the last good
 * token so an in-flight connection isn't dropped on a transient error.
 */
export async function refreshHubFirebaseToken(forceRefresh = false): Promise<string | null> {
  if (!tokenSource) {
    cached = null;
    return null;
  }
  try {
    cached = await tokenSource(forceRefresh);
  } catch {
    /* keep last known token */
  }
  return cached;
}

/**
 * Ensure we hold a token for a firebase-authMode connect: refresh first, and if
 * still empty, trigger Google sign-in when a sign-in fn is wired. Throws
 * HubSignInRequiredError when no token can be obtained (no module / user aborted).
 */
export async function ensureHubFirebaseToken(): Promise<string> {
  let token = await refreshHubFirebaseToken();
  if (!token && signInFn) {
    try {
      token = await signInFn();
    } catch {
      /* fall through to the required error */
    }
    if (token) cached = token;
  }
  if (!token) throw new HubSignInRequiredError();
  return token;
}

/**
 * Resolve the synchronous `getToken` the MaestroClient / WS builder should use for
 * a given profile authMode. 'firebase' reads the Firebase cache; 'password' reads
 * the provided password-token getter; 'none' carries no token.
 */
export function getTokenForAuthMode(
  authMode: AuthMode,
  passwordToken: () => string | null,
): () => string | null {
  if (authMode === 'firebase') return getHubFirebaseToken;
  if (authMode === 'password') return passwordToken;
  return () => null;
}
