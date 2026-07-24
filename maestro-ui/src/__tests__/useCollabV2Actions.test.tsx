import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCollabV2Actions } from "../components/collab-workspace/useCollabV2Actions";

const task = { id: "task-1", kind: "task", title: "Ship actions" } as any;

function actionClient(overrides: Record<string, unknown> = {}) {
    return {
        createTask: vi.fn().mockResolvedValue(task),
        updateTask: vi.fn().mockResolvedValue(task),
        createTaskAxis: vi.fn().mockResolvedValue({ id: "axis-1" }),
        postMessage: vi.fn().mockResolvedValue({ ...task, id: "message-1", kind: "message" }),
        react: vi.fn().mockResolvedValue({ active: true }),
        grantPoints: vi.fn().mockResolvedValue({ id: "point-1" }),
        createEdge: vi.fn().mockResolvedValue({ patches: [] }),
        place: vi.fn().mockResolvedValue({ patches: [] }),
        moveEntity: vi.fn().mockResolvedValue({ patches: [] }),
        completeTask: vi.fn().mockResolvedValue({ patches: [] }),
        pullEntity: vi.fn().mockResolvedValue({ patches: [] }),
        updateWork: vi.fn().mockResolvedValue({ patches: [] }),
        createDoc: vi.fn().mockResolvedValue({ patches: [] }),
        createFile: vi.fn().mockResolvedValue({ patches: [] }),
        markInboxRead: vi.fn().mockResolvedValue(undefined),
        markRead: vi.fn().mockResolvedValue(undefined),
        refreshTracking: vi.fn().mockResolvedValue({ patches: [] }),
        ...overrides,
    } as any;
}

describe("useCollabV2Actions", () => {
    it("adds the authenticated actor, forwards idempotency IDs where supported, and reloads", async () => {
        const client = actionClient();
        const reload = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useCollabV2Actions({ spaceId: "space-1", actorId: "member-1", reload, client }));

        let taskReceipt: any;
        let messageReceipt: any;
        let pointsReceipt: any;
        await act(async () => {
            taskReceipt = await result.current.createTask({ title: "Ship actions" });
            messageReceipt = await result.current.postMessage("task-1", { body: "Ready" });
            pointsReceipt = await result.current.grantPoints("task-1", { amount: 3 });
        });

        expect(client.createTask).toHaveBeenCalledWith("space-1", { actorId: "member-1", title: "Ship actions" });
        expect(client.postMessage).toHaveBeenCalledWith("task-1", expect.objectContaining({ actorId: "member-1", clientMessageId: "collab-v2:postMessage:2" }));
        expect(client.grantPoints).toHaveBeenCalledWith("task-1", expect.objectContaining({ actorId: "member-1", clientEventId: "collab-v2:grantPoints:3" }));
        expect(taskReceipt.reconciliation).toBe("refreshed");
        expect(messageReceipt.clientMutationId).toBe("collab-v2:postMessage:2");
        expect(pointsReceipt.clientMutationId).toBe("collab-v2:grantPoints:3");
        expect(reload).toHaveBeenCalledTimes(3);
        expect(result.current.pending).toEqual({});
    });

    it("rolls back optimistic state only when the command fails and records a typed error", async () => {
        const failure = new Error("not allowed");
        const client = actionClient({ react: vi.fn().mockRejectedValue(failure) });
        const rollback = vi.fn();
        const apply = vi.fn().mockReturnValue(rollback);
        const reload = vi.fn();
        const { result } = renderHook(() => useCollabV2Actions({ spaceId: "space-1", actorId: "member-1", reload, client, optimistic: { apply } }));

        await act(async () => {
            await expect(result.current.setReaction("task-1", { type: "likes", active: true })).rejects.toThrow("not allowed");
        });

        expect(apply).toHaveBeenCalledWith({ name: "setReaction", clientMutationId: "collab-v2:setReaction:1" });
        expect(rollback).toHaveBeenCalledOnce();
        expect(reload).not.toHaveBeenCalled();
        expect(result.current.error).toMatchObject({ operation: "setReaction", clientMutationId: "collab-v2:setReaction:1", cause: failure });
    });

    it("does not replay a successful command when projection refresh fails", async () => {
        const client = actionClient();
        const reload = vi.fn().mockRejectedValue(new Error("offline"));
        const { result } = renderHook(() => useCollabV2Actions({ spaceId: "space-1", actorId: "member-1", reload, client }));

        let receipt: any;
        await act(async () => { receipt = await result.current.createTaskAxis({ name: "Area" }); });

        expect(receipt).toMatchObject({ clientMutationId: "collab-v2:createTaskAxis:1", reconciliation: "refresh_failed" });
        expect(client.createTaskAxis).toHaveBeenCalledOnce();
        expect(result.current.refreshError?.message).toBe("offline");
    });

    it("correlates placement, completion, pull, work, docs, files, and inbox commands", async () => {
        const client = actionClient();
        const { result } = renderHook(() => useCollabV2Actions({ spaceId: "space-1", actorId: "member-1", reload: vi.fn().mockResolvedValue(undefined), client }));
        await act(async () => {
            await result.current.place({ sourceId: "a", targetId: "b", intent: "attach" });
            await result.current.completeTask("task-1", { expectedVersion: 2, completerIds: ["member-1"] });
            await result.current.pullEntity("task-1", { pinnedVersion: 2 });
            await result.current.updateWork("task-1", { status: "working" });
            await result.current.createDoc({ title: "Plan" });
            await result.current.createFile({ name: "plan.pdf", mimeType: "application/pdf", sizeBytes: 4, storagePath: "space/plan.pdf" });
            await result.current.markInboxRead("notification-1");
        });
        expect(client.place).toHaveBeenCalledWith(expect.objectContaining({ actorId: "member-1", clientMutationId: "collab-v2:place:1" }));
        expect(client.completeTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ clientMutationId: "collab-v2:completeTask:2" }));
        expect(client.createDoc).toHaveBeenCalledWith("space-1", expect.objectContaining({ clientMutationId: "collab-v2:createDoc:5" }));
        expect(client.markInboxRead).toHaveBeenCalledWith("notification-1");
    });
});
