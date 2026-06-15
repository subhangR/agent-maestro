import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { platform } from '../../platform';
import type { AgentLogFile } from '../../platform';
import { parseJsonlText, groupMessages, checkMessagesOngoing } from '../../utils/claude-log';
import type { ParsedMessage, ConversationGroup } from '../../utils/claude-log';
import { LogMessageGroup } from './LogMessageGroup';
import { useSpellStore } from '../../stores/useSpellStore';
import { Icon } from '../Icon';
import { SessionDocsMenu } from '../maestro/SessionDocsMenu';

interface TerminalStripProps {
  cwd: string;
  maestroSessionId: string;
  agentTool?: string | null;
  onAttach: () => void;
  onDraw: () => void;
}

const POLL_INTERVAL = 2000;
/** Default model context window used to fill the circular gauge. */
const CONTEXT_WINDOW_MAX = 200_000;
/** How many ancestor directories to probe when resolving the log dir. */
const MAX_CWD_ANCESTORS = 12;
type LogProvider = 'claude' | 'codex';

function resolveLogProvider(agentTool?: string | null): LogProvider {
  return agentTool === 'codex' ? 'codex' : 'claude';
}

/**
 * Build the list of cwd candidates to probe for this session's log, starting
 * with `cwd` itself and walking up its ancestors.
 *
 * Why: the agent's live working directory (reported via the terminal's OSC
 * sequences) drifts whenever a command `cd`s into a subdirectory. But Claude /
 * Codex keep a session's log under the directory the agent was *launched* from
 * — an ancestor of any later cwd — and never move it. Probing ancestors lets us
 * still find the log after the cwd has drifted into a subtree. Matching is by
 * unique maestro session id, so scanning an extra ancestor can't mis-match.
 */
function cwdCandidates(cwd: string): string[] {
  const normalized = cwd.trim().replace(/\/+$/, '');
  if (!normalized) return [cwd];
  const candidates: string[] = [normalized];
  let current = normalized;
  for (let i = 0; i < MAX_CWD_ANCESTORS; i++) {
    const slash = current.lastIndexOf('/');
    // Stop once we reach a filesystem root ("/foo" -> "" / "/") — going higher
    // (e.g. into "/Users/<user>") would scan huge, unrelated project dirs.
    if (slash <= 0) break;
    current = current.slice(0, slash);
    candidates.push(current);
  }
  return candidates;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

interface StripStats {
  /** Current context window size (from last assistant msg) */
  contextTokens: number;
  /** Cache hit % of context */
  cacheHitPct: number;
  /** Cumulative output tokens generated */
  totalOutput: number;
  /** Number of API turns (assistant messages with usage) */
  turns: number;
  /** Total tool calls */
  toolCalls: number;
  /** Total messages in log */
  messageCount: number;
  /** Duration from first to last message */
  durationMs: number;
  /** Model name from last assistant */
  model: string | null;
}

function computeStripStats(messages: ParsedMessage[]): StripStats {
  let totalOutput = 0;
  let turns = 0;
  let toolCalls = 0;
  let contextTokens = 0;
  let cacheHitPct = 0;
  let model: string | null = null;

  const timestamps = messages.map(m => m.timestamp.getTime()).filter(t => !isNaN(t));
  let durationMs = 0;
  if (timestamps.length >= 2) {
    let min = timestamps[0], max = timestamps[0];
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < min) min = timestamps[i];
      if (timestamps[i] > max) max = timestamps[i];
    }
    durationMs = max - min;
  }

  for (const msg of messages) {
    toolCalls += msg.toolCalls.length;

    if (msg.usage) {
      totalOutput += msg.usage.output_tokens ?? 0;
      turns++;

      // Use the latest assistant message's usage as "current context"
      const input = msg.usage.input_tokens ?? 0;
      const cacheRead = msg.usage.cache_read_input_tokens ?? 0;
      const cacheCreate = msg.usage.cache_creation_input_tokens ?? 0;
      contextTokens = input + cacheRead + cacheCreate;
      const totalInput = contextTokens;
      cacheHitPct = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;
    }

    if (msg.model) model = msg.model;
  }

  return {
    contextTokens,
    cacheHitPct,
    totalOutput,
    turns,
    toolCalls,
    messageCount: messages.length,
    durationMs,
    model,
  };
}

