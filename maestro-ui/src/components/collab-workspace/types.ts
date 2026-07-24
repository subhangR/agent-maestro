/**
 * API-neutral view contracts for Collab V2.
 *
 * Components only consume these projections. The eventual Supabase client adapts
 * entity rows/detail tables into these shapes rather than leaking persistence
 * details into the UI.
 */
export type EntityKind =
    | "channel"
    | "task"
    | "doc"
    | "file"
    | "message"
    | "member"
    | "team_member"
    | "spell"
    | "skill"
    | "pull_request"
    | "commit";

export type ActorKind = "member" | "team_member";
export type WorkStatus = "open" | "pulled" | "working" | "in_review" | "done" | "blocked" | "cancelled";
export type EntityTab = "content" | "discussion" | "connections" | "activity";
export type CollectionLayout = "list" | "board" | "tree" | "feed" | "gallery" | "graph";

export interface ActorSummary {
    id: string;
    kind: ActorKind;
    displayName: string;
    avatar?: string | null;
    role?: string | null;
    ownerMemberId?: string;
    isAgent: boolean;
    /** View-only presentation hint supplied by an adapter or mock fixture. */
    initials?: string;
    color?: string;
}
export type ActorRef = ActorSummary;

export interface EntityCounters {
    likes: number;
    dislikes: number;
    stars: number;
    points: number;
    messages: number;
    viewerReaction?: "like" | "dislike" | "star" | null;
}

/** A live-work badge is supplied by the Collab projection, not composed from edges in a view. */
export interface LiveWork {
    actor: ActorSummary;
    task: EntitySummary;
    startedAt: string;
    note?: string | null;
}

export type EntityState =
    | { kind: "task"; workStatus: WorkStatus; priority: "low" | "medium" | "high" | "urgent"; axes: Record<string, string>; assignees: ActorSummary[]; acceptance: { total: number; completed: number }; dueDate?: string | null }
    | { kind: "channel"; topic: string; unreadCount: number; workingAgentCount: number }
    | { kind: "doc"; format: "markdown" | "mermaid" | "excalidraw"; childCount: number }
    | { kind: "team_member"; owner: ActorSummary; model?: string | null; agentTool?: string | null; liveWork?: LiveWork | null }
    | { kind: "member"; role: "owner" | "admin" | "member"; score: number; taskDoneCount: number }
    | { kind: "message"; anchorId: string; rootMessageId: string | null; author: ActorSummary; editedAt?: string | null }
    | { kind: "pull_request"; repository: string; number: number; state: string; url?: string; fetchedAt?: string | null; stale: boolean }
    | { kind: "commit"; repository: string; sha: string; message: string; committedAt?: string | null }
    | { kind: "file"; name: string; mimeType: string; sizeBytes: number }
    | { kind: "spell" | "skill"; description?: string; equipped: boolean };

export interface EntityBadges {
    blocked?: { unresolvedHardDependencyCount: number; waitingOn: EntitySummary[] };
    pulls?: Array<{ actor: ActorSummary; localId?: string | null; pinnedVersion: number; contentStale: boolean; discussionMoved: boolean; workStatus?: string | null; pulledAt?: string }>;
    workingActors?: LiveWork[];
    restricted?: boolean;
}

export interface EntitySummary {
    id: string;
    spaceId: string;
    kind: EntityKind;
    title: string;
    parentId: string | null;
    createdBy: ActorRef;
    createdAt: string;
    updatedAt: string;
    activityAt: string;
    version: number;
    position: number;
    visibility: "space" | "restricted";
    deletedAt: string | null;
    state: EntityState;
    badges: EntityBadges;
    excerpt?: string;
    counters: EntityCounters;
}

/**
 * Detail content remains a projection. Its optional fields mirror the discriminator
 * payloads from the public V2 contract while allowing the renderer to be kind-agnostic.
 * Persistence rows must be adapted before reaching this type.
 */
export interface EntityContent {
    description?: string;
    body?: string;
    topic?: string;
    format?: "markdown" | "mermaid" | "excalidraw";
    acceptanceCriteria?: Array<{ id: string; label?: string; text?: string; done: boolean; doneBy?: string; doneAt?: string }>;
    pointsEstimate?: number | null;
    attributes?: Array<{ label: string; value: string }>;
    pinned?: EntitySummary[];
    autoTabs?: Array<{ key: string; label: string; count: number }>;
    mentions?: Array<{ entityId: string; kind: ActorKind; display: string }>;
    attachments?: Array<{ fileEntityId: string; name: string; mime: string }>;
    teamMembers?: EntitySummary[];
    work?: EntitySummary[];
    identity?: string;
    memories?: unknown[];
    capabilities?: Record<string, unknown>;
    commandPermissions?: Record<string, unknown>;
    equipped?: EntitySummary[];
}

