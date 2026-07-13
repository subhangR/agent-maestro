import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Hide/show interaction contract for the session-log terminal strip.
 *
 * - Visible: the strip renders its controls (Session Log toggle + actions) and
 *   a "Hide session log" control.
 * - Hidden: the strip renders NO content (no toggle, no actions) and leaves no
 *   layout footprint; only a compact, labelled, keyboard-reachable
 *   "Show session log" control remains.
 * - Restore: activating that control brings the full strip back without reload.
 */

// Resolve log discovery immediately to a file that matches the session id, so
// the strip reaches its `ready` state in the test without any real IO.
vi.mock("../platform", () => ({
  platform: {
    logs: {
      list: vi.fn(async () => [
        { filename: "log.jsonl", relativePath: "log.jsonl", maestroSessionId: "sess-1" },
      ]),
      read: vi.fn(async () => ""),
      tail: vi.fn(async () => ({ content: "", newOffset: 0 })),
    },
  },
}));

// Keep the render light + deterministic: the strip's heavy children are not
// under test here.
vi.mock("../components/Icon", () => ({ Icon: () => null }));
vi.mock("../components/maestro/SessionDocsMenu", () => ({ SessionDocsMenu: () => null }));
vi.mock("../components/session-log/LogMessageGroup", () => ({ LogMessageGroup: () => null }));

import { TerminalStrip } from "../components/session-log/TerminalStrip";

function renderStrip() {
  return render(
    <TerminalStrip
      cwd="/tmp/project"
      maestroSessionId="sess-1"
      agentTool="claude"
      onAttach={() => {}}
      onDraw={() => {}}
    />
  );
}

describe("TerminalStrip hide/show", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the strip with its actions and a hide control once the log is found", async () => {
    renderStrip();
    expect(await screen.findByRole("button", { name: /hide session log/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeTruthy();
    // No restore control while the strip is visible.
    expect(screen.queryByRole("button", { name: /show session log/i })).toBeNull();
  });

  it("hiding removes all strip content and leaves only a restore control", async () => {
    renderStrip();
    const hide = await screen.findByRole("button", { name: /hide session log/i });
    fireEvent.click(hide);

    // Strip content is gone (no footprint): toggle, actions and hide control.
    expect(screen.queryByRole("button", { name: /hide session log/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /attach files/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /expand session log|collapse session log/i })).toBeNull();

    // A compact, labelled, keyboard-reachable restore control remains.
    const restore = screen.getByRole("button", { name: /show session log/i });
    expect(restore).toBeTruthy();
    expect(restore.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("restores the full strip when the restore control is activated", async () => {
    renderStrip();
    fireEvent.click(await screen.findByRole("button", { name: /hide session log/i }));
    fireEvent.click(screen.getByRole("button", { name: /show session log/i }));

    expect(await screen.findByRole("button", { name: /hide session log/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /attach files/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show session log/i })).toBeNull();
  });
});
