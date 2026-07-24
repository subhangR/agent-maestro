import React from "react";
import { CollabWorkspace } from "./CollabWorkspace";
import { useCollabV2Workspace } from "./useCollabV2Workspace";
import { useCollabV2Actions } from "./useCollabV2Actions";

/**
 * Connected entry point for a known V2 UUID space. It is intentionally separate
 * from the legacy Firebase SpaceWindow because V1 Firestore IDs are not V2 UUIDs.
 */
export function LiveCollabWorkspace({ spaceId }: { spaceId: string }) {
    const workspace = useCollabV2Workspace(spaceId);
    const mutations = useCollabV2Actions({ spaceId, actorId: workspace.actorId, reload: workspace.reload });
    if (workspace.loading) return <main className="collabWorkspace collabWorkspace--state" aria-busy="true"><p>Loading Collab workspace…</p></main>;
    if (workspace.error) return <main className="collabWorkspace collabWorkspace--state"><div role="alert"><strong>Couldn’t load Collab workspace.</strong><p>{workspace.error.message}</p><button type="button" onClick={() => void workspace.reload()}>Retry</button></div></main>;
    if (!workspace.data) return <main className="collabWorkspace collabWorkspace--state"><p>No Collab data is available for this space.</p></main>;
    const actions = {
        createTask: (input: { title: string; description?: string; parentId?: string | null }) => mutations.createTask(input),
        createDoc: (input: { title: string; body?: string; format?: "markdown" | "mermaid" | "excalidraw" }) => mutations.createDoc(input),
        createFile: (input: { name: string; mimeType: string; sizeBytes: number; storagePath: string }) => mutations.createFile(input),
        postMessage: (anchorId: string, body: string) => mutations.postMessage(anchorId, { body }),
        setReaction: (entityId: string, type: "likes" | "stars", active: boolean) => mutations.setReaction(entityId, { type, active }),
        grantPoints: (entityId: string, amount: number) => mutations.grantPoints(entityId, { amount }),
        place: (placement: { sourceId: string; targetId: string; intent: "attach" | "assign" | "depend" | "subtask" | "embed" | "reparent" }) => mutations.place(placement),
        createEdge: (input: { srcId: string; dstId: string; type: string; props?: Record<string, unknown> }) => mutations.createEdge(input),
        completeTask: (entity: Parameters<NonNullable<import("./EntityPanel").EntityPanelActions["onComplete"]>>[0]) => mutations.completeTask(entity.id, { expectedVersion: entity.version, completerIds: workspace.actorId ? [workspace.actorId] : [] }),
        pullEntity: (entity: Parameters<NonNullable<import("./EntityPanel").EntityPanelActions["onPull"]>>[0]) => mutations.pullEntity(entity.id, { pinnedVersion: entity.version }),
        updateWork: (entity: Parameters<NonNullable<import("./EntityPanel").EntityPanelActions["onWork"]>>[0], status: import("./types").WorkStatus) => mutations.updateWork(entity.id, { status }),
        markInboxRead: (notificationId: string) => mutations.markInboxRead(notificationId),
        refreshTracking: (entityIds?: string[]) => mutations.refreshTracking(entityIds),
    };
    return <CollabWorkspace data={workspace.data} actions={actions} pending={Object.keys(mutations.pending).length > 0} actionError={mutations.error?.cause.message ?? mutations.refreshError?.message ?? null} />;
}
