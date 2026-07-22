// src/services/firebaseAuth/firebaseAuth.ts — the SHARED mobile Firebase auth
// seam. ONE Google sign-in, ONE cached id token, consumed by BOTH:
//   • Collab (this feature) — needs the live @react-native-firebase user for
//     Firebase-direct Firestore access (security rules run against auth().currentUser).
//   • Maestro Hub (sess_1784740522218_280f7jk3r) — needs ONLY the id token, at
//     connect-time and on socket re-auth, OUTSIDE React → getIdToken() below.
//
// Design:
//   • A tiny module-level store (plain, framework-free) holds the current auth
//     snapshot; useFirebaseAuth() (sibling file) subscribes to it via
//     useSyncExternalStore. Nothing here imports React.
//   • getIdToken() is a plain async function (NOT a hook) so the Hub can call it
//     from its non-React MaestroClient { getToken } seam. It self-guards: returns
//     null (never throws) when signed out or before Firebase is ready.
//   • The token is mirrored into expo-secure-store so a warm getIdToken() on a
//     cold start can answer from cache while Firebase rehydrates its session.
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';

import { GOOGLE_WEB_CLIENT_ID, isGoogleConfigured } from './config';

// ── Public snapshot shape ────────────────────────────────────────────────────
export type AuthStatus =
  | 'initializing' // before the first onIdTokenChanged fires
  | 'signedOut'
  | 'signingIn' // Google flow in progress
  | 'signedIn'
  | 'error';

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
}

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  /** Last sign-in error message (cleared on the next attempt). */
  error: string | null;
}

// ── Module-level store (framework-free) ──────────────────────────────────────
const SECURE_TOKEN_KEY = 'maestro.firebase.idToken';

let snapshot: AuthSnapshot = { status: 'initializing', user: null, error: null };
const listeners = new Set<() => void>();
let configured = false;
let unsubscribeIdToken: (() => void) | null = null;

function emit(next: Partial<AuthSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

function toAuthUser(u: FirebaseAuthTypes.User | null): AuthUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoUrl: u.photoURL,
  };
}

/** Subscribe to auth snapshot changes. Returns an unsubscribe fn. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current auth snapshot (sync, cheap — reference-stable between emits). */
export function getSnapshot(): AuthSnapshot {
  return snapshot;
}

/**
 * The raw @react-native-firebase user (or null). Pass THIS to the collab
 * Firestore clients' write methods (they expect the real user with `photoURL`);
 * the useFirebaseAuth() `user` is the normalized display snapshot (`photoUrl`).
 */
export function currentUser(): FirebaseAuthTypes.User | null {
  return auth().currentUser;
}

// ── Initialization ───────────────────────────────────────────────────────────
/**
 * Idempotent. Configures GoogleSignin and wires the Firebase id-token listener.
 * Call once from app bootstrap (before rendering the Spaces tab / before the Hub
 * connect path needs a token). Safe to call again — no-ops after the first run.
 */
export function initFirebaseAuth(): void {
  if (configured) return;
  configured = true;

  if (isGoogleConfigured()) {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: false,
    });
  }

  // onIdTokenChanged fires on sign-in, sign-out, AND silent token refresh — the
  // right hook to keep both the snapshot and the secure-store mirror current.
  unsubscribeIdToken = auth().onIdTokenChanged(async (user) => {
    if (!user) {
      await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => {});
      // Preserve an in-progress 'signingIn' state; otherwise settle to signedOut.
      emit({
        status: snapshot.status === 'signingIn' ? 'signingIn' : 'signedOut',
        user: null,
      });
      return;
    }
    try {
      const token = await user.getIdToken();
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token).catch(() => {});
    } catch {
      // Non-fatal: getIdToken() below can still force-refresh on demand.
    }
    emit({ status: 'signedIn', user: toAuthUser(user), error: null });
  });
}

/** Tears down the listener (tests / hot-reload hygiene). */
export function disposeFirebaseAuth(): void {
  unsubscribeIdToken?.();
  unsubscribeIdToken = null;
  configured = false;
}

// ── The Hub seam: module-level, non-hook, never throws ───────────────────────
/**
 * Returns the current Firebase id token, or null when signed out / not ready.
 * Callable OUTSIDE React (Hub connect + socket re-auth). Never throws — a failure
 * falls back to the secure-store mirror, then null.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  try {
    const user = auth().currentUser;
    if (user) {
      const token = await user.getIdToken(forceRefresh);
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token).catch(() => {});
      return token;
    }
  } catch {
    // fall through to cache
  }
  // Cold start: Firebase may not have rehydrated yet — serve the last good token.
  try {
    return await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
  } catch {
    return null;
  }
}

// ── Sign in / out ─────────────────────────────────────────────────────────────
/**
 * Google → Firebase credential sign-in. Resolves to the signed-in AuthUser.
 * Surfaces a human-readable error into the snapshot AND rethrows so callers can
 * react (e.g. keep a sign-in sheet open).
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  if (!isGoogleConfigured()) {
    const msg = 'Google sign-in is not configured (missing web client id).';
    emit({ status: 'error', error: msg });
    throw new Error(msg);
  }
  emit({ status: 'signingIn', error: null });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    // @react-native-google-signin v13: idToken lives under `.data`.
    const idToken =
      (response as { data?: { idToken?: string | null } }).data?.idToken ??
      (response as { idToken?: string | null }).idToken ??
      null;
    if (!idToken) throw new Error('Google did not return an id token.');

    const credential = auth.GoogleAuthProvider.credential(idToken);
    const result = await auth().signInWithCredential(credential);
    const user = toAuthUser(result.user);
    if (!user) throw new Error('Sign-in succeeded but no user was returned.');
    // onIdTokenChanged will also fire; set eagerly so the UI updates immediately.
    emit({ status: 'signedIn', user, error: null });
    return user;
  } catch (err) {
    const message = describeSignInError(err);
    // A user-cancelled flow is not an error state — settle back to signedOut.
    if (isCancellation(err)) {
      emit({ status: auth().currentUser ? 'signedIn' : 'signedOut', error: null });
    } else {
      emit({ status: 'error', error: message });
    }
    throw new Error(message);
  }
}

/**
 * Hub convenience binding: sign in with Google, then return a FRESH id token
 * (or null on failure). Lets the Maestro Hub seam wire `signIn` directly with no
 * adapter — `setHubFirebaseAuth({ getIdToken, signIn: signInAndGetIdToken })`.
 * Collab UI keeps using signInWithGoogle() (which returns the AuthUser).
 */
export async function signInAndGetIdToken(): Promise<string | null> {
  await signInWithGoogle();
  return getIdToken(true);
}

/** Signs out of both Firebase and Google so the next sign-in shows the chooser. */
export async function signOut(): Promise<void> {
  try {
    await GoogleSignin.signOut().catch(() => {});
  } finally {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY).catch(() => {});
    await auth().signOut().catch(() => {});
    emit({ status: 'signedOut', user: null, error: null });
  }
}

function isCancellation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === statusCodes.SIGN_IN_CANCELLED;
}

function describeSignInError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case statusCodes.SIGN_IN_CANCELLED:
      return 'Sign-in was cancelled.';
    case statusCodes.IN_PROGRESS:
      return 'A sign-in is already in progress.';
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return 'Google Play Services is unavailable or out of date.';
    default:
      return err instanceof Error ? err.message : 'Could not sign in with Google.';
  }
}
