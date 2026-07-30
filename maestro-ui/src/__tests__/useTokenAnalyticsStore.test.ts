import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GlobalTokenSummary, TaskTokenSummary } from "../app/types/maestro";

// Mock the client before importing the store
vi.mock("../utils/MaestroClient", () => ({
    maestroClient: {
        getGlobalTokenSummary: vi.fn(),
        getTaskTokenSummary: vi.fn(),
    },
}));

import { maestroClient } from "../utils/MaestroClient";
import { useTokenAnalyticsStore } from "../stores/useTokenAnalyticsStore";

const mc = maestroClient as {
    getGlobalTokenSummary: ReturnType<typeof vi.fn>;
    getTaskTokenSummary: ReturnType<typeof vi.fn>;
};

function makeSnapshot(total = 100) {
    return {
        input: Math.floor(total * 0.6),
        output: Math.floor(total * 0.4),
        cacheCreate: 0,
        cacheRead: 0,
        total,
        provider: null,
        model: null,
        capturedAt: Date.now(),
    };
}

function makeGlobal(): GlobalTokenSummary {
    return {
        totals: makeSnapshot(500),
        byProvider: { claude: makeSnapshot(300), openai: makeSnapshot(200) },
        byModel: { "claude-opus-4-8": makeSnapshot(300) },
        sessionCount: 3,
        windowMs: 86400000,
    };
}

function makeTaskSummary(): TaskTokenSummary {
    return {
        taskId: "task_1",
        sessions: [
            { sessionId: "sess_a", tokenUsage: makeSnapshot(200) },
            { sessionId: "sess_b", tokenUsage: null },
        ],
        totals: makeSnapshot(200),
    };
}

const initial = useTokenAnalyticsStore.getState();

beforeEach(() => {
    useTokenAnalyticsStore.setState(initial, true);
    mc.getGlobalTokenSummary.mockReset();
    mc.getTaskTokenSummary.mockReset();
});

describe("fetchGlobalSummary", () => {
    it("stores the summary on success", async () => {
        const global = makeGlobal();
        mc.getGlobalTokenSummary.mockResolvedValue(global);

        await useTokenAnalyticsStore.getState().fetchGlobalSummary(86400000);

        expect(useTokenAnalyticsStore.getState().globalSummary).toEqual(global);
        expect(useTokenAnalyticsStore.getState().loadingGlobal).toBe(false);
        expect(useTokenAnalyticsStore.getState().globalError).toBeNull();
        expect(mc.getGlobalTokenSummary).toHaveBeenCalledWith(86400000);
    });

    it("stores error message on failure", async () => {
        mc.getGlobalTokenSummary.mockRejectedValue(new Error("network error"));

        await useTokenAnalyticsStore.getState().fetchGlobalSummary();

        expect(useTokenAnalyticsStore.getState().globalSummary).toBeNull();
        expect(useTokenAnalyticsStore.getState().loadingGlobal).toBe(false);
        expect(useTokenAnalyticsStore.getState().globalError).toBe("network error");
    });
});

describe("fetchTaskSummary", () => {
    it("stores the task summary under the task id", async () => {
        const summary = makeTaskSummary();
        mc.getTaskTokenSummary.mockResolvedValue(summary);

        await useTokenAnalyticsStore.getState().fetchTaskSummary("task_1");

        expect(useTokenAnalyticsStore.getState().taskSummaries["task_1"]).toEqual(summary);
        expect(useTokenAnalyticsStore.getState().loadingTasks["task_1"]).toBe(false);
    });

    it("does not double-fetch when already loading", async () => {
        let resolve!: (v: TaskTokenSummary) => void;
        mc.getTaskTokenSummary.mockReturnValue(new Promise<TaskTokenSummary>((r) => { resolve = r; }));

        // Start two concurrent fetches
        const p1 = useTokenAnalyticsStore.getState().fetchTaskSummary("task_1");
        const p2 = useTokenAnalyticsStore.getState().fetchTaskSummary("task_1");
        resolve(makeTaskSummary());
        await Promise.all([p1, p2]);

        // Client should only have been called once
        expect(mc.getTaskTokenSummary).toHaveBeenCalledTimes(1);
    });

    it("clears loading flag on error", async () => {
        mc.getTaskTokenSummary.mockRejectedValue(new Error("not found"));

        await useTokenAnalyticsStore.getState().fetchTaskSummary("task_x");

        expect(useTokenAnalyticsStore.getState().loadingTasks["task_x"]).toBe(false);
    });
});
