/**
 * Central teardown for every live Collab Space Firestore subscription.
 *
 * Called by the auth store whenever the signed-in uid changes (sign-out or
 * account switch) so no listener keeps streaming another user's — or a
 * signed-out session's — data. Rules would reject the reads anyway, but that
 * surfaces as permission-denied errors in every store; tearing down first
 * keeps the transition silent and leak-free.
 *
 * Store modules must not import the auth store (this module is the one-way
 * bridge), so no import cycles are possible.
 */
import { useCollabSpaceStore } from '../stores/useCollabSpaceStore';
import { useMessagingStore } from '../stores/useMessagingStore';
import { useJoinedSpacesStore } from '../stores/useJoinedSpacesStore';

/**
 * UI modules with identity-scoped module state (e.g. the attachment payload
 * cache) register a reset here — this layer must not import components.
 */
const extraTeardowns = new Set<() => void>();

export function registerCollabTeardown(fn: () => void): () => void {
  extraTeardowns.add(fn);
  return () => extraTeardowns.delete(fn);
}

export function teardownCollabSubscriptions(): void {
  useJoinedSpacesStore.getState().stop();
  useCollabSpaceStore.getState().unsubscribeAll();
  useMessagingStore.getState().unsubscribeAll();
  extraTeardowns.forEach((fn) => fn());
}
