import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { beforeUserCreated, beforeUserSignedIn } from 'firebase-functions/v2/identity';
import * as functionsV1 from 'firebase-functions/v1';

const REGION = 'asia-southeast1';

/**
 * Firebase blocking hooks place the role claim in new and renewed sign-in
 * tokens. They require Firebase Authentication with Identity Platform.
 * Existing users still need the one-time Admin SDK backfill in the plan.
 */
export const grantSupabaseAuthenticatedRoleOnCreate = beforeUserCreated({ region: REGION }, (event) => {
  logger.info('Assigning Supabase authenticated role at user creation', { uid: event.data?.uid });
  return { customClaims: { role: 'authenticated' } };
});

export const grantSupabaseAuthenticatedRoleOnSignIn = beforeUserSignedIn({ region: REGION }, (event) => {
  logger.info('Assigning Supabase authenticated role at sign-in', { uid: event.data?.uid });
  return { customClaims: { role: 'authenticated' } };
});

/**
 * Non-blocking fallback for Firebase Auth projects that have not upgraded to
 * Identity Platform. The browser force-refreshes once when Collab V2 opens,
 * allowing this persisted claim to appear in the next ID token.
 */
export const persistSupabaseAuthenticatedRoleOnCreate = functionsV1.region(REGION).auth.user().onCreate(async (user) => {
  logger.info('Persisting Supabase authenticated role after user creation', { uid: user.uid });
  await getAuth().setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    role: 'authenticated',
  });
});
