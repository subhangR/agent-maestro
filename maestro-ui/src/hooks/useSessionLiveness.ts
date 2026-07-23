import { useMemo } from "react";
import { useSessionStore } from "../stores/useSessionStore";

/* ---------------------------------------------------------------------------
   useSessionLiveness — the single derivation of "is this agent still working?"

   `session.status` is a client-driven field that frequently sticks at
   working/spawning (see maestro-server/src/api/sessionRoutes.ts and
   SessionsSection.tsx, which both call it out). Every liveness affordance in
   the UI therefore composes three signals in this precedence, highest first:

     1 · terminal exited / closing — definitive, not working.
     2 · terminal.agentWorking — bytes are flowing right now (toggled from raw
         pty-output with a 2s idle debounce in
         useSessionStore.markAgentWorkingFromOutput). Live PTY evidence means
         WORKING even when needsInput is set: hooks.json wires needsInput to
         PostToolUseFailure as well as Stop, and a failed tool call is usually
         followed by the agent recovering and carrying on. A false "done" is
         worse than a late one.
     3 · needsInput.active — the agent is blocked on the human; not working.
     4 · status === "working" — the fallback for a terminal that is attached
         but *silent* (agentWorking clears after that 2s debounce, yet a live
         agent is routinely quiet while it waits on a command, a network call
         or a model response) AND for sessions with no local terminal at all
         (remote / coordinator). A silent terminal must NOT declare the turn
         over on its own — turn-end idle comes from tier 1 (the terminal exits)
         or tier 3 (needsInput fires), never from local silence, which would
         flash "idle" on every mid-turn pause and stall the activity poll.

   Tiers 1–2 are computed from local PTY state and never traverse the
   WebSocket, so the chat stays correct even when a session:status_changed
   event is throttled away in flight.

   Consumers: SessionActivityPanel, SessionLiveIndicator, SessionListItem,
   SessionDetailModal. Every liveness-dependent affordance in all four — dot,
   pulse, glyph, pill, highlight class, label and tooltip — reads `state` /
   `isWorking` / `isStreaming` from here, so they cannot drift apart again.

   Deliberate exception: `session.status` is still read directly by
   SessionListItem and SessionDetailModal to pick the *non*-liveness status
   variant (idle / spawning / completed / failed / stopped map 1:1 onto kit
   Glyph kinds and status pills, and this hook has no equivalent for them).
   That is the same field tier 4 reads, and it is only ever consulted once
   `state` has already ruled out working and needsInput — so it cannot
   contradict the ladder.
--------------------------------------------------------------------------- */

export type SessionLivenessState = "working" | "needsInput" | "idle";

/**
 * The four states a session's local terminal can be in, most-to-least
 * informative. `exited` is definitive (tier 1); `streaming` is live evidence
 * (tier 2); `silent` and `none` both defer to the server status (tier 4) — a
 * quiet-but-attached terminal is NOT proof the turn ended.
 */
export type TerminalLiveness = "streaming" | "silent" | "exited" | "none";

export interface SessionLiveness {
  /** The PTY is pushing bytes right now. Drives pulses/blinks, not solid dots. */
  isStreaming: boolean;
  /** The agent's turn is still in flight. Always false while needsInput is active. */
  isWorking: boolean;
  /**
   * The raw tier-3 input — the needsInput flag exactly as the server set it,
   * NOT the display signal. It stays true while streaming bytes override it
   * (tier 2), so anything rendering "waiting on you" must branch on
   * `state === "needsInput"` instead. Reading this field directly is what left
   * SessionListItem's glyph disagreeing with its own pulse dot.
   */
  needsInput: boolean;
  /**
   * A local terminal is linked, so tiers 1–2 (not the server status) decided
   * this. No component needs it; kept because it is the only externally
   * observable proof that `localSessionId: null` means "no terminal" rather
   * than "look one up by maestroSessionId" — a contract the tests pin.
   */
  hasTerminal: boolean;
  state: SessionLivenessState;
}

/** The slice of a maestro session this hook actually reads. */
export interface SessionLivenessInput {
  id?: string | null;
  status?: string | null;
  needsInput?: { active?: boolean } | null;
}

export interface SessionLivenessOptions {
  /**
   * Look the terminal up by local terminal id instead of by `maestroSessionId`.
   * Pass this (even as `null`) when the caller already resolved the link — a
   * `null` value means "this session has no terminal", which is different from
   * omitting the option, which means "find one by maestroSessionId".
   */
  localSessionId?: string | null;
}

/**
 * Pure composition of the three signals. Exported for direct unit testing and
 * for non-hook call sites.
 *
 * @param terminal the local terminal's state: `"none"` when no terminal is
 *   attached, `"exited"` when one is attached but exited/closing, `"silent"`
 *   when attached and quiet (agentWorking cleared), `"streaming"` when it is
 *   pushing bytes. `silent` and `none` behave identically — both defer to the
 *   server status — but stay distinct so callers can tell "no terminal" from
 *   "terminal, just quiet".
 */
export function deriveSessionLiveness(
  terminal: TerminalLiveness,
  statusWorking: boolean,
  needsInput: boolean,
): SessionLiveness {
  const hasTerminal = terminal !== "none";
  const isStreaming = terminal === "streaming";

  // The ladder is the contract — tier 2 deliberately outranks needsInput, and
  // a silent terminal defers to the server status instead of forcing idle.
  const isWorking =
    terminal === "exited"
      ? false // 1 · exited/closing — definitive, the turn is over
      : isStreaming
        ? true // 2 · live PTY evidence beats a possibly-stale needsInput flag
        : needsInput
          ? false // 3 · flagged as waiting on the human
          : statusWorking; // 4 · silent or no terminal — defer to server status

  return {
    isStreaming,
    isWorking,
    needsInput,
    hasTerminal,
    state: isWorking ? "working" : needsInput ? "needsInput" : "idle",
  };
}

export function useSessionLiveness(
  session: SessionLivenessInput | null | undefined,
  options: SessionLivenessOptions = {},
): SessionLiveness {
  const maestroSessionId = session?.id ?? null;
  const explicitTerminalId = options.localSessionId;
  const useExplicitLink = explicitTerminalId !== undefined;

  const terminal = useSessionStore((s): TerminalLiveness => {
    const t = useExplicitLink
      ? explicitTerminalId
        ? s.sessions.find((term) => term.id === explicitTerminalId)
        : undefined
      : maestroSessionId
        ? s.sessions.find((term) => term.maestroSessionId === maestroSessionId)
        : undefined;
    if (!t) return "none";
    if (t.exited || t.closing) return "exited";
    return t.agentWorking ? "streaming" : "silent";
  });

  const statusWorking = session?.status === "working";
  const needsInput = session?.needsInput?.active === true;

  return useMemo(
    () => deriveSessionLiveness(terminal, statusWorking, needsInput),
    [terminal, statusWorking, needsInput],
  );
}
