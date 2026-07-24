import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { getSessionLogDigest, getSessionStats } = vi.hoisted(() => ({
  getSessionLogDigest: vi.fn(),
  getSessionStats: vi.fn(),
}));

vi.mock("../utils/MaestroClient", () => ({
  maestroClient: { getSessionLogDigest, getSessionStats },
}));

vi.mock("../components/maestro/redesign/kit", () => ({
  AgentTile: () => <span data-testid="agent-tile" />,
}));

vi.mock("../stores/useProjectStore", () => ({
  useProjectStore: <T,>(selector: (state: any) => T): T =>
    selector({ projects: [], activeProjectId: null }),
}));

vi.mock("../stores/useMaestroStore", () => ({
  useMaestroStore: <T,>(selector: (state: any) => T): T =>
    selector({
      createTask: vi.fn(),
      teamMembers: {},
    }),
}));

vi.mock("../stores/useSessionStore", () => ({
  useSessionStore: <T,>(selector: (state: any) => T): T =>
    selector({ sendPromptToActive: vi.fn() }),
}));

vi.mock("../services/maestroService", () => ({
  createMaestroSession: vi.fn(),
}));

import {
  SessionActivityPanel,
  normalizeTranscriptMessage,
} from "../components/maestro/SessionActivityPanel";

const session = {
  id: "sess_chat_1",
  name: "Chat performance",
  status: "working",
  mode: "worker",
  timeline: [],
  metadata: { agentTool: "codex" },
};

function digest() {
  return {
    sessionId: session.id,
    workerName: "Codex",
    taskIds: [],
    state: "active" as const,
    entries: [
      {
        timestamp: 1,
        source: "user" as const,
        text: "[PROMPT] Please explain this in plain English.",
      },
      {
        timestamp: 2,
        source: "assistant" as const,
        text: "I’m working on the chat view.",
      },
    ],
    stuck: null,
    lastActivityTimestamp: 2,
  };
}

describe("SessionActivityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionLogDigest.mockResolvedValue(digest());
  });

  it("loads the lightweight transcript digest instead of full session stats", async () => {
    render(<SessionActivityPanel session={session} />);

    expect(await screen.findByText("Please explain this in plain English.")).toBeTruthy();
    expect(getSessionLogDigest).toHaveBeenCalledWith(session.id, {
      last: 60,
      maxLength: 220,
    });
    expect(getSessionStats).not.toHaveBeenCalled();
  });

  it("does not poll a previously loaded session while the chat is hidden", async () => {
    const view = render(<SessionActivityPanel session={session} />);
    await waitFor(() => expect(getSessionLogDigest).toHaveBeenCalledTimes(1));

    view.rerender(<SessionActivityPanel session={session} visible={false} />);
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(getSessionLogDigest).toHaveBeenCalledTimes(1);
  });

  it("removes legacy prompt labels only from user transcript entries", () => {
    expect(
      normalizeTranscriptMessage({
        timestamp: 1,
        source: "user",
        text: "[PROMPT] A readable question",
      }).text,
    ).toBe("A readable question");
    expect(
      normalizeTranscriptMessage({
        timestamp: 2,
        source: "assistant",
        text: "[PROMPT] is part of this answer",
      }).text,
    ).toBe("[PROMPT] is part of this answer");
  });

  it("shows plain-language progress instead of the raw working state", async () => {
    render(<SessionActivityPanel session={session} />);

    expect(await screen.findByText("In progress")).toBeTruthy();
    expect(screen.getByLabelText("0 steps completed")).toBeTruthy();
  });

  it("shows a final completion summary when the run is finished", async () => {
    render(<SessionActivityPanel session={{ ...session, status: "completed" }} />);

    expect(await screen.findByRole("region", { name: "Completion summary" })).toBeTruthy();
    expect(screen.getByText("Final summary")).toBeTruthy();
    expect(screen.getAllByText("Completed")).toHaveLength(2);
  });
});
