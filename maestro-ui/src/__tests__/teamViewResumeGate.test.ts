import { describe, it, expect } from "vitest";
import { isResumable } from "../components/maestro/TeamView";
import type { MaestroSession } from "../app/types/maestro";

// TeamView.isResumable is a *consumer* of the shared resume gate: it composes the
// per-tool predicate (isAgentToolResumable) with a terminal-status check so the
// child "Resume" affordance only appears for finished sessions of a resumable
// tool. These tests pin the composition — tool eligibility AND terminal status —
// so the two concerns can't silently drift apart.
//
// Only status + metadata.agentTool are read, so a partial cast is sufficient.
function sessionWith(agentTool: string | undefined, status: string): MaestroSession {
  return {
    status,
    metadata: agentTool === undefined ? {} : { agentTool },
  } as unknown as MaestroSession;
}

const TERMINAL = ["completed", "failed", "stopped"];
const NON_TERMINAL = ["running", "starting", "waiting"];

describe("TeamView.isResumable — resume gate consumer", () => {
  it("offers resume for a finished Claude Code session", () => {
    for (const status of TERMINAL) {
      expect(isResumable(sessionWith("claude-code", status))).toBe(true);
    }
  });

  it("offers resume for a finished Codex session", () => {
    for (const status of TERMINAL) {
      expect(isResumable(sessionWith("codex", status))).toBe(true);
    }
  });

  it("defaults a missing agentTool to Claude Code (resumable when finished)", () => {
    expect(isResumable(sessionWith(undefined, "completed"))).toBe(true);
  });

  it("never offers resume for a running session, even for a resumable tool", () => {
    for (const status of NON_TERMINAL) {
      expect(isResumable(sessionWith("claude-code", status))).toBe(false);
      expect(isResumable(sessionWith("codex", status))).toBe(false);
    }
  });

  it("does not offer resume for tools without a native-id resume path", () => {
    expect(isResumable(sessionWith("gemini", "completed"))).toBe(false);
    expect(isResumable(sessionWith("hermes", "completed"))).toBe(false);
  });
});
