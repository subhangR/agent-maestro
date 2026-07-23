import React from "react";
import { AgentTile, type AgentKind } from "./redesign/kit";
import { maestroClient } from "../../utils/MaestroClient";
import type { AgentTool, MaestroProject, SessionLogDigestResponse, SessionTranscriptMessage } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { createMaestroSession } from "../../services/maestroService";
import {
  AGENT_TOOLS,
  AGENT_TOOL_LABELS,
  AGENT_TOOL_SYMBOLS,
  DEFAULT_MODEL_BY_AGENT_TOOL,
  createLaunchConfig,
  getModelDisplayLabel,
} from "../../app/constants/agentTools";

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

/* ---------------------------------------------------------------------------
   ChatComposer — interactive multi-agent composer (redesign Phase 5).
   One input, three decisions:
     · target  — "This agent" (follow-up into the running session's terminal)
                 or "Default"/Claude/Codex/Gemini/Hermes (spawn a NEW parallel
                 agent session from the prompt).
     · coordinate — when spawning, launch the agent as a coordinator that can
                 delegate to / collaborate with the project's team-member pool.
     · send    — follow-ups reuse useSessionStore.sendPromptToActive (the
                 activity pane always overlays the ACTIVE terminal); new agents
                 reuse the exact task→spawn flow every other UI path uses:
                 useMaestroStore.createTask + services/maestroService
                 .createMaestroSession (spawnSession + WebSocket terminal wiring).
--------------------------------------------------------------------------- */

type ComposerTarget = "this-agent" | "default" | AgentTool;

// Short task title from the first line of the prompt.
function summarizeTitle(text: string): string {
  const line = (text || "").trim().split(/\n/)[0].replace(/\s+/g, " ").trim();
  if (!line) return "New task";
  return line.length > 64 ? line.slice(0, 61) + "…" : line;
}

function targetLabel(target: ComposerTarget): string {
  if (target === "this-agent") return "This agent";
  if (target === "default") return "Default";
  return `${AGENT_TOOL_LABELS[target]} · ${getModelDisplayLabel(DEFAULT_MODEL_BY_AGENT_TOOL[target])}`;
}

const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>
);
const IconCoord = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="18" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M10.7 7l-4 8.6M13.3 7l4 8.6M7.5 18h9" /></svg>
);
const IconChevron = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
);

