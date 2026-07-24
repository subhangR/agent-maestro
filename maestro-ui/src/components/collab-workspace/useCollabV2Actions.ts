import { useCallback, useMemo, useRef, useState } from "react";
import { useFirebaseAuthStore } from "../../stores/useFirebaseAuthStore";
import { CollabV2Client, type CreateTaskAxisInput, type CreateTaskInput, type UpdateTaskInput } from "./CollabV2Client";
import type { EntitySummary } from "./types";

/** Only façade commands that are deployed today belong here. Placement, edges,
 * completion, pulls, search, documents, and realtime are intentionally absent. */
export type CollabV2ActionName = "createTask" | "updateTask" | "createTaskAxis" | "postMessage" | "setReaction" | "grantPoints" | "createEdge" | "place" | "moveEntity" | "completeTask" | "pullEntity" | "updateWork" | "createDoc" | "createFile" | "markInboxRead" | "markRead" | "refreshTracking";

export type CollabV2ActionError = {
    operation: CollabV2ActionName;
    clientMutationId: string;
    cause: Error;
};

export type CollabV2ActionState = {
    pending: Readonly<Record<string, CollabV2ActionName>>;
    error: CollabV2ActionError | null;
    /** A command can succeed while the read-model reconciliation fails. */
    refreshError: Error | null;
};

export type CollabV2MutationReceipt<T> = {
    value: T;
    clientMutationId: string;
    /** `refresh_failed` means the server accepted the command; retry `reload`, not the command. */
    reconciliation: "refreshed" | "refresh_failed";
};

export type CollabV2OptimisticOperation = {
    name: CollabV2ActionName;
    clientMutationId: string;
};

/** A consumer-owned projection patch. Roll it back only when the command itself fails. */
export type CollabV2OptimisticAdapter = {
    apply?: (operation: CollabV2OptimisticOperation) => void | (() => void);
    reconcile?: (operation: CollabV2OptimisticOperation) => void;
};

type ActionClient = Pick<CollabV2Client, "createTask" | "updateTask" | "createTaskAxis" | "postMessage" | "react" | "grantPoints" | "createEdge" | "place" | "moveEntity" | "completeTask" | "pullEntity" | "updateWork" | "createDoc" | "createFile" | "markInboxRead" | "markRead" | "refreshTracking">;

export type UseCollabV2ActionsOptions = {
    spaceId: string | null;
    actorId: string | null;
    /** Refreshes the DTO projection after a successful mutation. */
    reload: () => Promise<void>;
    /** Useful for tests and a future workspace-level client provider. */
    client?: ActionClient | null;
    optimistic?: CollabV2OptimisticAdapter;
};

type WithoutActor<T> = Omit<T, "actorId">;

/**
 * Mutation seam for the live, limited Collab V2 façade.
 *
 * IDs are monotonic per mounted action hook and are sent to the APIs that expose
 * idempotency fields today (messages and points). Other supported endpoints do not
 * accept an extra key yet, so their IDs remain local correlation keys.
 */
