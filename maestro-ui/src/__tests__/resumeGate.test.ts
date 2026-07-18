import { describe, it, expect } from "vitest";
import { isAgentToolResumable, RESUMABLE_AGENT_TOOLS } from "../app/constants/agentTools";

// Single source of truth for the "Resume" affordance shared by every resume
// button in the UI (SessionsSection history dropdown + bottom button,
// SessionStatsView, SessionListItem, TeamView.isResumable). The UI does NOT
// assemble the provider command — it runs the server-emitted command verbatim —
// so this predicate only decides whether the resume action is *offered*.
//
// Contract (confirmed with CLI/server owners):
//   - Claude Code  → `claude --resume <MAESTRO_CLAUDE_SESSION_ID>`
//   - Codex        → `codex resume <native-id>` (fail closed without exact id)
//   - Gemini/Hermes→ no proven native-id resume path yet → not resumable
describe("isAgentToolResumable — shared resume gate", () => {
  it("offers resume for Claude Code sessions", () => {
    expect(isAgentToolResumable("claude-code")).toBe(true);
  });

  it("offers resume for Codex sessions", () => {
    expect(isAgentToolResumable("codex")).toBe(true);
  });

  it("defaults a missing/legacy agentTool to claude-code (resumable)", () => {
    expect(isAgentToolResumable(undefined)).toBe(true);
    expect(isAgentToolResumable(null)).toBe(true);
    expect(isAgentToolResumable("")).toBe(true);
  });

  it("does not offer resume for tools without a native-id resume path", () => {
    expect(isAgentToolResumable("gemini")).toBe(false);
    expect(isAgentToolResumable("hermes")).toBe(false);
  });

  it("does not offer resume for unknown/future agent tools", () => {
    expect(isAgentToolResumable("some-future-tool")).toBe(false);
  });

  it("exposes the resumable set as a single source of truth", () => {
    expect([...RESUMABLE_AGENT_TOOLS].sort()).toEqual(["claude-code", "codex"]);
  });
});
