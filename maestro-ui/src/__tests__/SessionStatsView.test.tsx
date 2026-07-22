import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  MaestroSession,
  MaestroTask,
  SessionTimelineEvent,
} from "../app/types/maestro";

// Mock the maestro store so we don't pull in tauri / websocket / fetch deps.
const storeState: {
  tasks: Record<string, MaestroTask>;
  sessions: Record<string, MaestroSession>;
  resumingSessionId: string | null;
  resumeSessionFlow: (id: string) => Promise<void>;
  setSessionArchived: (id: string, archived: boolean) => Promise<void>;
} = {
  tasks: {},
  sessions: {},
  resumingSessionId: null,
  resumeSessionFlow: vi.fn().mockResolvedValue(undefined),
  setSessionArchived: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../stores/useMaestroStore", () => ({
  useMaestroStore: <T,>(selector: (s: typeof storeState) => T): T => selector(storeState),
}));

vi.mock("../stores/useProjectStore", () => ({
  useProjectStore: <T,>(selector: (s: { projects: never[] }) => T): T => selector({ projects: [] }),
}));

// DocViewer pulls in heavy markdown/monaco deps; stub it to keep the test fast.
vi.mock("../components/maestro/DocViewer", () => ({
  DocViewer: () => null,
}));

// Stub the timeline so we don't depend on @tanstack/react-virtual measuring sizes
// in jsdom. We still assert the wrapper around it.
vi.mock("../components/maestro/SessionTimeline", () => ({
  SessionTimeline: ({ events }: { events: SessionTimelineEvent[] }) => (
    <div data-testid="session-timeline-stub">{events.length} events</div>
  ),
}));

// Stub Tauri invoke — SessionStatsView calls list_/read_ commands to read the
// local JSONL transcript. Default to "no files found" so the transcript section
// stays out of the basic render tests.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

import {
  SessionStatsView,
  formatStatsDuration,
  getSessionOutcome,
} from "../components/maestro/SessionStatsView";

function makeSession(overrides: Partial<MaestroSession> = {}): MaestroSession {
  return {
    id: "sess_test_1",
    projectId: "proj_1",
    taskIds: [],
    name: "Test Session",
    env: {},
    status: "completed",
    startedAt: 1_000_000_000_000,
    lastActivity: 1_000_000_005_000,
    completedAt: 1_000_000_065_000,
    hostname: "localhost",
    platform: "darwin",
    events: [],
    timeline: [],
    docs: [],
    ...overrides,
  };
}

describe("formatStatsDuration", () => {
  it("formats seconds under a minute", () => {
    expect(formatStatsDuration(0, 45_000)).toBe("45s");
  });

  it("formats minutes + seconds", () => {
    expect(formatStatsDuration(0, 65_000)).toBe("1m 5s");
  });

  it("formats hours + minutes", () => {
    expect(formatStatsDuration(0, 3_900_000)).toBe("1h 5m");
  });

  it("falls back to now when end is null", () => {
    expect(formatStatsDuration(Date.now() - 5_000, null)).toMatch(/\ds$/);
  });
});

describe("getSessionOutcome", () => {
  it("returns archived label when archivedAt is set, regardless of status", () => {
    const s = makeSession({ status: "completed", archivedAt: 12345 });
    expect(getSessionOutcome(s).variant).toBe("archived");
  });

  it("returns human-done when humanCompletedAt is set", () => {
    const s = makeSession({ status: "stopped", humanCompletedAt: 12345 });
    expect(getSessionOutcome(s).variant).toBe("human-done");
  });

  it("returns success for completed", () => {
    const s = makeSession({ status: "completed" });
    expect(getSessionOutcome(s).variant).toBe("success");
  });

  it("returns failure for failed", () => {
    const s = makeSession({ status: "failed" });
    expect(getSessionOutcome(s).variant).toBe("failure");
  });
});

