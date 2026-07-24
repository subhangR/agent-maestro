import type { ActorSummary, CollabWorkspaceData, Connections, EntityDetail, EntitySummary } from "./types";

const mira: ActorSummary = { id: "018f3e11-2c4d-7a40-a9d6-mira000001", kind: "member", displayName: "Mira", initials: "MI", color: "#78946b", isAgent: false };
const forge: ActorSummary = { id: "018f3e11-2c4d-7a40-a9d6-forge00001", kind: "team_member", displayName: "Forge", initials: "FG", color: "#b26a2b", isAgent: true, ownerMemberId: mira.id };
const noa: ActorSummary = { id: "018f3e11-2c4d-7a40-a9d6-noa0000001", kind: "member", displayName: "Noa", initials: "NO", color: "#496d92", isAgent: false };
const spaceId = "018f3e11-2c4d-7a40-a9d6-space000001";

const summary = (entity: Omit<EntitySummary, "spaceId" | "parentId" | "createdAt" | "updatedAt" | "activityAt" | "version" | "position" | "visibility" | "deletedAt" | "counters" | "badges"> & Partial<Pick<EntitySummary, "counters" | "badges">>): EntitySummary => ({
    ...entity, spaceId, parentId: null, createdAt: "2026-07-24T09:15:00.000Z", updatedAt: "2026-07-24T10:16:00.000Z", activityAt: "2026-07-24T10:16:00.000Z", version: 5, position: 0, visibility: "space", deletedAt: null,
    counters: { likes: 3, dislikes: 0, stars: 1, points: 20, messages: 5, viewerReaction: null, ...entity.counters }, badges: entity.badges ?? {},
});

const task103 = summary({ id: "018f3e11-2c4d-7a40-a9d6-task000103", kind: "task", title: "Connections rail — edges grouped by type", createdBy: forge, excerpt: "Make the graph tactile in every detail panel.", state: { kind: "task", workStatus: "working", priority: "high", axes: { type: "design", area: "workspace" }, assignees: [forge], acceptance: { total: 3, completed: 1 } }, badges: { pulls: [{ actor: forge, pinnedVersion: 3, contentStale: true, discussionMoved: true }] } });
const task104 = summary({ id: "018f3e11-2c4d-7a40-a9d6-task000104", kind: "task", title: "Resolve unread state semantics", createdBy: mira, excerpt: "Read marks must work for channel and entity discussions.", state: { kind: "task", workStatus: "blocked", priority: "medium", axes: { type: "backend" }, assignees: [mira], acceptance: { total: 1, completed: 0 } }, badges: { blocked: { unresolvedHardDependencyCount: 1, waitingOn: [] } }, counters: { likes: 1, dislikes: 0, stars: 0, points: 8, messages: 2 } });
const doc = summary({ id: "018f3e11-2c4d-7a40-a9d6-doc00000001", kind: "doc", title: "Entity graph design", createdBy: mira, excerpt: "Envelope, hierarchy, edges, discussion, and projection semantics.", state: { kind: "doc", format: "markdown", childCount: 4 }, counters: { likes: 6, dislikes: 0, stars: 4, points: 33, messages: 9 } });
const channel = summary({ id: "018f3e11-2c4d-7a40-a9d6-chan0000001", kind: "channel", title: "collab-v2", createdBy: noa, excerpt: "Build the entity graph workspace.", state: { kind: "channel", topic: "Build the entity graph workspace", unreadCount: 3, workingAgentCount: 2 }, counters: { likes: 0, dislikes: 0, stars: 1, points: 0, messages: 24 } });

const emptyConnections: Connections = { parent: null, children: [], groups: [] };
const detail = (entity: EntitySummary, content: EntityDetail["content"], connections = emptyConnections): EntityDetail => ({ ...entity, content, connections, hierarchy: { parent: null, children: { items: [], nextCursor: null }, path: [] }, capabilities: { canEdit: true, canDelete: true, canAddChild: true, canLink: true, canPull: true, canReact: true, canGrantPoints: true, canComplete: entity.kind === "task" } });

export const mockCollabWorkspaceData: CollabWorkspaceData = {
    space: { id: spaceId, name: "Maestro Collab", description: "A shared graph for people and agents." },
    navigation: [{ id: "home", label: "Home", icon: "home" }, { id: "channels", label: "Channels", icon: "channel" }, { id: "tasks", label: "Tasks", icon: "task" }, { id: "docs", label: "Docs", icon: "doc" }, { id: "team", label: "Team", icon: "member" }, { id: "tracking", label: "Tracking", icon: "pr" }, { id: "graph", label: "Graph", icon: "graph" }],
    collection: { query: { id: "my-work", title: "My work", spaceId, kinds: ["task"], layout: "board", groupBy: "workStatus" }, page: { items: [task103, task104, doc], nextCursor: null } },
    entities: {
        [task103.id]: detail(task103, { description: "Render hierarchy and typed edges as a reliable, reusable rail. Keep blocked dependencies explicit and preserve open-in-panel behavior.", acceptanceCriteria: [{ id: "c1", label: "Group edges by type and direction", done: true }, { id: "c2", label: "Show unresolved hard dependencies", done: false }, { id: "c3", label: "Open any linked entity in the stack", done: false }], attributes: [{ label: "Type", value: "Design" }, { label: "Pull", value: "v3 pinned · content v5" }] }, { parent: null, children: [], groups: [{ type: "Depends on", direction: "outgoing", unresolvedCount: 1, items: [{ id: task104.id, kind: "task", title: "T-104 unread semantics", state: task104.state, badges: task104.badges }] }, { type: "Attached", direction: "incoming", items: [{ id: channel.id, kind: "channel", title: "collab-v2", state: channel.state }, { id: doc.id, kind: "doc", title: "Entity graph design", state: doc.state }] }, { type: "Assigned to", direction: "outgoing", items: [{ id: forge.id, kind: "team_member", title: "Forge" }] }] }),
        [task104.id]: detail(task104, { description: "Design a single read-mark model that can support every discussion anchor.", acceptanceCriteria: [{ id: "c1", label: "Define anchor-level mark", done: false }] }),
        [doc.id]: detail(doc, { description: "The durable product and backend design for Collab V2.", attributes: [{ label: "Format", value: "Markdown" }, { label: "Children", value: "4 chapters" }] }),
        [channel.id]: detail(channel, { description: "A hub for the V2 workspace build. Linked tasks and documents become auto-tabs." }),
    },
    threads: { [task103.id]: { anchorId: task103.id, nextCursor: null, items: [{ id: "msg-101", parentId: null, author: mira, body: "Spec bumped to v5 — the blocked badge moves per-item so collections stay scannable.", createdAt: "2026-07-24T10:15:00.000Z", counters: { likes: 2, stars: 0 } }, { id: "msg-102", parentId: "msg-101", author: forge, body: "Acknowledged. I re-pulled at v5 and am mapping the rail states now.", createdAt: "2026-07-24T10:16:00.000Z", counters: { likes: 1, stars: 1 }, embeddedEntity: doc }] },
    },
    presence: { [task103.id]: { entityId: task103.id, viewers: [mira, forge], typing: [forge] } },
    activity: { [task103.id]: { entityId: task103.id, nextCursor: null, items: [{ id: "act-1", actor: forge, verb: "updated", summary: "moved the task to Working", createdAt: "2026-07-24T10:16:00.000Z" }, { id: "act-2", actor: mira, verb: "linked", summary: "attached Entity graph design", createdAt: "2026-07-24T10:12:00.000Z" }] } },
};