export interface EntityDetail extends EntitySummary {
    content: EntityContent;
    hierarchy: { parent: EntitySummary | null; children: { items: EntitySummary[]; nextCursor: string | null }; path: EntitySummary[] };
    connections: Connections;
    capabilities: { canEdit: boolean; canDelete: boolean; canAddChild: boolean; canLink: boolean; canPull: boolean; canReact: boolean; canGrantPoints: boolean; canComplete: boolean };
}

export interface EntityRef {
    id: string;
    kind: EntityKind;
    title: string;
    state?: EntityState;
    badges?: EntityBadges;
}

export interface ConnectionGroup {
    type: string;
    direction: "outgoing" | "incoming";
    unresolvedCount?: number;
    items: EntityRef[];
}

export interface Connections {
    parent: EntityRef | null;
    children: EntitySummary[];
    groups: ConnectionGroup[];
}

export interface ThreadMessage {
    id: string;
    parentId: string | null;
    author: ActorRef;
    body: string;
    createdAt: string;
    embeddedEntity?: EntitySummary;
    counters: Pick<EntityCounters, "likes" | "stars">;
}

export interface ThreadPage {
    anchorId: string;
    items: ThreadMessage[];
    nextCursor: string | null;
}

export interface PresenceSnapshot {
    entityId: string;
    viewers: ActorRef[];
    typing: ActorRef[];
}

export interface ActivityItem {
    id: string;
    actor: ActorRef;
    verb: string;
    summary: string;
    createdAt: string;
}

export interface ActivityPage {
    entityId: string;
    items: ActivityItem[];
    nextCursor: string | null;
}

export interface CollectionQuery {
    spaceId: string;
    kinds?: EntityKind[];
    subtreeOf?: string;
    parentId?: string | null;
    filters?: {
        workStatus?: WorkStatus[];
        axes?: Record<string, string[]>;
        assigneeIds?: string[];
        edge?: { type: string; direction: "incoming" | "outgoing"; entityId: string };
        readyToPull?: boolean;
        inReviewForActorId?: string;
        mentionedActorId?: string;
        deleted?: "exclude" | "only" | "include";
    };
    layout: CollectionLayout;
    groupBy?: "workStatus" | "assignee" | `axis:${string}`;
    sort?: "activityAt_desc" | "createdAt_desc" | "position" | "dueDate" | "priority";
    cursor?: string;
    limit?: number;
    /** Saved-view metadata, intentionally separate from the API query. */
    id?: string;
    title?: string;
}

export interface CollectionResult {
    query: CollectionQuery;
    page: { items: EntitySummary[]; nextCursor: string | null };
}

/** Public façade event union; components can opt into this when realtime ships. */
export type WorkspaceEvent =
    | { type: "entity.upsert" | "entity.deleted"; eventId: string; entity: EntitySummary; clientMutationId?: string }
    | { type: "counter.changed"; eventId: string; entityId: string; counters: EntityCounters }
    | { type: "presence.changed"; eventId: string; entityId: string; presence: PresenceSnapshot }
    | { type: "typing.changed"; eventId: string; anchorId: string; typingActorIds: string[] };

export interface GraphResult {
    nodes: EntitySummary[];
    edges: Array<{ id: string; type: string; sourceId: string; targetId: string; resolved?: boolean; hard?: boolean }>;
    clusters: Array<{ parentId: string; childIds: string[] }>;
}

export interface CollabWorkspaceData {
    space: { id: string; name: string; description: string };
    navigation: Array<{ id: string; label: string; icon: string; count?: number }>;
    collection: CollectionResult;
    entities: Record<string, EntityDetail>;
    threads: Record<string, ThreadPage>;
    presence: Record<string, PresenceSnapshot>;
    activity: Record<string, ActivityPage>;
    unreadTotal?: number;
    workingAgentCount?: number;
    inbox?: Array<{ id: string; read: boolean; kind: string; createdAt: string; target: EntitySummary; actor?: ActorSummary | null }>;
    defaultEntityId?: string | null;
}
