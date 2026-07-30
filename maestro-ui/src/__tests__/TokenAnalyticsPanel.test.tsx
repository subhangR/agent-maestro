import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { GlobalTokenSummary } from "../app/types/maestro";

// ── Stores ──────────────────────────────────────────────────────────────────
const tokenStoreState: {
    globalSummary: GlobalTokenSummary | null;
    loadingGlobal: boolean;
    globalError: string | null;
    taskSummaries: Record<string, unknown>;
    loadingTasks: Record<string, boolean>;
    fetchGlobalSummary: ReturnType<typeof vi.fn>;
    fetchTaskSummary: ReturnType<typeof vi.fn>;
} = {
    globalSummary: null,
    loadingGlobal: false,
    globalError: null,
    taskSummaries: {},
    loadingTasks: {},
    fetchGlobalSummary: vi.fn().mockResolvedValue(undefined),
    fetchTaskSummary: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../stores/useTokenAnalyticsStore", () => ({
    useTokenAnalyticsStore: <T,>(sel: (s: typeof tokenStoreState) => T): T => sel(tokenStoreState),
}));

vi.mock("../stores/useMaestroStore", () => ({
    useMaestroStore: <T,>(sel: (s: { modelProfiles: Record<string, unknown> }) => T): T =>
        sel({ modelProfiles: {} }),
}));

import { TokenAnalyticsPanel } from "../components/maestro/panels/TokenAnalyticsPanel";

function makeSnapshot(total = 1500) {
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

beforeEach(() => {
    tokenStoreState.globalSummary = null;
    tokenStoreState.loadingGlobal = false;
    tokenStoreState.globalError = null;
    tokenStoreState.fetchGlobalSummary.mockClear();
});

describe("TokenAnalyticsPanel", () => {
    it("shows the disclaimer when summary is present", () => {
        tokenStoreState.globalSummary = {
            totals: makeSnapshot(5000),
            byProvider: { claude: makeSnapshot(3000), openai: makeSnapshot(2000) },
            byModel: { "claude-opus-4-8": makeSnapshot(3000) },
            sessionCount: 4,
            windowMs: 86400000,
        };

        render(<TokenAnalyticsPanel />);

        expect(screen.getByText(/completed sessions only/i)).toBeTruthy();
        expect(screen.getByText(/4 sessions/i)).toBeTruthy();
    });

    it("shows by-provider and by-model headings", () => {
        tokenStoreState.globalSummary = {
            totals: makeSnapshot(5000),
            byProvider: { claude: makeSnapshot(5000) },
            byModel: { "claude-opus-4-8": makeSnapshot(5000) },
            sessionCount: 2,
            windowMs: 86400000,
        };

        render(<TokenAnalyticsPanel />);

        expect(screen.getByText("By provider")).toBeTruthy();
        expect(screen.getByText("By model")).toBeTruthy();
        expect(screen.getByText("claude")).toBeTruthy();
        expect(screen.getByText("claude-opus-4-8")).toBeTruthy();
    });

    it("shows error when globalError is set", () => {
        tokenStoreState.globalError = "Server unavailable";

        render(<TokenAnalyticsPanel />);

        expect(screen.getByText("Server unavailable")).toBeTruthy();
    });

    it("shows loading indicator while fetching", () => {
        tokenStoreState.loadingGlobal = true;

        render(<TokenAnalyticsPanel />);

        expect(screen.getByText(/loading/i)).toBeTruthy();
    });

    it("shows empty state when no sessions in window", () => {
        tokenStoreState.globalSummary = {
            totals: makeSnapshot(0),
            byProvider: {},
            byModel: {},
            sessionCount: 0,
            windowMs: 86400000,
        };

        render(<TokenAnalyticsPanel />);

        expect(screen.getByText(/No completed sessions/i)).toBeTruthy();
    });

    it("calls fetchGlobalSummary on mount", async () => {
        await act(async () => {
            render(<TokenAnalyticsPanel />);
        });

        expect(tokenStoreState.fetchGlobalSummary).toHaveBeenCalledTimes(1);
    });
});
