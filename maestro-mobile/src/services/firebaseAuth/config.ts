// src/services/firebaseAuth/config.ts — the ONE place the Firebase/Google client
// ids live. The native @react-native-firebase app auto-initializes from the
// bundled google-services.json (Android) / GoogleService-Info.plist (iOS), so we
// only need the Google **web client id** here for GoogleSignin → Firebase
// credential exchange (it is NOT the android/ios client id — it's the OAuth 2.0
// "Web application" client from the same Firebase project, maestro-5f3fc).
//
// Provided at build time via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (app.json → extra /
// eas env). The placeholder is intentionally invalid so a misconfigured build
// fails loudly at sign-in rather than silently returning a bad credential.
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

/** OAuth 2.0 *Web* client id for the maestro-5f3fc Firebase project. */
export const GOOGLE_WEB_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  (typeof extra.googleWebClientId === 'string' ? extra.googleWebClientId : '') ??
  '';

/** True when a usable web client id is present; sign-in is gated on this. */
export const isGoogleConfigured = (): boolean =>
  GOOGLE_WEB_CLIENT_ID.length > 0 && GOOGLE_WEB_CLIENT_ID.includes('.apps.googleusercontent.com');
