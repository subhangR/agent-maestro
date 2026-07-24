import { API_BASE_URL } from "../../utils/serverConfig";
import type {
    ActivityItem,
    ActivityPage,
    ActorSummary,
    CollectionQuery,
    CollectionResult,
    Connections,
    EntityDetail,
    EntityKind,
    EntityState,
    EntitySummary,
    PresenceSnapshot,
    ThreadMessage,
    ThreadPage,
    WorkspaceEvent,
    WorkStatus,
} from "./types";

type Json = Record<string, unknown>;

type RawEntity = {
    id: string;
    spaceId: string;
    kind: EntityKind;
    parentId: string | null;
    position: number;
    visibility: "space" | "restricted";
    createdBy: string | ActorSummary;
    version: number;
    activityAt: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    detail?: Json;
    counters?: Record<string, number | string>;
    /** Present on CollectionResult projections. */
    title?: string;
    excerpt?: string;
    state?: EntityState;
    badges?: EntitySummary["badges"];
};

type RawEntityView = {
    entity: RawEntity;
    children: RawEntity[];
    edges: Array<{ id: string; srcId: string; dstId: string; type: string; props: Json; createdAt: string }>;
    thread: RawEntity[];
    activity: Array<{ id: string; actorId: string | null; verb: string; summary: Json; createdAt: string }>;
};

type ApiEnvelope<T> = { data: T; requestId?: string };

export class CollabV2ApiError extends Error {
    constructor(readonly status: number, message: string, readonly body?: unknown) {
        super(message);
        this.name = "CollabV2ApiError";
    }
}

export type FirebaseTokenProvider = () => Promise<string>;

export type CreateTaskInput = {
    actorId: string;
    title: string;
    description?: string;
    axes?: Record<string, string>;
    parentId?: string | null;
    position?: number;
    priority?: "low" | "medium" | "high" | "urgent";
    acceptanceCriteria?: unknown[];
    pointsEstimate?: number | null;
    dueDate?: string | null;
};

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "actorId">> & {
    actorId: string;
    workStatus?: WorkStatus;
};

export type CreateTaskAxisInput = {
    name: string;
    values?: string[];
    kind?: "default" | "manual";
    position?: number;
};

export type CreateSpaceInput = {
    name: string;
    description?: string;
    githubRepo?: string | null;
    visibility?: "public" | "private";
};

export type PlacementInput = { sourceId: string; targetId: string; intent: "attach" | "assign" | "depend" | "subtask" | "embed" | "reparent"; embedMessage?: string };
export type EdgeInput = { srcId: string; dstId: string; type: string; props?: Json };
export type InboxItem = { id: string; read: boolean; kind: string; createdAt: string; target: EntitySummary; actor?: ActorSummary | null };

/**
 * Transport for the server façade—not PostgREST. It is the sole place that knows
 * the Firebase forwarding header and current response envelopes.
 */
export class CollabV2Client {
    constructor(private readonly getFirebaseToken: FirebaseTokenProvider, private readonly baseUrl = `${API_BASE_URL}/collab/v2`, private readonly firebaseUid?: string) {}

