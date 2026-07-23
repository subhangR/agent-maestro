import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { maestroClient } from "../../../utils/MaestroClient";
import { useSessionStore } from "../../../stores/useSessionStore";
import { Icon } from "../redesign/kit";
import type { ChatTurn, MaestroSession } from "../../../app/types/maestro";
import "./chat.css";

const POLL_INTERVAL_MS = 1500;

interface ChatViewProps {
  sessionId: string;
  session: MaestroSession;
}

/**
 * Custom chat surface for a session — renders the structured JSONL transcript
 * as user/assistant bubbles with collapsible tool chips, tail-polling for new
 * turns. A lightweight alternative to replaying the raw terminal.
 */
export function ChatView({ sessionId, session }: ChatViewProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(true);
  const [draft, setDraft] = useState("");

  const offsetRef = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const deliverPrompt = useSessionStore((s) => s.deliverPromptToMaestroSession);

  const isLive =
    session.status === "working" ||
    session.status === "idle" ||
    session.status === "spawning";

  const mergeTurns = useCallback((incoming: ChatTurn[]) => {
    if (incoming.length === 0) return;
    setTurns((prev) => {
      const next = prev.slice();
      for (const t of incoming) {
        if (seenIds.current.has(t.id)) continue;
        seenIds.current.add(t.id);
        next.push(t);
      }
      return next;
    });
  }, []);

  // Initial load + reset when the target session changes.
  useEffect(() => {
    let cancelled = false;
    offsetRef.current = 0;
    seenIds.current = new Set();
    setTurns([]);
    setLoading(true);
    setError(null);

    maestroClient
      .getSessionTranscript(sessionId, {})
      .then((res) => {
        if (cancelled) return;
        offsetRef.current = res.nextOffset;
        setFound(res.found);
        for (const t of res.turns) seenIds.current.add(t.id);
        setTurns(res.turns);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load transcript");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Tail-poll for new turns using the byte cursor.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await maestroClient.getSessionTranscript(sessionId, {
          afterOffset: offsetRef.current,
        });
        if (cancelled) return;
        offsetRef.current = res.nextOffset;
        if (res.found) setFound(true);
        mergeTurns(res.turns);
      } catch {
        // transient — keep polling
      }
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId, mergeTurns]);

  // Track whether the user is pinned to the bottom.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // Auto-scroll to bottom when new turns arrive and the user was at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [turns.length]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    deliverPrompt(sessionId, text, "send");
    setDraft("");
  }, [draft, deliverPrompt, sessionId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const body = useMemo(() => {
    if (loading) return <div className="pn-fhint">Loading conversation…</div>;
    if (error) return <div className="pn-fhint">{error}</div>;
    if (!found)
      return (
        <div className="pn-fhint">
          No transcript found for this session yet. Once the agent starts
          producing output it will appear here.
        </div>
      );
    if (turns.length === 0)
      return <div className="pn-fhint">No messages yet.</div>;
    return turns.map((t) => <ChatTurnRow key={t.id} turn={t} />);
  }, [loading, error, found, turns]);

  return (
    <div className="pn-chat">
      <div className="pn-chat__scroll" ref={scrollRef} onScroll={handleScroll}>
        {body}
      </div>
      <div className="pn-chat__compose">
        <textarea
          className="pn-chat__input"
          placeholder={
            isLive ? "Reply to this session…  (Enter to send, Shift+Enter for newline)" : "Session is not live"
          }
          value={draft}
          disabled={!isLive}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
        />
        <button
          type="button"
          className="pn-btn pn-btn--primary pn-chat__send"
          disabled={!isLive || draft.trim().length === 0}
          onClick={handleSend}
          title="Send reply"
        >
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </div>
  );
}

function ChatTurnRow({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={`pn-chatrow ${isUser ? "pn-chatrow--user" : "pn-chatrow--assistant"}`}>
      <div className="pn-chatrow__role">
        <Icon name={isUser ? "at" : "bot"} size={13} />
        <span>{isUser ? "You" : "Agent"}</span>
      </div>
      <div className={`pn-bubble ${isUser ? "pn-bubble--user" : "pn-bubble--assistant"}`}>
        {turn.text && (
          <div className="pn-bubble__md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
          </div>
        )}
        {turn.toolCalls.length > 0 && (
          <div className="pn-bubble__tools">
            {turn.toolCalls.map((c, i) => (
              <ToolChip key={c.id || i} call={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolChip({ call }: { call: ChatTurn["toolCalls"][number] }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(call.resultPreview);
  return (
    <div className={`pn-toolchip ${open ? "pn-toolchip--open" : ""}`}>
      <button
        type="button"
        className="pn-toolchip__hd"
        onClick={() => expandable && setOpen((v) => !v)}
        style={{ cursor: expandable ? "pointer" : "default" }}
      >
        <Icon name="terminal" size={12} />
        <span className="pn-toolchip__name">{call.name}</span>
        {call.input && <span className="pn-toolchip__arg">{call.input}</span>}
        {expandable && <Icon name={open ? "chevronD" : "chevronR"} size={11} />}
      </button>
      {open && call.resultPreview && (
        <pre className="pn-toolchip__result">{call.resultPreview}</pre>
      )}
    </div>
  );
}
