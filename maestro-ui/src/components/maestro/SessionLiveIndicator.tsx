import React from "react";
import { useSessionLiveness } from "../../hooks/useSessionLiveness";
import type { MaestroSessionStatus } from "../../app/types/maestro";

interface SessionLiveIndicatorProps {
  maestroSessionId: string;
  status: MaestroSessionStatus;
  needsInput?: boolean;
  showLabel?: boolean;
}

// Surfaces real-time PTY activity for a maestro session. All four liveness
// call sites share one derivation — see hooks/useSessionLiveness.ts for the
// precedence ladder (terminal exit > streaming bytes > needsInput > status).
export function SessionLiveIndicator({
  maestroSessionId,
  status,
  needsInput = false,
  showLabel = true,
}: SessionLiveIndicatorProps) {
  const { isStreaming: streaming, isWorking, state } = useSessionLiveness({
    id: maestroSessionId,
    status,
    needsInput: { active: needsInput },
  });

  // Only a terminal actively streaming bytes pulses. A session that is "working"
  // by server status but has no bytes flowing right now is a still dot.
  const label =
    state === "needsInput" ? "Needs input" : streaming ? "Live" : isWorking ? "Working" : "Idle";

  return (
    <span className="sessionLiveIndicator" title={`Terminal ${label.toLowerCase()}`}>
      <span
        className={`sessionLiveIndicator__dot sessionLiveIndicator__dot--${state}${streaming ? " sessionLiveIndicator__dot--streaming" : ""}`}
      />
      {showLabel && <span className="sessionLiveIndicator__label">{label}</span>}
    </span>
  );
}