function ChatComposer({ session, kind }: { session: any; kind: AgentKind }) {
  const [text, setText] = React.useState("");
  const [target, setTarget] = React.useState<ComposerTarget>("this-agent");
  const [coordinate, setCoordinate] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const createTask = useMaestroStore((s) => s.createTask);
  const teamMembers = useMaestroStore((s) => s.teamMembers);
  const sendPromptToActive = useSessionStore((s) => s.sendPromptToActive);

  const project: MaestroProject | null =
    projects.find((p) => p.id === session?.projectId) ??
    projects.find((p) => p.id === activeProjectId) ??
    null;

  const isReply = target === "this-agent";

  const flashNote = (kind: "ok" | "err", text: string) => {
    setNote({ kind, text });
    window.setTimeout(() => setNote((n) => (n?.text === text ? null : n)), 5000);
  };

  const handleSend = async () => {
    const prompt = text.trim();
    if (!prompt || busy) return;

    if (isReply) {
      // Follow-up to the running agent — the activity pane always overlays the
      // ACTIVE terminal session, so sendPromptToActive targets this agent.
      setBusy(true);
      try {
        await sendPromptToActive(
          { id: crypto.randomUUID(), title: "Follow-up", content: prompt, createdAt: Date.now() },
          "send",
        );
        setText("");
        flashNote("ok", `Sent to ${kind}`);
      } catch (err: any) {
        flashNote("err", `Failed to send: ${err?.message || err}`);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
      return;
    }

    if (!project) {
      flashNote("err", "No project found for this session — cannot start an agent.");
      return;
    }

    setBusy(true);
    try {
      // 1 · Log the ask as a real task (same store action the Kanban uses).
      const task = await createTask({
        projectId: project.id,
        title: summarizeTitle(prompt),
        description: prompt,
        initialPrompt: prompt,
        priority: "medium",
      });

      // 2 · Spawn a parallel agent session via the shared spawn flow so the
      //     terminal + WebSocket wiring stays identical to every other launch.
      const tool: AgentTool | undefined = target === "default" ? undefined : target;
      const launchConfig = tool ? createLaunchConfig(tool, DEFAULT_MODEL_BY_AGENT_TOOL[tool]) : undefined;
      const delegatePool = coordinate
        ? Object.values(teamMembers)
            .filter((m) => m.projectId === project.id && m.status === "active")
            .map((m) => m.id)
        : [];
      await createMaestroSession({
        task,
        project,
        mode: coordinate ? "coordinator" : "worker",
        ...(launchConfig ? { launchConfig } : {}),
        ...(coordinate && delegatePool.length > 0 ? { delegateTeamMemberIds: delegatePool } : {}),
      });

      setText("");
      flashNote(
        "ok",
        `${coordinate ? "Coordinating" : "New"} ${targetLabel(target)} agent started — “${task.title}”`,
      );
    } catch (err: any) {
      flashNote("err", `Failed to start agent: ${err?.message || err}`);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const pickTarget = (t: ComposerTarget) => {
    setTarget(t);
    setMenuOpen(false);
    if (t === "this-agent") setCoordinate(false);
    inputRef.current?.focus();
  };

  const placeholder = isReply
    ? `Message ${kind}, or start a new task…`
    : coordinate
      ? "Describe the task — a coordinator will rally agents to fix it…"
      : "Describe the task for the new agent…";

  return (
    <div className="pn-chat__composer">
      <div className="pn-chat__composer-inner">
        {note && (
          <div className={"pn-chat__composer-note pn-chat__composer-note--" + note.kind}>{note.text}</div>
        )}
        <div className="pn-chat__composer-bar">
          <textarea
            ref={inputRef}
            className="pn-chat__composer-input"
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            aria-label="Message the agent or describe a new task"
          />
          <div className="pn-chat__composer-tools">
            <div className="pn-chat__composer-pick">
              <button
                type="button"
                className={"pn-chat__composer-model" + (menuOpen ? " pn-chat__composer-model--open" : "")}
                onClick={() => setMenuOpen((o) => !o)}
                title="Choose who handles this message"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                {targetLabel(target)}
                <IconChevron />
              </button>
              {menuOpen && (
                <>
                  <div className="pn-chat__composer-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="pn-chat__composer-menu" role="menu">
                    <div className="pn-chat__composer-menu-lab">Reply</div>
                    <button
                      type="button"
                      role="menuitem"
                      className={"pn-chat__composer-item" + (target === "this-agent" ? " pn-chat__composer-item--on" : "")}
                      onClick={() => pickTarget("this-agent")}
                    >
                      <span className="pn-chat__composer-sym">↩</span>
                      This agent
                      <span className="pn-chat__composer-item-sub">continue session</span>
                    </button>
                    <div className="pn-chat__composer-menu-lab">New parallel agent</div>
                    <button
                      type="button"
                      role="menuitem"
                      className={"pn-chat__composer-item" + (target === "default" ? " pn-chat__composer-item--on" : "")}
                      onClick={() => pickTarget("default")}
                    >
                      <span className="pn-chat__composer-sym">✦</span>
                      Default
                      <span className="pn-chat__composer-item-sub">app default model</span>
                    </button>
                    {AGENT_TOOLS.map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        role="menuitem"
                        className={"pn-chat__composer-item" + (target === tool ? " pn-chat__composer-item--on" : "")}
                        onClick={() => pickTarget(tool)}
                      >
                        <span className={"pn-chat__composer-sym pn-chat__composer-sym--" + tool}>
                          {AGENT_TOOL_SYMBOLS[tool]}
                        </span>
                        {AGENT_TOOL_LABELS[tool]}
                        <span className="pn-chat__composer-item-sub">
                          {getModelDisplayLabel(DEFAULT_MODEL_BY_AGENT_TOOL[tool])}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              className={"pn-chat__composer-coord" + (coordinate ? " pn-chat__composer-coord--on" : "")}
              onClick={() => {
                if (isReply) {
                  // Coordinate implies spawning a coordinator — flip to a new agent.
                  setTarget("default");
                  setCoordinate(true);
                } else {
                  setCoordinate((c) => !c);
                }
              }}
              title="Coordinate: the new agent can delegate to and collaborate with other-model agents"
              aria-pressed={coordinate}
            >
              <IconCoord />
              Coordinate
            </button>
            <button
              type="button"
              className="pn-chat__composer-send"
              onClick={() => void handleSend()}
              disabled={busy || !text.trim()}
              title={isReply ? "Send to this agent (Enter)" : "Start the agent (Enter)"}
              aria-label={isReply ? "Send message" : "Start agent"}
            >
              <IconSend />
            </button>
          </div>
        </div>
        <div className="pn-chat__composer-hint">
          {isReply
            ? "Enter sends to this agent · pick a model to launch a new parallel agent"
            : coordinate
              ? "Enter spawns a coordinator that delegates across your agent pool"
              : "Enter creates a task and spawns a parallel agent"}
        </div>
      </div>
    </div>
  );
}

const IconCheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
);
const IconSpin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="pn-chat__spin"><path d="M12 3a9 9 0 1 0 9 9" opacity=".9" /></svg>
);

export function normalizeTranscriptMessage(message: SessionTranscriptMessage): SessionTranscriptMessage {
  if (message.source !== "user") return message;

  const text = message.text.replace(/^\[PROMPT\]\s*/, "");
  return text === message.text ? message : { ...message, text };
}

export function SessionActivityPanel({ session, visible = true }: { session: any; visible?: boolean }) {
  const sessionId: string = session?.id;
  const events: TimelineEvent[] = Array.isArray(session?.timeline) ? session.timeline : [];
  const kind = kindFor(session?.metadata?.agentTool);
  const model: string = session?.metadata?.model || session?.model || "";
  const mode: string = session?.mode || session?.metadata?.mode || "worker";
  const status: string = session?.status || "idle";
  const working = status === "working";

  const [digest, setDigest] = React.useState<SessionLogDigestResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const digestRef = React.useRef<SessionLogDigestResponse | null>(null);
  const feedRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!sessionId) return;

    // Keep the last response mounted for instant Terminal → Chat switches, but
    // stop recurring work while the terminal covers this panel. If the active
    // session changed while hidden, do one inexpensive prefetch so its first
    // Chat reveal is still immediate.
    const hasCurrentDigest = digestRef.current?.sessionId === sessionId;
    if (!visible && hasCurrentDigest) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const res = await maestroClient.getSessionLogDigest(sessionId, { last: 60, maxLength: 220 });
        if (!cancelled) {
          digestRef.current = res;
          setDigest(res);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled && visible) timer = setTimeout(load, working ? 2500 : 8000);
    };
    if (!hasCurrentDigest) setLoading(true);
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, visible, working]);

  const currentDigest = digest?.sessionId === sessionId ? digest : null;

  const messages: SessionTranscriptMessage[] = React.useMemo(
    () => (Array.isArray(currentDigest?.entries) ? currentDigest.entries.map(normalizeTranscriptMessage) : []),
    [currentDigest],
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

  return (
    <div className="pn-chat">
      <div className="pn-chat__head">
        <AgentTile kind={kind} />
        <div className="pn-chat__meta">
          <b className="pn-chat__name">{session?.name || "Session"}</b>
          <span className="pn-chat__sub">
            {kind}
            {model ? ` · ${model}` : ""} · {mode}
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
                  {currentDigest
                    ? "The agent hasn't produced any output yet — its steps will appear here as it works."
                    : "Getting started…"}
                </div>
              )}

              {working && (
                <div className="pn-chat__thinking">
                  <span className="pn-chat__dots"><span /><span /><span /></span>
                  {kind} is finishing up
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ChatComposer session={session} kind={kind} />
    </div>
  );
}

export default SessionActivityPanel;
