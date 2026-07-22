// src/services/collab/ — the Collab (Firebase-direct) service facade.
// Types + the per-concern Firestore clients + invite-link helpers. Consumed by
// the collab Zustand stores (src/state/collab) and the Spaces feature screens.
export * from './types';
export * from './spaceInvite';
export {
  SpacesClient,
  MessagingClient,
  InvitesClient,
  SharedClient,
  spaceFromData,
} from './client';
