import { logger } from 'firebase-functions';
import { beforeUserCreated, beforeUserSignedIn } from 'firebase-functions/v2/identity';

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
