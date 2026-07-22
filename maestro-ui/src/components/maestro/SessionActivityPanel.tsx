import React from "react";
import { AgentTile, type AgentKind } from "./redesign/kit";

/* ---------------------------------------------------------------------------
   SessionActivityPanel — a calm, conversational "what the agent is doing" view
   (redesign Phase 4). Renders a maestro session's structured timeline as
   plain-language steps instead of raw terminal output. Additive: shown as an
   overlay over the terminal, which stays mounted underneath.
--------------------------------------------------------------------------- */

interface TimelineEvent {
  id?: string;
  type: string;
  message?: string;
  timestamp: number;
}

const STEP_META: Record<string, { label: string; done?: boolean; tone?: "ok" | "warn" | "err" }> = {
  session_started: { label: "Session started", done: true },
  session_stopped: { label: "Session stopped", done: true },
  task_started: { label: "Started the task" },
  task_completed: { label: "Completed the task", done: true, tone: "ok" },
  task_failed: { label: "Task failed", tone: "err" },
  task_skipped: { label: "Skipped the task", done: true },
  task_blocked: { label: "Blocked — needs a hand", tone: "warn" },
  needs_input: { label: "Waiting for your input", tone: "warn" },
  progress: { label: "Working" },
  error: { label: "Hit an error", tone: "err" },
  milestone: { label: "Reached a milestone", done: true, tone: "ok" },
  doc_added: { label: "Attached a document", done: true },
};

function kindFor(agentTool?: string): AgentKind {
  if (!agentTool || agentTool === "claude-code") return "claude";
  return agentTool as AgentKind;
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function SessionActivityPanel({ session }: { session: any }) {
  const events: TimelineEvent[] = Array.isArray(session?.timeline) ? session.timeline : [];
  const kind = kindFor(session?.metadata?.agentTool);
  const model: string = session?.metadata?.model || session?.model || "";
  const mode: string = session?.mode || session?.metadata?.mode || "worker";
  const status: string = session?.status || "idle";
  const working = status === "working";

  const sorted = React.useMemo(
    () => [...events].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    [events],
  );

  return (
    <div className="pn-activity">
      <div className="pn-activity__head">
        <AgentTile kind={kind} />
        <div className="pn-activity__meta">
          <b className="pn-activity__name">{session?.name || "Session"}</b>
          <span className="pn-activity__sub">
            {kind}
            {model ? ` · ${model}` : ""} · {mode}
          </span>
        </div>
        <span className={"pn-activity__status pn-activity__status--" + status}>
          {working && <span className="pn-activity__livedot" />}
          {status}
        </span>
      </div>

      <div className="pn-activity__feed">
        {sorted.length === 0 ? (
          <div className="pn-activity__empty">
            <div className="pn-activity__empty-mk">
              <span /><span /><span /><span />
            </div>
            <b>No activity yet</b>
            <p>The agent will report its steps here in plain language as it works.</p>
          </div>
        ) : (
          <div className="pn-activity__steps">
            {sorted.map((ev, i) => {
              const meta = STEP_META[ev.type] || { label: ev.type.replace(/_/g, " ") };
              const isLast = i === sorted.length - 1;
              const active = working && isLast && !meta.done;
              return (
                <div className="pn-activity__step" key={ev.id || i}>
                  <span
                    className={
                      "pn-activity__dot" +
                      (meta.done ? " pn-activity__dot--done" : "") +
                      (meta.tone ? ` pn-activity__dot--${meta.tone}` : "") +
                      (active ? " pn-activity__dot--active" : "")
                    }
                  />
                  <div className="pn-activity__body">
                    <div className="pn-activity__title">
                      {meta.label}
                      <span className="pn-activity__time">{fmtTime(ev.timestamp)}</span>
                    </div>
                    {ev.message && ev.message !== meta.label && (
                      <div className="pn-activity__detail">{ev.message}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {working && (
              <div className="pn-activity__thinking">
                <span className="pn-activity__dots"><span /><span /><span /></span>
                working…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionActivityPanel;
