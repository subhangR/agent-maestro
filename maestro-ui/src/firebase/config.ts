import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import { Database, getDatabase } from 'firebase/database';

// Bundled DEFAULT Firebase web config so Maestro Collab works out of the box on
// a fresh clone. Firebase web API keys are PUBLIC by design — access is enforced
// by Firestore security rules, not by hiding the key — so shipping the default
// project config as a fallback is safe and standard. Users still sign in and pick
// a repo/space; only the project CONFIG is bundled. Set VITE_FIREBASE_* env vars
// in maestro-ui/.env.local to OVERRIDE these with a custom Firebase project.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBxKANwAW9UHtGv9arpyunEIF2R0nLAEeY',
  authDomain: 'maestro-5f3fc.firebaseapp.com',
  projectId: 'maestro-5f3fc',
  storageBucket: 'maestro-5f3fc.firebasestorage.app',
  messagingSenderId: '204094353519',
  appId: '1:204094353519:web:f4b09345a95234335a5d9a',
  // This project's default RTDB instance is regional. The generic firebaseio
  // hostname does not route to it, so presence silently never connected.
  databaseURL: 'https://maestro-5f3fc-default-rtdb.asia-southeast1.firebasedatabase.app',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || DEFAULT_FIREBASE_CONFIG.databaseURL,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let database: Database | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Set VITE_FIREBASE_* env vars in maestro-ui/.env.local.',
    );
  }
  if (app) return app;
  const existing = getApps()[0];
  app = existing ?? initializeApp(firebaseConfig);
  return app;
}

/** Shared Realtime Database connection for the trusted-team hub presence feed. */
export function getFirebaseDatabase(): Database {
  if (database) return database;
  database = getDatabase(getFirebaseApp());
  return database;
}
