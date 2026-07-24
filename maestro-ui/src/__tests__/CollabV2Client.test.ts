import { afterEach, describe, expect, it, vi } from "vitest";
import { CollabV2Client } from "../components/collab-workspace/CollabV2Client";

const rawTask = {
    id: "018f3e11-2c4d-7a40-a9d6-task000103", spaceId: "018f3e11-2c4d-7a40-a9d6-space000001", kind: "task", parentId: null, position: 0, visibility: "space", createdBy: "018f3e11-2c4d-7a40-a9d6-member00001", version: 2, activityAt: "2026-07-24T10:00:00.000Z", createdAt: "2026-07-24T09:00:00.000Z", updatedAt: "2026-07-24T10:00:00.000Z", deletedAt: null, title: "Wire the workspace", detail: { title: "Wire the workspace", workStatus: "working", priority: "high", axes: { type: "code" }, acceptanceCriteria: [{ done: true }] }, counters: { likes: 2, dislikes: 0, stars: 1, points: 8, messages: 3 },
};

describe("CollabV2Client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("forwards Firebase identity to the façade and adapts CollectionResult", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { query: { spaceId: rawTask.spaceId, kinds: ["task"], layout: "board" }, page: { items: [rawTask], nextCursor: "opaque-next" } } }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new CollabV2Client(async () => "firebase-id-token", "http://localhost:4567/api/collab/v2", "firebase-user-1");

        const result = await client.queryCollection({ id: "my-work", title: "My work", spaceId: rawTask.spaceId, kinds: ["task"], layout: "board" });

        expect(fetchMock).toHaveBeenCalledWith("http://localhost:4567/api/collab/v2/collections/query", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Collab-Firebase-Token": "firebase-id-token", "X-Collab-Firebase-Uid": "firebase-user-1" }) }));
        expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ spaceId: rawTask.spaceId, kinds: ["task"], layout: "board" });
        expect(result.query).toMatchObject({ id: "my-work", title: "My work" });
        expect(result.page.items[0].title).toBe("Wire the workspace");
        expect(result.page.items[0].state).toMatchObject({ kind: "task", workStatus: "working", priority: "high" });
        expect(result.page.nextCursor).toBe("opaque-next");
    });

    it("turns façade failures into a typed API error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })));
        const client = new CollabV2Client(async () => "firebase-id-token", "http://localhost:4567/api/collab/v2");
        await expect(client.identity()).rejects.toMatchObject({ name: "CollabV2ApiError", status: 403, message: "forbidden" });
    });

    it("uses the server's explanatory message instead of its boolean error flag", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: true, message: "Firebase tokens are not accepted by this Supabase project." }), { status: 403 })));
        const client = new CollabV2Client(async () => "firebase-id-token", "http://localhost:4567/api/collab/v2");
        await expect(client.listSpaces()).rejects.toMatchObject({ name: "CollabV2ApiError", status: 403, message: "Firebase tokens are not accepted by this Supabase project." });
    });

    it("creates a V2 space through the façade", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: rawTask.spaceId }), { status: 201 }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new CollabV2Client(async () => "firebase-id-token", "http://localhost:4567/api/collab/v2");

        await expect(client.createSpace({ name: "Design", description: "Design decisions" })).resolves.toEqual({ id: rawTask.spaceId });
        expect(fetchMock).toHaveBeenCalledWith("http://localhost:4567/api/collab/v2/spaces", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Design", description: "Design decisions" }) }));
    });

    it("uses the public discovery and join onboarding routes", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify([{ id: rawTask.spaceId, name: "Public", isMember: false }]), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ spaceId: rawTask.spaceId, memberId: "member-1", joined: true }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const client = new CollabV2Client(async () => "firebase-id-token", "http://localhost:4567/api/collab/v2");

        await client.discoverSpaces("maestro/app");
        await client.joinSpace(rawTask.spaceId);

        expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4567/api/collab/v2/spaces/discover?githubRepo=maestro%2Fapp");
        expect(fetchMock.mock.calls[1]).toEqual([`http://localhost:4567/api/collab/v2/spaces/${rawTask.spaceId}/join`, expect.objectContaining({ method: "POST", body: "{}" })]);
    });

    it("sends graph, placement, completion, inbox, and event calls to the façade", async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })));
        vi.stubGlobal("fetch", fetchMock);
        const client = new CollabV2Client(async () => "token", "http://localhost/api/collab/v2");
        await client.place({ actorId: "member-1", clientMutationId: "m1", sourceId: "a", targetId: "b", intent: "attach" });
        await client.completeTask("task-1", { actorId: "member-1", clientMutationId: "m2", expectedVersion: 3, completerIds: ["member-1"] });
        await client.listInbox("space-1", "cursor-1");
        await client.getEvents("space-1", "event-1");
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "http://localhost/api/collab/v2/placements",
            "http://localhost/api/collab/v2/tasks/task-1/complete",
            "http://localhost/api/collab/v2/inbox?spaceId=space-1&cursor=cursor-1",
            "http://localhost/api/collab/v2/spaces/space-1/events?cursor=event-1",
        ]);
    });
});