/** Small circular context-window gauge (contextTokens / window max). */
function ContextGauge({ tokens }: { tokens: number }) {
  const pct = Math.max(0, Math.min(1, tokens / CONTEXT_WINDOW_MAX));
  const r = 7;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const pctLabel = Math.round(pct * 100);
  return (
    <span
      className="termStripGauge"
      title={`Context window — ${formatTokens(tokens)} / ${formatTokens(CONTEXT_WINDOW_MAX)} (${pctLabel}%)`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <circle className="termStripGaugeTrack" cx="9" cy="9" r={r} />
        <circle
          className="termStripGaugeFill"
          cx="9"
          cy="9"
          r={r}
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span className="termStripGaugeLabel">{formatTokens(tokens)}</span>
    </span>
  );
}

export function TerminalStrip({ cwd, maestroSessionId, agentTool, onAttach, onDraw }: TerminalStripProps) {
  const provider = resolveLogProvider(agentTool);
  const openPicker = useSpellStore((s) => s.openPicker);
  const [resolvedProvider, setResolvedProvider] = useState<LogProvider>(provider);
  // The cwd whose project dir actually held the log. May be an ancestor of the
  // live `cwd` prop once the agent has cd'd into a subdirectory.
  const [resolvedCwd, setResolvedCwd] = useState<string>(cwd);
  const [allMessages, setAllMessages] = useState<ParsedMessage[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const offsetRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  // Latest live cwd, read inside discovery without re-triggering it. The cwd
  // drifts constantly as the agent cd's; we resolve the (stable) log dir once
  // per session rather than tearing the strip down on every drift.
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const getLogFilePath = useCallback((f: AgentLogFile) => f.relativePath ?? f.filename, []);

  const autoScroll = useCallback(() => {
    const el = bodyRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  }, []);

  // Find the matching log file — retry until found
  useEffect(() => {
    let cancelled = false;

    // Reset discovery state when source inputs change.
    setReady(false);
    setSelectedFile(null);
    setResolvedProvider(provider);
    setResolvedCwd(cwdRef.current);

    const providerOrder: LogProvider[] = provider === 'codex'
      ? ['codex', 'claude']
      : ['claude', 'codex'];

    const search = async () => {
      // Re-read the live cwd each attempt: the log lives under the launch
      // directory (an ancestor of any later cwd), so probe cwd and its
      // ancestors. Matching is by unique session id, so an extra ancestor
      // can't mis-match.
      const candidateCwds = cwdCandidates(cwdRef.current);
      for (const candidate of providerOrder) {
        for (const candidateCwd of candidateCwds) {
          try {
            const files = await platform.logs.list(candidate, candidateCwd);
            if (cancelled) return;
            const match = files.find((f) => f.maestroSessionId === maestroSessionId);
            if (match) {
              setSelectedFile(getLogFilePath(match));
              setResolvedProvider(candidate);
              setResolvedCwd(candidateCwd);
              setReady(true);
              return;
            }
          } catch {
            // Try the next candidate / provider.
          }
        }
      }

      if (!cancelled) {
        setTimeout(search, POLL_INTERVAL);
      }
    };

    search();
    return () => { cancelled = true; };
  }, [maestroSessionId, provider, getLogFilePath]);

  // Initial full load
  useEffect(() => {
    if (!selectedFile) return;
    setAllMessages([]);
    offsetRef.current = 0;

    platform.logs.read(resolvedProvider, resolvedCwd, selectedFile)
      .then((content) => {
        const messages = parseJsonlText(content);
        setAllMessages(messages);
        offsetRef.current = new Blob([content]).size;
        setTimeout(autoScroll, 50);
      })
      .catch(() => {});
  }, [resolvedCwd, selectedFile, autoScroll, resolvedProvider]);

  // Live polling
  useEffect(() => {
    if (!selectedFile) return;

    const poll = async () => {
      try {
        const result = await platform.logs.tail(resolvedProvider, resolvedCwd, selectedFile, offsetRef.current);
        if (result.content.length > 0) {
          const newMessages = parseJsonlText(result.content);
          if (newMessages.length > 0) {
            setAllMessages((prev) => [...prev, ...newMessages]);
            setTimeout(autoScroll, 50);
          }
          offsetRef.current = result.newOffset;
        }
      } catch {
        // ignore poll errors
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [selectedFile, resolvedCwd, autoScroll, resolvedProvider]);

  const { groups, isOngoing, stats } = useMemo(() => {
    if (allMessages.length === 0) {
      return {
        groups: [] as ConversationGroup[],
        isOngoing: false,
        stats: { contextTokens: 0, cacheHitPct: 0, totalOutput: 0, turns: 0, toolCalls: 0, messageCount: 0, durationMs: 0, model: null } as StripStats,
      };
    }
    return {
      groups: groupMessages(allMessages),
      isOngoing: checkMessagesOngoing(allMessages),
      stats: computeStripStats(allMessages),
    };
  }, [allMessages]);

  // Don't render until we've found the log file
  if (!ready || !selectedFile) return null;

  return (
    <div className={`termStrip ${expanded ? 'termStrip--expanded' : ''}`}>
      {/* Expanded: full log transcript — opens UPWARD, above the strip */}
      {expanded && (
        <div className="termStripOverlay" ref={bodyRef} onScroll={handleScroll}>
          {allMessages.length === 0 ? (
            <div className="termStripEmpty">Waiting for log data...</div>
          ) : (
            <div className="sessionLogViewer">
              {groups.map((group, i) => (
                <LogMessageGroup key={i} group={group} index={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* The fused bottom strip */}
      <div className="termStripBar">
        {/* 1. Session Log toggle */}
        <button
          type="button"
          className="termStripToggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? 'Collapse session log' : 'Expand session log'}
        >
          <span className="termStripChevron">{expanded ? '▾' : '▸'}</span>
          <span className="termStripLabel">Session Log</span>
          {isOngoing && <span className="termStripLiveDot" />}
          {isOngoing && <span className="termStripLiveTag">LIVE</span>}
        </button>

        {/* 2. Stats rail (edge-faded) */}
        <div className="termStripRail">
          <div className="termStripRailInner">
            {stats.contextTokens > 0 && <ContextGauge tokens={stats.contextTokens} />}
            {stats.cacheHitPct > 0 && (
              <span className="termStripStat termStripStat--cache" title="Cache hit rate">
                {stats.cacheHitPct}% cache
              </span>
            )}
            {stats.totalOutput > 0 && (
              <span className="termStripStat termStripStat--dim" title="Total output tokens">
                out {formatTokens(stats.totalOutput)}
              </span>
            )}
            {stats.turns > 0 && (
              <span className="termStripStat termStripStat--dim" title="API turns">
                {stats.turns} {stats.turns === 1 ? 'turn' : 'turns'}
              </span>
            )}
            {stats.toolCalls > 0 && (
              <span className="termStripStat termStripStat--dim" title="Tool calls">
                {stats.toolCalls} tools
              </span>
            )}
            {stats.durationMs > 0 && (
              <span className="termStripStat termStripStat--dim" title="Duration">
                {formatDuration(stats.durationMs)}
              </span>
            )}
          </div>
        </div>

        {/* 3. Model badge — brass pill, kept fully visible */}
        {stats.model && (
          <span className="termStripModel" title="Model">
            {stats.model.replace('claude-', '').replace(/-\d{8}$/, '')}
          </span>
        )}

        {/* 4. Actions */}
        <div className="termStripActions">
          <SessionDocsMenu maestroSessionId={maestroSessionId} />
          <button
            type="button"
            className="termStripActionBtn"
            onClick={onAttach}
            title="Attach files — inject @paths into session"
            aria-label="Attach files"
          >
            <Icon name="paperclip" size={15} />
          </button>
          <button
            type="button"
            className="termStripActionBtn"
            onClick={onDraw}
            title="Draw — sketch and inject the drawing into session"
            aria-label="Open drawing board"
          >
            <Icon name="pencil" size={15} />
          </button>
          <button
            type="button"
            className="termStripActionBtn"
            onClick={() => openPicker(maestroSessionId)}
            title="Cast spell — inject prompt into session"
            aria-label="Open spell picker"
          >
            <span className="termStripActionGlyph">✦</span>
          </button>
        </div>
      </div>
    </div>
  );
}
