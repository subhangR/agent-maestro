import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../../platform';
import { parseJsonlText, calculateMetrics, groupMessages, checkMessagesOngoing, trackContext } from '../../utils/claude-log';
import type { ParsedMessage } from '../../utils/claude-log';
import { SessionLogViewer } from './SessionLogViewer';
import { ContextPanel } from './ContextPanel';
import { TokenUsageBadge } from './viewers/TokenUsageBadge';
import { useMaestroStore } from '../../stores/useMaestroStore';

interface ClaudeLogFile {
  filename: string;
  relativePath?: string;
  modifiedAt: number;
  size: number;
  maestroSessionId?: string | null;
}

interface LogTailResult {
  content: string;
  newOffset: number;
  fileSize: number;
}

interface SessionLogModalProps {
  sessionName: string;
  cwd: string;
  onClose: () => void;
  maestroSessionId?: string | null;
  agentTool?: string | null;
}

const POLL_INTERVAL = 2000;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type ViewMode = 'conversation' | 'context';
type LogProvider = 'claude' | 'codex';

function resolveLogProvider(agentTool?: string | null): LogProvider {
  return agentTool === 'codex' ? 'codex' : 'claude';
}

export function SessionLogModal({ sessionName, cwd, onClose, maestroSessionId, agentTool }: SessionLogModalProps) {
  const provider = resolveLogProvider(agentTool);
  const [logFiles, setLogFiles] = useState<ClaudeLogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [allMessages, setAllMessages] = useState<ParsedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('conversation');
  const offsetRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Look up Maestro session names for log files that have a maestroSessionId
  const maestroSessions = useMaestroStore((s) => s.sessions);
  const getLogFilePath = useCallback((f: ClaudeLogFile) => f.relativePath ?? f.filename, []);
  const getFileDisplayName = useCallback((f: ClaudeLogFile) => {
    if (f.maestroSessionId) {
      const session = maestroSessions[f.maestroSessionId];
      if (session?.name) {
        return `${session.name} (${formatFileSize(f.size)})`;
      }
    }
    return `${f.filename} (${formatFileSize(f.size)})`;
  }, [maestroSessions]);

  // Escape key close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  // Auto-scroll when new messages arrive
  const autoScroll = useCallback(() => {
    const el = bodyRef.current;
    if (el && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Load log file list
  useEffect(() => {
    if (!IS_TAURI) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const listCommand = provider === 'codex' ? 'list_codex_session_logs' : 'list_claude_session_logs';
    invoke<ClaudeLogFile[]>(listCommand, { cwd })
      .then((files) => {
        setLogFiles(files);
        if (files.length > 0) {
          // Auto-select the file matching maestroSessionId, or fall back to first
          const match = maestroSessionId
            ? files.find((f) => f.maestroSessionId === maestroSessionId)
            : null;
          setSelectedFile(getLogFilePath(match ?? files[0]));
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [cwd, maestroSessionId, provider, getLogFilePath]);

  // Initial full load when file is selected
  useEffect(() => {
    if (!selectedFile) return;
    setAllMessages([]);
    offsetRef.current = 0;

    const readCommand = provider === 'codex' ? 'read_codex_session_log' : 'read_claude_session_log';
    invoke<string>(readCommand, { cwd, filename: selectedFile })
      .then((content) => {
        const messages = parseJsonlText(content);
        setAllMessages(messages);
        offsetRef.current = new Blob([content]).size;
        setTimeout(autoScroll, 50);
      })
      .catch((err) => setError(String(err)));
  }, [cwd, selectedFile, autoScroll, provider]);

  // Polling for new content
  useEffect(() => {
    if (!live || !selectedFile) return;

    const poll = async () => {
      try {
        const tailCommand = provider === 'codex' ? 'tail_codex_session_log' : 'tail_claude_session_log';
        const result = await invoke<LogTailResult>(tailCommand, {
          cwd,
          filename: selectedFile,
          offset: offsetRef.current,
        });

        if (result.content.length > 0) {
          const newMessages = parseJsonlText(result.content);
          if (newMessages.length > 0) {
            setAllMessages((prev) => [...prev, ...newMessages]);
            setTimeout(autoScroll, 50);
          }
          offsetRef.current = result.newOffset;
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [live, selectedFile, cwd, autoScroll, provider]);

  // Compute groups, metrics, state, and context from accumulated messages
  const { groups, metrics, isOngoing, contextCategories, totalContextTokens } = useMemo(() => {
    if (allMessages.length === 0) return { groups: [], metrics: null, isOngoing: false, contextCategories: [], totalContextTokens: 0 };
    const cats = trackContext(allMessages);
    const totalCtx = cats.reduce((sum, c) => sum + c.tokenCount, 0);
    return {
      groups: groupMessages(allMessages),
      metrics: calculateMetrics(allMessages),
      isOngoing: checkMessagesOngoing(allMessages),
      contextCategories: cats,
      totalContextTokens: totalCtx,
    };
  }, [allMessages]);

  return (
    <div className="maestroModalOverlay" onClick={onClose}>
      <div className="terminalTaskModal sessionLogModal pnLeakSkin" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="terminalModalHeader">
          <div className="terminalModalHeaderContent">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="terminalModalTitle">
                Session Log: {sessionName}
              </h2>
              <button type="button" className="terminalModalBtn" onClick={onClose} title="Close">
                ✕
              </button>
            </div>
            <div className="sessionLogHeaderMeta">
              {logFiles.length > 1 && (
                <select
                  className="sessionLogFileSelect"
                  value={selectedFile ?? ''}
                  onChange={(e) => setSelectedFile(e.target.value)}
                >
                  {logFiles.map((f) => (
                    <option key={getLogFilePath(f)} value={getLogFilePath(f)}>
                      {getFileDisplayName(f)}
                    </option>
                  ))}
                </select>
              )}
              {logFiles.length === 1 && selectedFile && (
                <span className="sessionLogFilename">{getFileDisplayName(logFiles[0])}</span>
              )}
              {/* Session state badge */}
              {allMessages.length > 0 && (
                <span className={`sessionLogStateBadge ${isOngoing ? 'sessionLogStateBadgeActive' : 'sessionLogStateBadgeIdle'}`}>
                  {isOngoing ? 'ACTIVE' : 'IDLE'}
                </span>
              )}
              {metrics && (
                <div className="sessionLogMetrics">
                  <span className="sessionLogMetricItem">
                    {formatDuration(metrics.durationMs)}
                  </span>
                  <TokenUsageBadge
                    inputTokens={metrics.inputTokens}
                    outputTokens={metrics.outputTokens}
                  />
                  <span className="sessionLogMetricItem">
                    {metrics.messageCount} msgs
                  </span>
                </div>
              )}
              {/* View mode toggle */}
              <div className="sessionLogViewToggle">
                <button type="button"
                  className={`sessionLogViewBtn ${viewMode === 'conversation' ? 'sessionLogViewBtnActive' : ''}`}
                  onClick={() => setViewMode('conversation')}
                >
                  Chat
                </button>
                <button type="button"
                  className={`sessionLogViewBtn ${viewMode === 'context' ? 'sessionLogViewBtnActive' : ''}`}
                  onClick={() => setViewMode('context')}
                >
                  Context
                </button>
              </div>
              <button type="button"
                className={`sessionLogLiveBtn ${live ? 'sessionLogLiveBtnActive' : ''}`}
                onClick={() => setLive((v) => !v)}
                title={live ? 'Disable live updates' : 'Enable live updates'}
              >
                {live ? '● LIVE' : '○ LIVE'}
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          className="terminalModalBody sessionLogModalBody"
          ref={bodyRef}
          onScroll={handleScroll}
        >
          {loading && (
            <div className="terminalEmptyState">Loading session logs...</div>
          )}
          {error && (
            <div className="terminalEmptyState" style={{ color: 'var(--accent)' }}>
              Error: {error}
            </div>
          )}
          {!loading && !error && logFiles.length === 0 && (
            <div className="terminalEmptyState">
              {provider === 'codex'
                ? 'No Codex session logs found for this project.'
                : 'No Claude Code session logs found for this project.'}
            </div>
          )}
          {!loading && allMessages.length > 0 && viewMode === 'conversation' && (
            <SessionLogViewer groups={groups} />
          )}
          {!loading && allMessages.length > 0 && viewMode === 'context' && (
            <ContextPanel categories={contextCategories} totalTokens={totalContextTokens} />
          )}
          {!loading && selectedFile && allMessages.length === 0 && !error && (
            <div className="terminalEmptyState">Loading log file...</div>
          )}
        </div>

        {/* Footer */}
        <div className="terminalModalFooter">
          <div className="terminalModalFooterLeft">
            <span className="terminalModalFooterLabel">
              {provider === 'codex' ? 'Codex Log' : 'Claude Code Log'}
            </span>
            {live && <span className="sessionLogLiveIndicator" />}
            {isOngoing && <span className="sessionLogOngoingIndicator" />}
          </div>
          <div className="terminalModalFooterRight">
            <button type="button" className="terminalModalBtn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
