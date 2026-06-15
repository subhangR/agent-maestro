import { useState, useRef, useEffect, useCallback } from "react";
import { MaestroTask, CreateTaskPayload, TaskImage } from "../app/types/maestro";
import { useMaestroStore } from "../stores/useMaestroStore";
import { maestroClient } from "../utils/MaestroClient";
import { makeId } from "../app/utils/id";

export type DraftPhase = "idle" | "creating" | "created" | "failed";

interface UseDraftTaskLifecycleOptions {
    projectId: string;
    parentId?: string;
    enabled: boolean;
    getFormData: () => Omit<CreateTaskPayload, "projectId" | "clientRequestId">;
    debounceMs?: number;
}

interface UseDraftTaskLifecycleResult {
    draftTaskId: string | null;
    draftTask: MaestroTask | null;
    phase: DraftPhase;
    discard: () => Promise<void>;
    ensureCreated: () => Promise<string | null>;
}

export function useDraftTaskLifecycle({
    projectId,
    parentId,
    enabled,
    getFormData,
    debounceMs = 1000,
}: UseDraftTaskLifecycleOptions): UseDraftTaskLifecycleResult {
    const [phase, setPhase] = useState<DraftPhase>("idle");
    const [draftTaskId, setDraftTaskId] = useState<string | null>(null);

    // Refs for staleness-free access in async callbacks
    const draftTaskIdRef = useRef<string | null>(null);
    const phaseRef = useRef<DraftPhase>("idle");
    const clientRequestIdRef = useRef<string>(makeId());
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const createPromiseRef = useRef<Promise<string | null> | null>(null);
    const getFormDataRef = useRef(getFormData);
    const discardedRef = useRef(false);

    getFormDataRef.current = getFormData;

    // Read draft task from the Zustand store (single source of truth)
    const draftTask = useMaestroStore(
        useCallback((s: any) => draftTaskId ? s.tasks[draftTaskId] ?? null : null, [draftTaskId])
    );

    // Reset everything when disabled (modal closed or switched to edit mode)
    useEffect(() => {
        if (!enabled) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = null;
            createPromiseRef.current = null;
            setPhase("idle");
            phaseRef.current = "idle";
            setDraftTaskId(null);
            draftTaskIdRef.current = null;
            clientRequestIdRef.current = makeId();
            discardedRef.current = false;
        }
    }, [enabled]);

    const doCreate = useCallback(async (): Promise<string | null> => {
        if (phaseRef.current === "created" && draftTaskIdRef.current) {
            return draftTaskIdRef.current;
        }
        if (discardedRef.current) return null;

        setPhase("creating");
        phaseRef.current = "creating";

        try {
            const formData = getFormDataRef.current();
            const storeCreateTask = useMaestroStore.getState().createTask;
            const task = await storeCreateTask({
                ...formData,
                projectId,
                parentId: parentId || undefined,
                clientRequestId: clientRequestIdRef.current,
            });

            if (discardedRef.current) {
                // Discarded while in-flight — clean up
                try {
                    await useMaestroStore.getState().deleteTask(task.id);
                } catch { /* best effort */ }
                return null;
            }

            setPhase("created");
            phaseRef.current = "created";
            setDraftTaskId(task.id);
            draftTaskIdRef.current = task.id;
            return task.id;
        } catch {
            if (!discardedRef.current) {
                setPhase("failed");
                phaseRef.current = "failed";
            }
            return null;
        }
    }, [projectId, parentId]);

    // Debounced auto-create: start the timer when enabled and form has content
    // We track a "trigger" version to debounce on content changes
    const [triggerVersion, setTriggerVersion] = useState(0);

    const triggerAutoCreate = useCallback(() => {
        setTriggerVersion(v => v + 1);
    }, []);

    useEffect(() => {
        if (!enabled || triggerVersion === 0) return;
        if (phaseRef.current !== "idle") return;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (phaseRef.current !== "idle" || discardedRef.current) return;
            const promise = doCreate();
            createPromiseRef.current = promise;
        }, debounceMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [enabled, triggerVersion, debounceMs, doCreate]);

    // ensureCreated: forces immediate creation if not yet created
    const ensureCreated = useCallback(async (): Promise<string | null> => {
        // Already created
        if (phaseRef.current === "created" && draftTaskIdRef.current) {
            return draftTaskIdRef.current;
        }
        // Currently creating — await the in-flight promise
        if (phaseRef.current === "creating" && createPromiseRef.current) {
            return createPromiseRef.current;
        }
        // Idle or failed — create immediately
        if (timerRef.current) clearTimeout(timerRef.current);
        const promise = doCreate();
        createPromiseRef.current = promise;
        return promise;
    }, [doCreate]);

    // discard: abort in-flight + delete created task + reset
    const discard = useCallback(async () => {
        discardedRef.current = true;

        // Cancel pending timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        // If creating, wait for it then delete
        if (phaseRef.current === "creating" && createPromiseRef.current) {
            await createPromiseRef.current; // doCreate handles discardedRef
        }

        // Delete server task if it was created
        const taskId = draftTaskIdRef.current;
        if (taskId) {
            try {
                await useMaestroStore.getState().deleteTask(taskId);
            } catch { /* best effort */ }
        }

        // Reset state
        createPromiseRef.current = null;
        setPhase("idle");
        phaseRef.current = "idle";
        setDraftTaskId(null);
        draftTaskIdRef.current = null;
        clientRequestIdRef.current = makeId();
        discardedRef.current = false;
    }, []);

    // Upload staged images after draft creation; returns successfully uploaded entries
    const uploadStagedImages = useCallback(async (taskId: string, files: File[]): Promise<TaskImage[]> => {
        const uploaded: TaskImage[] = [];
        for (const file of files) {
            try {
                uploaded.push(await maestroClient.uploadTaskImage(taskId, file));
            } catch { /* silent */ }
        }
        return uploaded;
    }, []);

    return {
        draftTaskId,
        draftTask,
        phase,
        discard,
        ensureCreated,
        // Expose trigger for the auto-create debounce
        _triggerAutoCreate: triggerAutoCreate,
        _uploadStagedImages: uploadStagedImages,
    } as UseDraftTaskLifecycleResult & {
        _triggerAutoCreate: () => void;
        _uploadStagedImages: (taskId: string, files: File[]) => Promise<TaskImage[]>;
    };
}