    async identity(): Promise<Json> { return this.request<Json>("/identity"); }
    async listSpaces(): Promise<Json[]> { return this.request<Json[]>("/spaces"); }
    async discoverSpaces(githubRepo = ""): Promise<Json[]> {
        const suffix = githubRepo.trim() ? `?githubRepo=${encodeURIComponent(githubRepo.trim())}` : "";
        return this.request<Json[]>(`/spaces/discover${suffix}`);
    }
    async joinSpace(spaceId: string): Promise<{ spaceId: string; memberId: string; joined: boolean }> {
        return this.request<{ spaceId: string; memberId: string; joined: boolean }>(`/spaces/${encodeURIComponent(spaceId)}/join`, { method: "POST", body: {} });
    }
    async spaceIdentity(spaceId: string): Promise<Json> { return this.request<Json>(`/spaces/${encodeURIComponent(spaceId)}/identity`); }
    async getNavigation(spaceId: string): Promise<Json> { return this.request<Json>(`/spaces/${encodeURIComponent(spaceId)}/navigation`); }
    async createSpace(input: CreateSpaceInput): Promise<{ id: string }> {
        return this.request<{ id: string }>("/spaces", { method: "POST", body: input });
    }
    async queryCollection(query: CollectionQuery): Promise<CollectionResult> {
        // Saved-view fields belong to the UI and are intentionally not part of
        // the strict server contract. Preserve them in the returned view while
        // sending only fields understood by the collection endpoint.
        const { id, title, subtreeOf: _subtreeOf, ...transportQuery } = query;
        const response = await this.request<ApiEnvelope<{ query: CollectionQuery; page: { items: RawEntity[]; nextCursor: string | null } }>>("/collections/query", { method: "POST", body: transportQuery });
        return { query: { ...response.data.query, ...(id ? { id } : {}), ...(title ? { title } : {}) }, page: { items: response.data.page.items.map(toSummary), nextCursor: response.data.page.nextCursor } };
    }
    async getEntity(entityId: string): Promise<EntityDetail> {
        const view = await this.request<RawEntityView>(`/entities/${encodeURIComponent(entityId)}`);
        return toDetail(view);
    }
    async getEntityContext(entityId: string): Promise<{ detail: EntityDetail; thread: ThreadPage; activity: ActivityPage }> {
        const view = await this.request<RawEntityView>(`/entities/${encodeURIComponent(entityId)}`);
        return { detail: toDetail(view), thread: toThread(entityId, view.thread), activity: { entityId, nextCursor: null, items: view.activity.map(toActivity) } };
    }
    async getActivity(spaceId: string, cursor?: string): Promise<ActivityPage> {
        // The live façade uses offset pagination today; preserve the cursor slot
        // so callers do not need to change when it moves to opaque cursors.
        const page = await this.request<Array<{ id: string; actorId: string | null; verb: string; summary: Json; createdAt: string }>>(`/spaces/${encodeURIComponent(spaceId)}/activity${cursor ? `?offset=${encodeURIComponent(cursor)}` : ""}`);
        return { entityId: spaceId, nextCursor: null, items: page.map(toActivity) };
    }
    async createTask(spaceId: string, input: CreateTaskInput): Promise<EntitySummary> {
        return toSummary(await this.request<RawEntity>(`/spaces/${encodeURIComponent(spaceId)}/tasks`, { method: "POST", body: input }));
    }
    async updateTask(taskId: string, input: UpdateTaskInput): Promise<EntitySummary> {
        return toSummary(await this.request<RawEntity>(`/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", body: input }));
    }
    async createTaskAxis(spaceId: string, input: CreateTaskAxisInput): Promise<{ id: string }> {
        return this.request<{ id: string }>(`/spaces/${encodeURIComponent(spaceId)}/task-axes`, { method: "POST", body: input });
    }
    async postMessage(anchorId: string, input: { actorId: string; body: string; parentMessageId?: string | null; mentions?: unknown[]; attachments?: unknown[]; clientMessageId?: string | null }): Promise<EntitySummary> {
        return toSummary(await this.request<RawEntity>(`/entities/${encodeURIComponent(anchorId)}/messages`, { method: "POST", body: input }));
    }
    async react(entityId: string, input: { actorId: string; type: "likes" | "dislikes" | "stars"; active: boolean }): Promise<{ active: boolean }> {
        return this.request<{ active: boolean }>(`/entities/${encodeURIComponent(entityId)}/reactions`, { method: "POST", body: input });
    }
    async grantPoints(entityId: string, input: { actorId: string; amount: number; reason?: "grant" | "award" | "seed"; referenceId?: string | null; clientEventId?: string | null }): Promise<{ id: string }> {
        return this.request<{ id: string }>(`/entities/${encodeURIComponent(entityId)}/points`, { method: "POST", body: input });
    }
    async createEdge(input: EdgeInput & { actorId: string; clientMutationId: string }): Promise<Json> {
        return this.request<Json>("/edges", { method: "POST", body: input });
    }
    async place(input: PlacementInput & { actorId: string; clientMutationId: string }): Promise<Json> {
        return this.request<Json>("/placements", { method: "POST", body: input });
    }
    async undo(undoToken: string): Promise<Json> {
        return this.request<Json>("/undo", { method: "POST", body: { undoToken } });
    }
    async moveEntity(entityId: string, input: { actorId: string; clientMutationId: string; parentId: string | null; position: number; expectedVersion: number }): Promise<Json> {
        return this.request<Json>(`/entities/${encodeURIComponent(entityId)}/move`, { method: "POST", body: input });
    }
    async completeTask(taskId: string, input: { actorId: string; clientMutationId: string; expectedVersion: number; completerIds: string[] }): Promise<Json> {
        return this.request<Json>(`/tasks/${encodeURIComponent(taskId)}/complete`, { method: "POST", body: input });
    }
    async pullEntity(entityId: string, input: { actorId: string; clientMutationId: string; localId?: string | null; pinnedVersion: number }): Promise<Json> {
        return this.request<Json>(`/entities/${encodeURIComponent(entityId)}/pulls`, { method: "POST", body: input });
    }
    async updateWork(entityId: string, input: { actorId: string; clientMutationId: string; status: WorkStatus; startedAt?: string; note?: string }): Promise<Json> {
        return this.request<Json>(`/entities/${encodeURIComponent(entityId)}/work`, { method: "POST", body: input });
    }
    async listInbox(spaceId: string, cursor?: string): Promise<{ items: InboxItem[]; nextCursor: string | null }> {
        const params = new URLSearchParams({ spaceId });
        if (cursor) params.set("cursor", cursor);
        const raw = await this.request<{ items: Array<Omit<InboxItem, "target"> & { target: RawEntity }>; nextCursor: string | null }>(`/inbox?${params}`);
        return { ...raw, items: raw.items.map((item) => ({ ...item, target: toSummary(item.target) })) };
    }
    async markInboxRead(notificationId: string): Promise<void> {
        await this.request<unknown>(`/inbox/${encodeURIComponent(notificationId)}/read`, { method: "PUT" });
    }
    async markRead(anchorId: string): Promise<void> {
        await this.request<unknown>(`/read-marks/${encodeURIComponent(anchorId)}`, { method: "PUT" });
    }
    async queryGraph(query: CollectionQuery): Promise<Json> { return this.request<Json>("/graph/query", { method: "POST", body: query }); }
    async refreshTracking(entityIds?: string[]): Promise<Json> { return this.request<Json>("/tracking/refresh", { method: "POST", body: entityIds ? { entityIds } : {} }); }
    async createDoc(spaceId: string, input: { actorId: string; title: string; body?: string; format?: "markdown" | "mermaid" | "excalidraw"; parentId?: string | null; position?: number; clientMutationId: string }): Promise<Json> {
        return this.request<Json>(`/spaces/${encodeURIComponent(spaceId)}/docs`, { method: "POST", body: input });
    }
    async createFile(spaceId: string, input: { actorId: string; name: string; mimeType: string; sizeBytes: number; storagePath: string; checksum?: string; parentId?: string | null; position?: number; clientMutationId: string }): Promise<Json> {
        return this.request<Json>(`/spaces/${encodeURIComponent(spaceId)}/files`, { method: "POST", body: input });
    }
    async getEvents(spaceId: string, cursor?: string): Promise<{ items: WorkspaceEvent[]; nextCursor: string | null }> {
        const params = new URLSearchParams();
        if (cursor) params.set("cursor", cursor);
        return this.request<{ items: WorkspaceEvent[]; nextCursor: string | null }>(`/spaces/${encodeURIComponent(spaceId)}/events${params.size ? `?${params}` : ""}`);
    }

    private async request<T>(path: string, options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {}): Promise<T> {
        const token = await this.getFirebaseToken();
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: options.method ?? "GET",
            credentials: "include",
            headers: {
                "X-Collab-Firebase-Token": token,
                ...(this.firebaseUid ? { "X-Collab-Firebase-Uid": this.firebaseUid } : {}),
                ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        const body = await response.json().catch(() => undefined);
        if (!response.ok) {
            const message = typeof body === "object" && body && "message" in body && typeof (body as { message?: unknown }).message === "string"
                ? (body as { message: string }).message
                : typeof body === "object" && body && "error" in body && typeof (body as { error?: unknown }).error === "string"
                    ? (body as { error: string }).error
                    : `Collab V2 request failed (${response.status})`;
            throw new CollabV2ApiError(response.status, message, body);
        }
        return body as T;
    }
}

const unknownActor = (id: string): ActorSummary => ({ id, kind: "member", displayName: "Unknown member", isAgent: false });
const asRecord = (value: unknown): Json => value && typeof value === "object" ? value as Json : {};
const stringValue = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const workStatus = (value: unknown): WorkStatus => ["open", "pulled", "working", "in_review", "done", "blocked", "cancelled"].includes(String(value)) ? value as WorkStatus : "open";

function entityTitle(entity: RawEntity, detail: Json): string {
    if (entity.title) return entity.title;
    if (entity.kind === "task") return stringValue(detail.title, "Untitled task");
    if (entity.kind === "message") return stringValue(detail.body, "Message").slice(0, 120) || "Message";
    if (entity.kind === "member") return stringValue(detail.displayName, "Member");
    if (entity.kind === "team_member") return stringValue(detail.name, "Team member");
    return entity.kind.replace(/_/g, " ");
}

function stateFor(entity: RawEntity, detail: Json): EntityState {
    if (entity.state) return entity.state;
    switch (entity.kind) {
        case "task": return { kind: "task", workStatus: workStatus(detail.workStatus), priority: (["low", "medium", "high", "urgent"].includes(String(detail.priority)) ? detail.priority : "medium") as "low" | "medium" | "high" | "urgent", axes: asRecord(detail.axes) as Record<string, string>, assignees: [], acceptance: { total: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.length : 0, completed: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.filter((criterion) => Boolean(asRecord(criterion).done)).length : 0 } };
        case "channel": return { kind: "channel", topic: stringValue(detail.topic), unreadCount: 0, workingAgentCount: 0 };
        case "doc": return { kind: "doc", format: "markdown", childCount: 0 };
        case "message": return { kind: "message", anchorId: stringValue(detail.anchorId), rootMessageId: stringValue(detail.rootMessageId) || null, author: unknownActor(stringValue(detail.authorId)), editedAt: stringValue(detail.editedAt) || null };
        case "member": return { kind: "member", role: "member", score: Number(entity.counters?.points ?? 0), taskDoneCount: 0 };
        case "team_member": return { kind: "team_member", owner: unknownActor(stringValue(detail.ownerMemberId)), model: stringValue(detail.model) || null, agentTool: stringValue(detail.agentTool) || null };
        case "pull_request": return { kind: "pull_request", repository: stringValue(detail.repository), number: Number(detail.number ?? 0), state: stringValue(detail.state), stale: false };
        case "commit": return { kind: "commit", repository: stringValue(detail.repository), sha: stringValue(detail.sha), message: stringValue(detail.message) };
        case "file": return { kind: "file", name: stringValue(detail.name, entityTitle(entity, detail)), mimeType: stringValue(detail.mimeType), sizeBytes: Number(detail.sizeBytes ?? 0) };
        case "spell":
        case "skill": return { kind: entity.kind, description: stringValue(detail.description) || undefined, equipped: Boolean(detail.equipped) };
    }
}

export function toSummary(entity: RawEntity): EntitySummary {
    const detail = entity.detail ?? {};
    return { id: entity.id, spaceId: entity.spaceId, kind: entity.kind, title: entityTitle(entity, detail), excerpt: entity.excerpt, parentId: entity.parentId ?? null, position: entity.position ?? 0, visibility: entity.visibility ?? "space", version: entity.version ?? 1, activityAt: entity.activityAt, createdAt: entity.createdAt, updatedAt: entity.updatedAt, deletedAt: entity.deletedAt ?? null, createdBy: typeof entity.createdBy === "string" ? unknownActor(entity.createdBy) : entity.createdBy, counters: { likes: Number(entity.counters?.likes ?? 0), dislikes: Number(entity.counters?.dislikes ?? 0), stars: Number(entity.counters?.stars ?? 0), points: Number(entity.counters?.points ?? 0), messages: Number(entity.counters?.messages ?? 0), viewerReaction: null }, state: stateFor(entity, detail), badges: entity.badges ?? (entity.visibility === "restricted" ? { restricted: true } : {}) };
}

function toDetail(view: RawEntityView): EntityDetail {
    const entity = toSummary(view.entity);
    const groups = new Map<string, Connections["groups"][number]>();
    for (const edge of view.edges) {
        const direction = edge.srcId === entity.id ? "outgoing" : "incoming";
        const key = `${direction}:${edge.type}`;
        const group = groups.get(key) ?? { type: edge.type, direction, items: [] };
        group.items.push({ id: direction === "outgoing" ? edge.dstId : edge.srcId, kind: "task", title: "Linked entity" });
        groups.set(key, group);
    }
    const detail = view.entity.detail ?? {};
    return { ...entity, content: { description: stringValue(detail.description) || undefined, body: stringValue(detail.body) || undefined, acceptanceCriteria: Array.isArray(detail.acceptanceCriteria) ? detail.acceptanceCriteria.map((item, index) => ({ id: stringValue(asRecord(item).id, String(index)), label: stringValue(asRecord(item).text, stringValue(asRecord(item).label)), done: Boolean(asRecord(item).done) })) : undefined }, hierarchy: { parent: null, children: { items: view.children.map(toSummary), nextCursor: null }, path: [] }, connections: { parent: null, children: view.children.map(toSummary), groups: [...groups.values()] }, capabilities: { canEdit: entity.kind === "task", canDelete: false, canAddChild: entity.kind === "task", canLink: false, canPull: false, canReact: true, canGrantPoints: true, canComplete: false } };
}

function toActivity(item: { id: string; actorId: string | null; verb: string; summary: Json; createdAt: string }): ActivityItem {
    return { id: item.id, actor: unknownActor(item.actorId ?? ""), verb: item.verb, summary: Object.values(item.summary).filter((value): value is string => typeof value === "string").join(" ") || "updated this entity", createdAt: item.createdAt };
}

export function toThread(anchorId: string, entities: RawEntity[]): ThreadPage {
    const items: ThreadMessage[] = entities.map((entity) => {
        const detail = entity.detail ?? {};
        return { id: entity.id, parentId: stringValue(detail.parentMessageId) || null, author: unknownActor(stringValue(detail.authorId)), body: stringValue(detail.body), createdAt: entity.createdAt, counters: { likes: Number(entity.counters?.likes ?? 0), stars: Number(entity.counters?.stars ?? 0) } };
    });
    return { anchorId, items, nextCursor: null };
}
