import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { TaskTokenSummary } from "../app/types/maestro";

// ── Store mock ───────────────────────────────────────────────────────────────
const tokenStoreState: {
    taskSummaries: Record<string, TaskTokenSummary>;
    loadingTasks: Record<string, boolean>;
    fetchGlobalSummary: ReturnType<typeof vi.fn>;
    fetchTaskSummary: ReturnType<typeof vi.fn>;
} = {
    taskSummaries: {},
    loadingTasks: {},
    fetchGlobalSummary: vi.fn().mockResolvedValue(undefined),
    fetchTaskSummary: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../stores/useTokenAnalyticsStore", () => ({
    useTokenAnalyticsStore: <T,>(sel: (s: typeof tokenStoreState) => T): T => sel(tokenStoreState),
}));

import { TaskTokenTab } from "../components/maestro/task-modal/TaskTokenTab";

function snap(total = 1000) {
    return { input: 600, output: 400, cacheCreate: 0, cacheRead: 0, total, provider: null, model: null, capturedAt: Date.now() };
}

beforeEach(() => {
    tokenStoreState.taskSummaries = {};
    tokenStoreState.loadingTasks = {};
    tokenStoreState.fetchTaskSummary.mockClear();
});

describe("TaskTokenTab", () => {
    it("shows loading state when loading and no summary cached", () => {
        tokenStoreState.loadingTasks = { task_1: true };

        render(<TaskTokenTab taskId="task_1" />);

        expect(screen.getByText(/loading token usage/i)).toBeTruthy();
    });

    it("shows no data when not loading and no summary", () => {
        render(<TaskTokenTab taskId="task_1" />);

        expect(screen.getByText(/no token data/i)).toBeTruthy();
    });

    it("shows pending for sessions with null tokenUsage", () => {
        tokenStoreState.taskSummaries = {
            task_1: {
                taskId: "task_1",
                sessions: [
                    { sessionId: "sess_running", tokenUsage: null },
                ],
                totals: snap(0),
            },
        };

        render(<TaskTokenTab taskId="task_1" />);

        expect(screen.getByText("pending")).toBeTruthy();
    });

    it("renders token counts for completed sessions", () => {
        tokenStoreState.taskSummaries = {
            task_2: {
                taskId: "task_2",
                sessions: [
                    { sessionId: "sess_done", tokenUsage: snap(2000) },
                ],
                totals: snap(2000),
            },
        };

        render(<TaskTokenTab taskId="task_2" />);

        // Should show formatted token count for the session
        expect(screen.getAllByText(/total/i).length).toBeGreaterThan(0);
    });

    it("calls fetchTaskSummary on mount", async () => {
        await act(async () => {
            render(<TaskTokenTab taskId="task_x" />);
        });

        expect(tokenStoreState.fetchTaskSummary).toHaveBeenCalledWith("task_x");
    });

    it("shows disclaimer about pending sessions", () => {
        tokenStoreState.taskSummaries = {
            task_3: {
                taskId: "task_3",
                sessions: [{ sessionId: "sess_done", tokenUsage: snap(1000) }],
                totals: snap(1000),
            },
        };

        render(<TaskTokenTab taskId="task_3" />);

        expect(screen.getByText(/completed sessions only/i)).toBeTruthy();
    });
});
