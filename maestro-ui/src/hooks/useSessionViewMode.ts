import { useCallback, useState } from "react";

export type SessionViewMode = "chat" | "split" | "terminal";

export const SESSION_VIEW_MODE_KEY = "maestro.sessionViewMode";

export function getInitialSessionViewMode(
  storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage,
  isNarrow = typeof window === "undefined" ? true : window.matchMedia("(max-width: 900px)").matches,
): SessionViewMode {
  if (isNarrow) return "chat";
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
