import type { ActivityPage, CollectionQuery, CollectionResult, EntityDetail, GraphResult, PresenceSnapshot, ThreadPage } from "./types";

/**
 * The UI's only intended backend boundary. It mirrors the available
 * `/api/collab/v2` façade and keeps unavailable graph operations explicitly
 * feature-gated. No HTTP client is instantiated here—the current workspace uses
 * mock projections until the integration task opts in.
 */
export interface CollabWorkspaceFacade {
    queryCollection(query: CollectionQuery): Promise<CollectionResult>;
    getEntity(entityId: string): Promise<EntityDetail>;
    getActivity(spaceId: string, cursor?: string): Promise<ActivityPage>;
    getThread(anchorId: string, cursor?: string): Promise<ThreadPage>;
    getPresence(entityId: string): Promise<PresenceSnapshot>;
    queryGraph?(query: CollectionQuery): Promise<GraphResult>;
}

export const collabV2FeatureAvailability = {
    collection: true,
    entityDetail: true,
    taskMutation: true,
    messages: true,
    reactions: true,
    points: true,
    edges: true,
    move: true,
    completion: true,
    pulls: true,
    docs: true,
    tracking: true,
    inbox: true,
    search: false,
    realtime: true,
} as const;
