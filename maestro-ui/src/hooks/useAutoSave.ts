import { useState, useEffect, useRef, useCallback } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Auto-save hook that debounces changes and saves them.
 * Similar to VS Code / Cursor auto-save behavior.
 *
 * @param changeVersion - Increments each time a saveable change occurs
 * @param hasChanges - Whether there are actual unsaved changes vs server state
 * @param saveFn - Function to call to save. Should return a promise.
 * @param debounceMs - Debounce delay in ms (default 1000)
 * @param enabled - Whether auto-save is active (default true)
 */
export function useAutoSave({
    changeVersion,
    hasChanges,
    saveFn,
    debounceMs = 1000,
    enabled = true,
}: {
    changeVersion: number;
    hasChanges: boolean;
    saveFn: () => Promise<void>;
    debounceMs?: number;
    enabled?: boolean;
}) {
    const [status, setStatus] = useState<AutoSaveStatus>("idle");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveFnRef = useRef(saveFn);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedVersionRef = useRef(changeVersion);
    const isSavingRef = useRef(false);

    // Keep saveFn ref current without re-triggering effects
    saveFnRef.current = saveFn;

    // Reset the saved version baseline when changeVersion resets (e.g., modal re-open)
    useEffect(() => {
        if (changeVersion === 0) {
            lastSavedVersionRef.current = 0;
        }
    }, [changeVersion]);

    // Clear timers on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        };
    }, []);

    const doSave = useCallback(async () => {
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        setStatus("saving");
        try {
            await saveFnRef.current();
            setStatus("saved");
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = setTimeout(() => setStatus("idle"), 2000);
        } catch (err) {
            setStatus("error");
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = setTimeout(() => setStatus("idle"), 3000);
        } finally {
            isSavingRef.current = false;
        }
    }, []);

    // Debounce and auto-save when changes are detected
    useEffect(() => {
        // Skip if not enabled, no changes, or version hasn't advanced past last saved
        if (!enabled || !hasChanges || changeVersion <= lastSavedVersionRef.current) return;

        // Clear previous timer
        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            lastSavedVersionRef.current = changeVersion;
            doSave();
        }, debounceMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [changeVersion, hasChanges, enabled, debounceMs, doSave]);

    // Immediate save (bypass debounce) — returns a promise so callers can await
    const saveNow = useCallback(async () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!hasChanges) return;
        lastSavedVersionRef.current = changeVersion;
        await doSave();
    }, [hasChanges, changeVersion, doSave]);

    return { status, saveNow };
}
