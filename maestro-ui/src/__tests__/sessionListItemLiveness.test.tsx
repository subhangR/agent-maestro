import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

/* ---------------------------------------------------------------------------
   SessionListItem — the whole row must agree with itself.

   The row shows liveness in four places: the pulse dot, the status glyph, the
   pn-st--needsInput highlight and two hover tooltips. Every one of them has to
   come off useSessionLiveness, because the raw session fields can legitimately
   describe two different things at once:

   Server-side, isTurnEndSignal excludes tool_failure from turn-end, so a
   PostToolUseFailure leaves `status` at "working" — but both write paths set
   needsInput.active unconditionally regardless of source (asserted as correct
   in session-turn-end-status.test.ts). So while an agent auto-recovers from a
   failed tool call with its PTY still streaming, the raw state really is
   { status: "working", needsInput: { active: true, source: "tool_failure" } }.

   Reading that raw flag put "waiting on you" on a row whose dot was pulsing
   live. These cases pin the fix, and pin that nothing else moved.
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
vi.mock("../stores/useMaestroStore", () => ({
  useMaestroStore: (selector: (s: any) => unknown) =>
    selector({ updateSessionMode: () => {} }),
}));
vi.mock("../stores/useUIStore", () => ({
  useUIStore: (selector: (s: any) => unknown) =>
    selector({
      setDocOverlay: () => {},
      sessionShowTaskDetails: true,
      sessionShowBadges: false,
      sessionShowElapsed: false,
    }),
}));
vi.mock("../stores/useActiveSpellsStore", () => ({
  useActiveSpellsForSession: () => [],
}));
vi.mock("../stores/useEnsembleStore", () => ({
  useEnsembleStore: (selector: (s: any) => unknown) => selector({ ensembles: {} }),
}));
vi.mock("../stores/useSpellbookStore", () => ({
  useSpellbookStore: { getState: () => ({ openSpellbook: () => {} }) },
}));
vi.mock("../utils/useSpellCastPulse", () => ({ useSpellCastPulse: () => false }));
vi.mock("../hooks/useSessionDocs", () => ({ useSessionDocs: () => [] }));

const { SessionListItem } = await import("../components/maestro/SessionListItem");

const SESSION_ID = "sess_1";
const TERMINAL_ID = "term_1";
const TASK_ID = "task_1";

const TASKS = {
  [TASK_ID]: { id: TASK_ID, title: "Ship the thing", status: "in_progress" },
} as any;

function renderRow(sessionOverrides: Record<string, unknown>) {
  const session = {
    id: SESSION_ID,
    name: "Worker",
    status: "idle",
    taskIds: [TASK_ID],
    docs: [],
    startedAt: 1_000,
    lastActivity: 1_000,
    ...sessionOverrides,
  } as any;

  const { container } = render(
    <SessionListItem
      session={session}
      depth={0}
      teamColor={null}
      childCount={0}
      isCollapsed={false}
      onToggleCollapse={() => {}}
      link={{ localSessionId: TERMINAL_ID, exited: false }}
      isSelected={false}
      maestroTasks={TASKS}
      tab="active"
      onOpenDetail={() => {}}
      onSelect={() => {}}
      onJumpToTerminal={() => {}}
      onStop={() => {}}
      onResume={() => {}}
      onRestore={() => {}}
      onToggleHumanComplete={() => {}}
      onOpenTeamView={() => {}}
      isResuming={false}
    />,
  );

  const root = container.querySelector(".pn-st") as HTMLElement;
  const glyphAnchor = container.querySelector(".pn-st__statusglyph") as HTMLElement;
  return {
    /** The needs-input highlight on the tile root. */
    highlighted: root.classList.contains("pn-st--needsInput"),
    /** "working" | "needsInput" | … — whatever kind the Glyph rendered. */
    glyphKind: (glyphAnchor.querySelector(".pn-stat") as HTMLElement).className
      .split(/\s+/)
      .find((c) => c.startsWith("pn-stat--"))
      ?.replace("pn-stat--", ""),
    glyphTooltip: glyphAnchor.getAttribute("title"),
    /** The pulse ring only rides on live PTY bytes. */
    dotPulsing: Boolean(container.querySelector(".pn-dot--live")),
    taskLineTooltip: container
      .querySelector(".pn-st__taskline")
      ?.getAttribute("title"),
  };
}

beforeEach(() => {
  terminals = [];
});

describe("SessionListItem liveness", () => {
  // The exact scenario the review flagged: PostToolUseFailure fired mid-turn,
  // the agent is auto-recovering, the PTY is still streaming. Tier 2 of the
  // ladder says WORKING, so the entire row must say working — not just the dot.
  it("stays working when needsInput came from tool_failure and the PTY is streaming", () => {
    terminals = [{ id: TERMINAL_ID, agentWorking: true }];

    const row = renderRow({
      status: "working",
      needsInput: { active: true, since: 1, source: "tool_failure" },
    });

    expect(row.glyphKind).toBe("working");
    expect(row.glyphTooltip).toBe("Working");
    expect(row.highlighted).toBe(false);
    expect(row.taskLineTooltip).toContain("Status: Working");
    expect(row.taskLineTooltip).not.toContain("needs input");
    // …and the dot the rest of the row now agrees with.
    expect(row.dotPulsing).toBe(true);
  });

  // Same raw session, PTY gone quiet: the flag is no longer overridden, so the
  // row is allowed to say needs-input — and every part of it must.
  it("shows needs-input once the same session stops streaming", () => {
    terminals = [{ id: TERMINAL_ID, agentWorking: false }];

    const row = renderRow({
      status: "working",
      needsInput: { active: true, since: 1, source: "tool_failure" },
    });

    expect(row.glyphKind).toBe("needsInput");
    expect(row.glyphTooltip).toBe("Needs input");
    expect(row.highlighted).toBe(true);
    expect(row.taskLineTooltip).toContain("(needs input)");
    expect(row.dotPulsing).toBe(false);
  });

  // A genuine turn-end (Stop hook) is unchanged by the migration.
  it("shows needs-input for an ordinary turn-end with no terminal attached", () => {
    const row = renderRow({
      status: "idle",
      needsInput: { active: true, since: 1, source: "stop" },
    });

    expect(row.glyphKind).toBe("needsInput");
    expect(row.highlighted).toBe(true);
  });

  // Non-needsInput statuses keep mapping 1:1 onto their Glyph kind — the
  // migration must not restyle rows that were already correct.
  it.each(["idle", "spawning", "working", "completed", "failed", "stopped"] as const)(
    "renders the %s status glyph unchanged when needsInput is not set",
    (status) => {
      terminals = [{ id: TERMINAL_ID, agentWorking: false }];

      expect(renderRow({ status }).glyphKind).toBe(status);
    },
  );
});