export function useCollabV2Actions({ spaceId, actorId, reload, client: suppliedClient, optimistic }: UseCollabV2ActionsOptions) {
    const user = useFirebaseAuthStore((state) => state.user);
    const authenticatedClient = useMemo<ActionClient | null>(
        () => user ? new CollabV2Client(() => user.getIdToken(), undefined, user.uid) : null,
        [user],
    );
    const client = suppliedClient === undefined ? authenticatedClient : suppliedClient;
    const sequence = useRef(0);
    const [state, setState] = useState<CollabV2ActionState>({ pending: {}, error: null, refreshError: null });

    const run = useCallback(async <T,>(name: CollabV2ActionName, execute: (context: { client: ActionClient; spaceId: string; actorId: string; clientMutationId: string }) => Promise<T>): Promise<CollabV2MutationReceipt<T>> => {
        if (!client) throw new Error("Sign in before changing this Collab workspace.");
        if (!spaceId) throw new Error("Select a Collab workspace before changing it.");
        if (!actorId) throw new Error("Collab identity has not loaded yet.");

        const clientMutationId = `collab-v2:${name}:${++sequence.current}`;
        const operation = { name, clientMutationId } as const;
        const rollback = optimistic?.apply?.(operation);
        setState((current) => ({ ...current, pending: { ...current.pending, [clientMutationId]: name }, error: null, refreshError: null }));

        try {
            const value = await execute({ client, spaceId, actorId, clientMutationId });
            let reconciliation: CollabV2MutationReceipt<T>["reconciliation"] = "refreshed";
            try {
                await reload();
                optimistic?.reconcile?.(operation);
            } catch (cause) {
                reconciliation = "refresh_failed";
                setState((current) => ({ ...current, refreshError: asError(cause) }));
            }
            return { value, clientMutationId, reconciliation };
        } catch (cause) {
            rollback?.();
            const error = asError(cause);
            setState((current) => ({ ...current, error: { operation: name, clientMutationId, cause: error } }));
            throw error;
        } finally {
            setState((current) => {
                const { [clientMutationId]: _completed, ...pending } = current.pending;
                return { ...current, pending };
            });
        }
    }, [actorId, client, optimistic, reload, spaceId]);

    const createTask = useCallback((input: WithoutActor<CreateTaskInput>) => run("createTask", ({ client: actionClient, spaceId: actionSpaceId, actorId: actionActorId }) => actionClient.createTask(actionSpaceId, { ...input, actorId: actionActorId })), [run]);
    const updateTask = useCallback((taskId: string, input: WithoutActor<UpdateTaskInput>) => run("updateTask", ({ client: actionClient, actorId: actionActorId }) => actionClient.updateTask(taskId, { ...input, actorId: actionActorId })), [run]);
    const createTaskAxis = useCallback((input: CreateTaskAxisInput) => run("createTaskAxis", ({ client: actionClient, spaceId: actionSpaceId }) => actionClient.createTaskAxis(actionSpaceId, input)), [run]);
    const postMessage = useCallback((anchorId: string, input: WithoutActor<Parameters<ActionClient["postMessage"]>[1]>) => run("postMessage", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.postMessage(anchorId, { ...input, actorId: actionActorId, clientMessageId: clientMutationId })), [run]);
    const setReaction = useCallback((entityId: string, input: Omit<Parameters<ActionClient["react"]>[1], "actorId">) => run("setReaction", ({ client: actionClient, actorId: actionActorId }) => actionClient.react(entityId, { ...input, actorId: actionActorId })), [run]);
    const grantPoints = useCallback((entityId: string, input: WithoutActor<Parameters<ActionClient["grantPoints"]>[1]>) => run("grantPoints", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.grantPoints(entityId, { ...input, actorId: actionActorId, clientEventId: clientMutationId })), [run]);

    const createEdge = useCallback((input: Omit<Parameters<ActionClient["createEdge"]>[0], "actorId" | "clientMutationId">) => run("createEdge", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.createEdge({ ...input, actorId: actionActorId, clientMutationId })), [run]);
    const place = useCallback((input: Omit<Parameters<ActionClient["place"]>[0], "actorId" | "clientMutationId">) => run("place", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.place({ ...input, actorId: actionActorId, clientMutationId })), [run]);
    const moveEntity = useCallback((entityId: string, input: Omit<Parameters<ActionClient["moveEntity"]>[1], "actorId" | "clientMutationId">) => run("moveEntity", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.moveEntity(entityId, { ...input, actorId: actionActorId, clientMutationId })), [run]);
    const completeTask = useCallback((taskId: string, input: Omit<Parameters<ActionClient["completeTask"]>[1], "actorId" | "clientMutationId">) => run("completeTask", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.completeTask(taskId, { ...input, actorId: actionActorId, clientMutationId })), [run]);
    const pullEntity = useCallback((entityId: string, input: Omit<Parameters<ActionClient["pullEntity"]>[1], "actorId" | "clientMutationId">) => run("pullEntity", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.pullEntity(entityId, { ...input, actorId: actionActorId, clientMutationId })), [run]);
    const updateWork = useCallback((entityId: string, input: Omit<Parameters<ActionClient["updateWork"]>[1], "actorId" | "clientMutationId">) => run("updateWork", ({ client: actionClient, actorId: actionActorId, clientMutationId }) => actionClient.updateWork(entityId, { ...input, actorId: actionActorId, clientMutationId })), [run]);
    const createDoc = useCallback((input: Omit<Parameters<ActionClient["createDoc"]>[1], "actorId" | "clientMutationId">) => run("createDoc", ({ client: actionClient, spaceId: actionSpaceId, actorId: actionActorId, clientMutationId }) => actionClient.createDoc(actionSpaceId, { ...input, actorId: actionActorId, clientMutationId })), [run]);
    const createFile = useCallback((input: Omit<Parameters<ActionClient["createFile"]>[1], "actorId" | "clientMutationId">) => run("createFile", ({ client: actionClient, spaceId: actionSpaceId, actorId: actionActorId, clientMutationId }) => actionClient.createFile(actionSpaceId, { ...input, actorId: actionActorId, clientMutationId })), [run]);
    const markInboxRead = useCallback((notificationId: string) => run("markInboxRead", ({ client: actionClient }) => actionClient.markInboxRead(notificationId)), [run]);
    const markRead = useCallback((anchorId: string) => run("markRead", ({ client: actionClient }) => actionClient.markRead(anchorId)), [run]);
    const refreshTracking = useCallback((entityIds?: string[]) => run("refreshTracking", ({ client: actionClient }) => actionClient.refreshTracking(entityIds)), [run]);

    return { ...state, createTask, updateTask, createTaskAxis, postMessage, setReaction, grantPoints, createEdge, place, moveEntity, completeTask, pullEntity, updateWork, createDoc, createFile, markInboxRead, markRead, refreshTracking };
}

function asError(cause: unknown): Error {
    return cause instanceof Error ? cause : new Error("Collab V2 command failed.");
}

export type CollabV2Actions = ReturnType<typeof useCollabV2Actions>;
export type CollabV2TaskMutation = CollabV2MutationReceipt<EntitySummary>;
