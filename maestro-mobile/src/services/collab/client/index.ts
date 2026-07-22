// src/services/collab/client/ — the Firebase-direct Collab data layer.
// One module per concern so feature verticals stay disjoint. Screens/stores
// should import the high-level `collab` facade from '@/services/collab' instead
// of reaching in here.
export { SpacesClient, spaceFromData } from './spaces';
export { MessagingClient } from './messaging';
export { InvitesClient } from './invites';
export { SharedClient } from './shared';
export * as firestoreUtils from './firestore';
