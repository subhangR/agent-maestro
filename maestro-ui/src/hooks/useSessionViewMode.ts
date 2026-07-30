import { useCallback, useState } from "react";

export type SessionViewMode = "chat" | "split" | "terminal";

export const SESSION_VIEW_MODE_KEY = "maestro.sessionViewMode";

export function getInitialSessionViewMode(
  storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage,
  _isNarrow = typeof window === "undefined" ? true : window.matchMedia("(max-width: 900px)").matches,
): SessionViewMode {
  // Default to "split" (Together): the terminal is ALWAYS mounted, so the user
  // can never land on a blank pane if the agent's chat log hasn't been found
  // yet. (We used to auto-pick "chat" on narrow screens, which showed a blank
  // pane whenever the log wasn't resolved — the raw terminal was display:none'd
  // and TerminalStrip renders null until it finds the log.) Users can still
  // explicitly switch to Chat or Terminal; the choice persists.
  const saved = storage?.getItem(SESSION_VIEW_MODE_KEY);
  return saved === "chat" || saved === "split" || saved === "terminal" ? saved : "split";
}

export function useSessionViewMode() {
  const [mode, setMode] = useState<SessionViewMode>(getInitialSessionViewMode);
  const selectMode = useCallback((nextMode: SessionViewMode) => {
    setMode(nextMode);
    window.localStorage.setItem(SESSION_VIEW_MODE_KEY, nextMode);
  }, []);

  return {
    mode,
    selectMode,
    showActivity: mode !== "terminal",
    showTerminal: mode !== "chat",
  };
}
