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
     4 · status === "working" — the fallback, and only for sessions with no
         local terminal (remote / coordinator sessions).

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
 * @param terminalLive `null` when no local terminal is attached, `false` when
 *   one is attached but exited/closing/idle, `true` when it is streaming.
 */
export function deriveSessionLiveness(
  terminalLive: boolean | null,
  statusWorking: boolean,
  needsInput: boolean,
): SessionLiveness {
  const hasTerminal = terminalLive !== null;
  const isStreaming = terminalLive === true;

  // The ladder is the contract — tier 2 deliberately outranks needsInput.
  const isWorking = isStreaming
    ? true // 2 · live PTY evidence beats a possibly-stale needsInput flag
    : needsInput
      ? false // 3 · flagged as waiting on the human
      : hasTerminal
        ? false // 1 · attached but silent, exited or closing
        : statusWorking; // 4 · no terminal — the server status is all we have

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

  const terminalLive = useSessionStore((s) => {
    const terminal = useExplicitLink
      ? explicitTerminalId
        ? s.sessions.find((t) => t.id === explicitTerminalId)
        : undefined
      : maestroSessionId
        ? s.sessions.find((t) => t.maestroSessionId === maestroSessionId)
        : undefined;
    if (!terminal) return null;
    if (terminal.exited || terminal.closing) return false;
    return Boolean(terminal.agentWorking);
  });

  const statusWorking = session?.status === "working";
  const needsInput = session?.needsInput?.active === true;

  return useMemo(
    () => deriveSessionLiveness(terminalLive, statusWorking, needsInput),
    [terminalLive, statusWorking, needsInput],
  );
}
