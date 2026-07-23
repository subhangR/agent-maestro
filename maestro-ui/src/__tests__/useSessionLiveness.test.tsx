import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

/* ---------------------------------------------------------------------------
   useSessionLiveness — the single source of truth for "is this agent still
   working?". These cases pin the precedence ladder documented in the hook:

     1 · terminal exited / closing   → not working (definitive)
     2 · terminal streaming bytes    → WORKING, even if needsInput is set
     3 · needsInput.active           → not working, state "needsInput"
     4 · no terminal attached        → fall back to the server status
--------------------------------------------------------------------------- */

type FakeTerminal = {
  id: string;
  maestroSessionId?: string | null;
  agentWorking?: boolean;
  exited?: boolean;
  closing?: boolean;
};

let terminals: FakeTerminal[] = [];

vi.mock("../stores/useSessionStore", () => ({
  useSessionStore: (selector: (s: { sessions: FakeTerminal[] }) => unknown) =>
    selector({ sessions: terminals }),
}));

const { useSessionLiveness, deriveSessionLiveness } = await import(
  "../hooks/useSessionLiveness"
);

const SESSION_ID = "sess_1";

function session(overrides: Record<string, unknown> = {}) {
  return { id: SESSION_ID, status: "idle", ...overrides } as any;
}

function live(sess: unknown, options?: { localSessionId?: string | null }) {
  return renderHook(() => useSessionLiveness(sess as any, options)).result.current;
}

beforeEach(() => {
  terminals = [];
});

describe("useSessionLiveness", () => {
  it("reports working + streaming while the terminal is pushing bytes", () => {
    terminals = [{ id: "t1", maestroSessionId: SESSION_ID, agentWorking: true }];

    const r = live(session({ status: "working" }));

    expect(r.isStreaming).toBe(true);
    expect(r.isWorking).toBe(true);
    expect(r.hasTerminal).toBe(true);
    expect(r.state).toBe("working");
  });

  it("reports not working once an attached terminal has exited", () => {
    terminals = [
      { id: "t1", maestroSessionId: SESSION_ID, agentWorking: true, exited: true },
    ];

    const r = live(session({ status: "working" }));

    expect(r.isStreaming).toBe(false);
    expect(r.isWorking).toBe(false);
    expect(r.state).toBe("idle");
  });

  it("treats a closing terminal the same as an exited one", () => {
    terminals = [
      { id: "t1", maestroSessionId: SESSION_ID, agentWorking: true, closing: true },
    ];

    expect(live(session({ status: "working" })).isWorking).toBe(false);
  });

  // The exact reported bug: the agent finished, the server recorded
  // needsInput, but status was still stuck at "working" and the chat panel
  // spun forever.
  it("reports needsInput when the flag is set and status is still stuck at working", () => {
    terminals = [{ id: "t1", maestroSessionId: SESSION_ID, agentWorking: false }];

    const r = live(
      session({ status: "working", needsInput: { active: true, since: 1 } }),
    );

    expect(r.needsInput).toBe(true);
    expect(r.isWorking).toBe(false);
    expect(r.state).toBe("needsInput");
  });

  // hooks.json fires "session needs-input" on PostToolUseFailure too, and the
  // agent usually recovers and keeps going. Live PTY bytes must win, or the
  // chat would falsely declare the turn finished mid-turn.
  it("keeps reporting working when the terminal streams despite needsInput being set", () => {
    terminals = [{ id: "t1", maestroSessionId: SESSION_ID, agentWorking: true }];

    const r = live(
      session({ status: "working", needsInput: { active: true, since: 1 } }),
    );

    expect(r.isWorking).toBe(true);
    expect(r.needsInput).toBe(true);
    expect(r.state).toBe("working");
  });

  // Regression guard for a dropped session:status_changed event — the
  // WebSocket bridge throttles and can discard the turn-end transition, so the
  // local terminal signal has to stand on its own.
  it("goes quiet from local terminal state alone when no status event ever arrives", () => {
    terminals = [{ id: "t1", maestroSessionId: SESSION_ID, agentWorking: false }];

    // Server still insists the session is working, and needsInput was never
    // delivered either.
    const r = live(session({ status: "working" }));

    expect(r.isWorking).toBe(false);
    expect(r.state).toBe("idle");
  });

  it("falls back to the server status when no terminal is attached", () => {
    terminals = [{ id: "t1", maestroSessionId: "some_other_session" }];

    expect(live(session({ status: "working" })).isWorking).toBe(true);
    expect(live(session({ status: "working" })).hasTerminal).toBe(false);
    expect(live(session({ status: "idle" })).isWorking).toBe(false);
    expect(live(session({ status: "completed" })).state).toBe("idle");
  });

  it("still honours needsInput with no terminal attached", () => {
    const r = live(session({ status: "working", needsInput: { active: true } }));

    expect(r.isWorking).toBe(false);
    expect(r.state).toBe("needsInput");
  });

  it("resolves the terminal by localSessionId when the caller pins the link", () => {
    terminals = [
      { id: "term_local", maestroSessionId: null, agentWorking: true },
      { id: "term_other", maestroSessionId: SESSION_ID, agentWorking: false },
    ];

    const pinned = live(session({ status: "idle" }), { localSessionId: "term_local" });
    expect(pinned.isStreaming).toBe(true);
    expect(pinned.isWorking).toBe(true);
  });

  it("treats an explicit null localSessionId as 'no terminal', not 'search by id'", () => {
    terminals = [{ id: "t1", maestroSessionId: SESSION_ID, agentWorking: true }];

    const r = live(session({ status: "idle" }), { localSessionId: null });

    expect(r.isStreaming).toBe(false);
    expect(r.hasTerminal).toBe(false);
    expect(r.isWorking).toBe(false); // fell back to status "idle"
  });

  it("is inert for a null session", () => {
    const r = live(null);

    expect(r).toEqual({
      isStreaming: false,
      isWorking: false,
      needsInput: false,
      hasTerminal: false,
      state: "idle",
    });
  });
});

describe("deriveSessionLiveness", () => {
  it.each([
    // terminalLive, statusWorking, needsInput → isWorking, state
    [true, false, false, true, "working"],
    [true, false, true, true, "working"],
    [false, true, false, false, "idle"],
    [false, true, true, false, "needsInput"],
    [null, true, false, true, "working"],
    [null, true, true, false, "needsInput"],
    [null, false, false, false, "idle"],
  ] as const)(
    "terminalLive=%s statusWorking=%s needsInput=%s → isWorking=%s state=%s",
    (terminalLive, statusWorking, needsInput, isWorking, state) => {
      const r = deriveSessionLiveness(terminalLive, statusWorking, needsInput);
      expect(r.isWorking).toBe(isWorking);
      expect(r.state).toBe(state);
    },
  );
});
