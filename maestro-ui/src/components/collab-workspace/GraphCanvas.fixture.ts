import type { GraphCanvasResult } from "./GraphCanvas";
import type { ActorSummary, EntitySummary } from "./types";

const actor: ActorSummary = { id: "03b5d53d-1422-4cb5-b3a7-65159be2b1f7", kind: "member", displayName: "Mira", initials: "MI", isAgent: false, color: "#907e68" };
const agent: ActorSummary = { id: "c5e5c31a-e78c-4f23-82f7-af694977c21c", kind: "team_member", displayName: "Forge", initials: "FG", isAgent: true, color: "#8ba58b" };
const spaceId = "d8d5ec68-c1a2-4bed-b35f-ecf1cc1bed54";

function task(id: string, title: string, status: "open" | "working" | "blocked" | "done", creator = actor): EntitySummary {
    return { id, spaceId, kind: "task", title, parentId: null, createdBy: creator, createdAt: "2026-07-24T10:00:00.000Z", updatedAt: "2026-07-24T10:00:00.000Z", activityAt: "2026-07-24T10:00:00.000Z", version: 3, position: 0, visibility: "space", deletedAt: null, excerpt: "A projected entity card for graph exploration.", counters: { likes: 0, dislikes: 0, stars: 0, points: 12, messages: 3 }, badges: status === "blocked" ? { blocked: { unresolvedHardDependencyCount: 1, waitingOn: [] } } : {}, state: { kind: "task", workStatus: status, priority: "high", axes: { type: "code" }, assignees: [creator], acceptance: { total: 3, completed: status === "done" ? 3 : 1 } } };
}

const doc: EntitySummary = { id: "aa1fb9b3-23fb-48dd-97ef-2e0b7e2092d8", spaceId, kind: "doc", title: "Entity graph design", parentId: null, createdBy: actor, createdAt: "2026-07-24T10:00:00.000Z", updatedAt: "2026-07-24T10:00:00.000Z", activityAt: "2026-07-24T10:00:00.000Z", version: 9, position: 0, visibility: "space", deletedAt: null, excerpt: "The durable graph model and interaction rules.", counters: { likes: 2, dislikes: 0, stars: 4, points: 21, messages: 6 }, badges: {}, state: { kind: "doc", format: "markdown", childCount: 2 } };

const milestone = task("5fe2f5bc-0c70-490c-9f79-3d89902a70e1", "Collab V2 milestone", "working", agent);
const chips = task("ec868fdb-6baa-4474-b36b-f7c5484f25e5", "Entity chips (Z1)", "done");
const rail = task("8c96f65a-1ec7-44bf-8769-2ee58d4db924", "Connections rail", "working", agent);
const hover = task("85107a19-cb86-449e-b28a-2d21d48b6c8a", "Hover previews (Z2)", "blocked");

export const mockGraphCanvasResult: GraphCanvasResult = {
    nodes: [doc, milestone, chips, rail, hover],
    edges: [
        { id: "240ca1a2-50c5-4339-a135-3fbf1f46ebd0", type: "attached_to", sourceId: doc.id, targetId: chips.id },
        { id: "5dbd6d86-6f99-41d0-a822-3f7c45d70353", type: "depends_on", sourceId: chips.id, targetId: rail.id, hard: true, resolved: true },
        { id: "8d6eafda-776c-4e9e-a24b-aa797ef13e27", type: "depends_on", sourceId: hover.id, targetId: chips.id, hard: true, resolved: false },
        { id: "771dbbf4-e69f-48cf-b8bc-27ba9c8cb171", type: "relates_to", sourceId: doc.id, targetId: rail.id },
    ],
    clusters: [{ parentId: milestone.id, childIds: [chips.id, rail.id, hover.id] }],
    layout: { [doc.id]: { x: 55, y: 240 }, [chips.id]: { x: 330, y: 110 }, [rail.id]: { x: 625, y: 110 }, [hover.id]: { x: 330, y: 290 }, [milestone.id]: { x: 625, y: 290 } },
};