describe("<SessionStatsView />", () => {
  beforeEach(() => {
    storeState.tasks = {};
    storeState.sessions = {};
  });

  it("renders identity, outcome, and duration", () => {
    const session = makeSession({
      teamMemberSnapshot: {
        name: "UI Architect",
        avatar: "🎨",
        role: "Frontend Engineer",
      },
    });
    render(<SessionStatsView session={session} />);
    expect(screen.getByText("UI Architect")).toBeTruthy();
    expect(screen.getByText("Frontend Engineer")).toBeTruthy();
    // "Completed" shows as the outcome label (and as a stat-grid key).
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    // 65s duration → 1m 5s (appears in the outcome badge + duration stat row).
    expect(screen.getAllByText(/1m 5s/).length).toBeGreaterThan(0);
  });

  it("shows empty-state floor when there's no work to summarize", () => {
    const session = makeSession({
      taskIds: [],
      timeline: [],
      docs: [],
    });
    render(<SessionStatsView session={session} />);
    expect(
      screen.getByText(/did not produce any tasks, docs, or timeline events/i),
    ).toBeTruthy();
  });

  it("renders task outcome row using taskSessionStatuses", () => {
    const taskId = "task_1";
    const sessionId = "sess_test_1";
    storeState.tasks = {
      [taskId]: {
        id: taskId,
        projectId: "proj_1",
        parentId: null,
        title: "Implement stats view",
        description: "",
        initialPrompt: "",
        status: "completed",
        priority: "high",
        createdAt: 0,
        updatedAt: 0,
        startedAt: null,
        completedAt: null,
        sessionIds: [sessionId],
        skillIds: [],
        agentIds: [],
        dependencies: [],
        taskSessionStatuses: { [sessionId]: "completed" },
      } as MaestroTask,
    };
    const session = makeSession({ id: sessionId, taskIds: [taskId] });
    render(<SessionStatsView session={session} />);
    expect(screen.getByText("Implement stats view")).toBeTruthy();
    // Per-session status chip renders the lowercase "completed" label.
    expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
  });

  it("renders coordinator sub-session rollup when children exist", () => {
    const coord = makeSession({
      id: "coord_1",
      mode: "coordinator",
    });
    storeState.sessions = {
      coord_1: coord,
      worker_1: makeSession({
        id: "worker_1",
        parentSessionId: "coord_1",
        status: "completed",
      }),
      worker_2: makeSession({
        id: "worker_2",
        parentSessionId: "coord_1",
        status: "failed",
      }),
    };
    render(<SessionStatsView session={coord} />);
    expect(screen.getByText(/Sub-sessions/i)).toBeTruthy();
    expect(screen.getByText("2 in subtree")).toBeTruthy();
  });

  it("does not render sub-session rollup for non-coordinators", () => {
    const worker = makeSession({ id: "worker_solo", mode: "worker" });
    render(<SessionStatsView session={worker} />);
    expect(screen.queryByText(/Sub-sessions/i)).toBeNull();
  });

  it("renders a Resume action button in the hero", () => {
    const session = makeSession({ status: "completed" });
    const { container } = render(<SessionStatsView session={session} />);
    const btn = container.querySelector(".ssv-btn-primary") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toMatch(/resume/i);
    expect(btn!.disabled).toBe(false);
  });

  it("enables Resume for Codex sessions (native-id resume supported)", () => {
    const session = makeSession({
      status: "completed",
      metadata: { agentTool: "codex" },
    });
    const { container } = render(<SessionStatsView session={session} />);
    const btn = container.querySelector(".ssv-btn-primary") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
  });

  it("disables Resume for tools without a native-id resume path", () => {
    const session = makeSession({
      status: "completed",
      metadata: { agentTool: "gemini" },
    });
    const { container } = render(<SessionStatsView session={session} />);
    const btn = container.querySelector(".ssv-btn-primary") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
  });

  it("renders Restore alongside Resume for archived sessions", () => {
    const session = makeSession({ status: "stopped", archivedAt: 12345 });
    const { container } = render(<SessionStatsView session={session} />);
    expect(container.querySelector(".ssv-btn-primary")?.textContent).toMatch(/resume/i);
    expect(screen.getByRole("button", { name: /restore/i })).toBeTruthy();
  });

  it("omits Restore for non-archived sessions", () => {
    const session = makeSession({ status: "completed" });
    render(<SessionStatsView session={session} />);
    expect(screen.queryByRole("button", { name: /restore/i })).toBeNull();
  });

  it("surfaces error count from timeline", () => {
    const timeline: SessionTimelineEvent[] = [
      { id: "e1", type: "error", timestamp: 1 },
      { id: "e2", type: "error", timestamp: 2 },
      { id: "e3", type: "progress", timestamp: 3 },
    ];
    const session = makeSession({ timeline });
    const { container } = render(<SessionStatsView session={session} />);
    // The timeline breakdown renders one chip per event type; the "error"
    // chip's count should read 2.
    const chips = Array.from(container.querySelectorAll(".ssv-tl-bchip"));
    const errorChip = chips.find(
      (c) => c.querySelector(".ssv-tl-bty")?.textContent === "error",
    );
    expect(errorChip).toBeTruthy();
    expect(errorChip!.querySelector(".ssv-tl-bct")!.textContent).toBe("2");
  });
});
