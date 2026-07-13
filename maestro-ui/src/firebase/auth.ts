import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  Auth,
  User,
  Unsubscribe,
} from 'firebase/auth';
import { getFirebaseApp } from './config';

let auth: Auth | null = null;
let googleSignInInFlight: Promise<User> | null = null;

export function getFbAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  return auth;
}

export function subscribeAuth(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(getFbAuth(), cb);
}

export function signInWithGoogle(): Promise<User> {
  // Firebase cancels the older operation with auth/cancelled-popup-request if
  // signInWithPopup is invoked again while a popup is active. Keep the guard at
  // the Firebase boundary so every current and future caller shares one flow.
  if (googleSignInInFlight) return googleSignInInFlight;

  const provider = new GoogleAuthProvider();
  googleSignInInFlight = signInWithPopup(getFbAuth(), provider)
    .then((result) => result.user)
    .finally(() => {
      googleSignInInFlight = null;
    });

  return googleSignInInFlight;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(getFbAuth(), email, password);
  return result.user;
}

export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(getFbAuth(), email, password);
  return result.user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(getFbAuth());
}
