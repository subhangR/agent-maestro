import React from "react";
import { AgentTile, type AgentKind } from "./redesign/kit";
import { maestroClient } from "../../utils/MaestroClient";
import type { SessionStatsResponse, SessionTranscriptMessage } from "../../app/types/maestro";

/* ---------------------------------------------------------------------------
   SessionActivityPanel — the plain-language "activity" chat (redesign Phase 4).
   Matches the approved "conversational activity view" design: the task framed
   as an opening message, then the agent's real work rendered as a connected
   steps timeline (parsed from the Claude / Codex JSONL transcript via the
   server's LogDigestService), a live thinking indicator, and follow-up bubbles.
   Additive overlay over the terminal, which stays mounted underneath.
--------------------------------------------------------------------------- */

interface TimelineEvent {
  id?: string;
  type: string;
  message?: string;
  timestamp: number;
}

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

// Split a message into a short title (first sentence / line) + the remaining detail.
function splitTitle(text: string): { title: string; detail: string } {
  const clean = (text || "").trim();
  if (!clean) return { title: "Working…", detail: "" };
  const firstLine = clean.split(/\n/)[0];
  const sentence = firstLine.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() || firstLine;
  const title = sentence.length > 120 ? sentence.slice(0, 117) + "…" : sentence;
  const detail = clean.slice(title.length).trim().replace(/^[.!?]\s*/, "");
  return { title, detail };
}

const IconCheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
);
const IconSpin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="pn-chat__spin"><path d="M12 3a9 9 0 1 0 9 9" opacity=".9" /></svg>
);

export function SessionActivityPanel({ session }: { session: any }) {
  const sessionId: string = session?.id;
  const events: TimelineEvent[] = Array.isArray(session?.timeline) ? session.timeline : [];
  const kind = kindFor(session?.metadata?.agentTool);
  const model: string = session?.metadata?.model || session?.model || "";
  const mode: string = session?.mode || session?.metadata?.mode || "worker";
  const status: string = session?.status || "idle";
  const working = status === "working";

  const [stats, setStats] = React.useState<SessionStatsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const feedRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const res = await maestroClient.getSessionStats(sessionId, { lastMessages: 60 });
        if (!cancelled) {
          setStats(res);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(load, working ? 2500 : 8000);
    };
    setLoading(true);
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, working]);

  const messages: SessionTranscriptMessage[] = React.useMemo(
    () => (Array.isArray(stats?.lastMessages) ? stats!.lastMessages : []),
    [stats],
  );

  React.useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, working]);

  // The opening ask: first user message, else the session/task name.
  const firstUserIdx = messages.findIndex((m) => m.source === "user");
  const taskText =
    firstUserIdx >= 0 ? messages[firstUserIdx].text : session?.name || "This session";

  // Everything after the opening ask becomes the conversation flow.
  const flow = firstUserIdx >= 0 ? messages.slice(firstUserIdx + 1) : messages;
  const hasFlow = flow.length > 0;

  const toolSummary = stats?.toolCallCount
    ? `${stats.toolCallCount} tool call${stats.toolCallCount === 1 ? "" : "s"}`
    : "";

  return (
    <div className="pn-chat">
      <div className="pn-chat__head">
        <AgentTile kind={kind} />
        <div className="pn-chat__meta">
          <b className="pn-chat__name">{session?.name || "Session"}</b>
          <span className="pn-chat__sub">
            {kind}
            {model ? ` · ${model}` : ""} · {mode}
            {toolSummary ? ` · ${toolSummary}` : ""}
          </span>
        </div>
        <span className={"pn-chat__status pn-chat__status--" + status}>
          {working && <span className="pn-chat__livedot" />}
          {working ? "Working" : status}
        </span>
      </div>

      <div className="pn-chat__feed" ref={feedRef}>
        <div className="pn-chat__inner">
          {loading && !hasFlow ? (
            <div className="pn-chat__loading">
              <span className="pn-chat__dots"><span /><span /><span /></span>
              Reading the conversation…
            </div>
          ) : (
            <>
              {/* opening ask, framed as a task message */}
              <div className="pn-chat__task">
                <div className="pn-chat__task-who">{kind.charAt(0).toUpperCase()}</div>
                <div className="pn-chat__task-bub">
                  <div className="pn-chat__task-lab">Task</div>
                  <p>{taskText}</p>
                </div>
              </div>

              <div className="pn-chat__agentline">
                <div className="pn-chat__agentav"><AgentTile kind={kind} /></div>
                <b>{session?.name && kind ? kind : "Agent"}</b>
                <span className="pn-chat__agentsub">{working ? "is working on it" : "worked on it"}</span>
              </div>

              {hasFlow ? (
                <div className="pn-chat__steps">
                  {flow.map((m, i) => {
                    const isLast = i === flow.length - 1;
                    const active = working && isLast && m.source === "assistant";
                    if (m.source === "user") {
                      return (
                        <div className="pn-chat__ureply" key={i}>
                          <div className="pn-chat__ureply-who">You · {fmtTime(m.timestamp)}</div>
                          <div className="pn-chat__ureply-text">{m.text}</div>
                        </div>
                      );
                    }
                    const { title, detail } = splitTitle(m.text);
                    return (
                      <div className={"pn-chat__step" + (active ? " pn-chat__step--active" : "")} key={i}>
                        <span className="pn-chat__step-ic">
                          {active ? <IconSpin /> : <IconCheck />}
                        </span>
                        <div className="pn-chat__step-title">
                          {title}
                          <span className="pn-chat__step-time">{fmtTime(m.timestamp)}</span>
                        </div>
                        {detail && <div className="pn-chat__step-detail">{detail}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="pn-chat__waiting">
                  {stats && !stats.jsonlFound
                    ? "The agent hasn't produced any output yet — its steps will appear here as it works."
                    : "Getting started…"}
                </div>
              )}

              {working && (
                <div className="pn-chat__thinking">
                  <span className="pn-chat__dots"><span /><span /><span /></span>
                  {kind} is finishing up
                  {stats?.tokens?.total ? (
                    <span className="pn-chat__thinking-meta"> · {stats.tokens.total.toLocaleString()} tokens</span>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SessionActivityPanel;
