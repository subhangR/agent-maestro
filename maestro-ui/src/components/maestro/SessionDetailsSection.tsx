import React, { useState } from "react";
import type { MaestroSession, WorkerStrategy } from "../../app/types/maestro";
import { WorktreeBadge, getWorktreeInfo } from "./WorktreeBadge";
import { SessionLiveIndicator } from "./SessionLiveIndicator";
import { copyToClipboardOrWarn } from "../../utils/domUtils";

interface SessionDetailsSectionProps {
  session: MaestroSession;
  compact?: boolean;
  showEnv?: boolean;
  showMetadata?: boolean;
  showSystemInfo?: boolean;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Monospace id row with a copy-to-clipboard button. Used to surface the Maestro
// and Claude session ids for debugging and manual `claude --resume`.
function CopyableId({ label, value }: { label: string; value?: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    const ok = await copyToClipboardOrWarn(value, label);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="sessionDetailsRow">
      <span className="sessionDetailsLabel">{label}:</span>
      {value ? (
        <button type="button"
          className="sessionDetailsValue sessionDetailsValue--mono sessionDetailsValue--copy"
          onClick={(e) => { e.stopPropagation(); void handleCopy(); }}
          title={`Click to copy ${value}`}
        >
          <span className="sessionDetailsIdText">{value}</span>
          <span className="sessionDetailsCopyHint">{copied ? "copied" : "copy"}</span>
        </button>
      ) : (
        <span className="sessionDetailsValue sessionDetailsValue--mono">—</span>
      )}
    </div>
  );
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startMs: number, endMs?: number | null): string {
  const end = endMs || Date.now();
  const seconds = Math.floor((end - startMs) / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function SessionDetailsSection({
  session,
  compact = false,
  showEnv = true,
  showMetadata = true,
  showSystemInfo = true,
}: SessionDetailsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showFullEnv, setShowFullEnv] = useState(false);

  const envVars = Object.entries(session.env || {});
  const metadata: [string, any][] = [];

  // Mask sensitive env vars
  const sensitiveKeys = ["KEY", "SECRET", "TOKEN", "PASSWORD", "CREDENTIAL"];
  const maskValue = (key: string, value: string): string => {
    if (sensitiveKeys.some((sk) => key.toUpperCase().includes(sk))) {
      return "***hidden***";
    }
    return value;
  };

  return (
    <div className={`sessionDetailsSection ${compact ? "sessionDetailsSection--compact" : ""}`}>
      <button type="button"
        className="sessionDetailsSectionHeader"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="sessionDetailsSectionToggle">
          {isExpanded ? "▾" : "▸"}
        </span>
        <span className="sessionDetailsSectionTitle">Session Details</span>
      </button>

      {isExpanded && (
        <div className="sessionDetailsSectionContent">
          {/* Identifiers (for debugging / manual resume) */}
          <div className="sessionDetailsGroup">
            <div className="sessionDetailsGroupTitle">Identifiers</div>
            <div className="sessionDetailsGrid">
              <CopyableId label="Maestro Session ID" value={session.id} />
              <CopyableId label="Claude Session ID" value={session.claudeSessionId} />
            </div>
          </div>

          {/* Core Info */}
          <div className="sessionDetailsGrid">
            <div className="sessionDetailsRow">
              <span className="sessionDetailsLabel">Status:</span>
              <span className="sessionDetailsValue sessionDetailsValue--statusLine">
                <span className={`sessionDetailsValue--status-${session.status}`}>
                  {session.status}
                </span>
                <SessionLiveIndicator
                  maestroSessionId={session.id}
                  status={session.status}
                  needsInput={session.needsInput?.active}
                />
              </span>
            </div>

            <div className="sessionDetailsRow">
              <span className="sessionDetailsLabel">Started:</span>
              <span className="sessionDetailsValue">
                {formatDateTime(session.startedAt)}
              </span>
            </div>

            <div className="sessionDetailsRow">
              <span className="sessionDetailsLabel">Last Activity:</span>
              <span className="sessionDetailsValue">
                {formatTimeAgo(session.lastActivity)}
              </span>
            </div>

            <div className="sessionDetailsRow">
              <span className="sessionDetailsLabel">Duration:</span>
              <span className="sessionDetailsValue">
                {formatDuration(session.startedAt, session.completedAt)}
              </span>
            </div>

            {session.completedAt && (
              <div className="sessionDetailsRow">
                <span className="sessionDetailsLabel">Completed:</span>
                <span className="sessionDetailsValue">
                  {formatDateTime(session.completedAt)}
                </span>
              </div>
            )}
            {(() => {
              const wt = getWorktreeInfo(session);
              return wt ? (
                <div className="sessionDetailsRow">
                  <span className="sessionDetailsLabel">Branch:</span>
                  <span className="sessionDetailsValue">
                    <WorktreeBadge branch={wt.branch} />
                  </span>
                </div>
              ) : null;
            })()}
          </div>

          {/* System Info */}
          {showSystemInfo && (session.hostname || session.platform) && (
            <div className="sessionDetailsGroup">
              <div className="sessionDetailsGroupTitle">System Information</div>
              <div className="sessionDetailsGrid">
                {session.hostname && (
                  <div className="sessionDetailsRow">
                    <span className="sessionDetailsLabel">Hostname:</span>
                    <span className="sessionDetailsValue sessionDetailsValue--mono">
                      {session.hostname}
                    </span>
                  </div>
                )}
                {session.platform && (
                  <div className="sessionDetailsRow">
                    <span className="sessionDetailsLabel">Platform:</span>
                    <span className="sessionDetailsValue sessionDetailsValue--mono">
                      {session.platform}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Environment Variables */}
          {showEnv && envVars.length > 0 && (
            <div className="sessionDetailsGroup">
              <div className="sessionDetailsGroupHeader">
                <span className="sessionDetailsGroupTitle">
                  Environment ({envVars.length} variable{envVars.length !== 1 ? "s" : ""})
                </span>
                <button type="button"
                  className="sessionDetailsShowBtn"
                  onClick={() => setShowFullEnv(!showFullEnv)}
                >
                  {showFullEnv ? "Hide" : "Show"}
                </button>
              </div>
              {showFullEnv && (
                <div className="sessionDetailsEnvList">
                  {envVars.map(([key, value]) => (
                    <div key={key} className="sessionDetailsEnvRow">
                      <span className="sessionDetailsEnvKey">{key}:</span>
                      <span className="sessionDetailsEnvValue">
                        {maskValue(key, value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          {showMetadata && metadata.length > 0 && (
            <div className="sessionDetailsGroup">
              <div className="sessionDetailsGroupTitle">Metadata</div>
              <div className="sessionDetailsGrid">
                {metadata.map(([key, value]) => (
                  <div key={key} className="sessionDetailsRow">
                    <span className="sessionDetailsLabel">{key}:</span>
                    <span className="sessionDetailsValue sessionDetailsValue--mono">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mode & Spawn Info */}
          {(session.mode || session.spawnSource || session.spawnedBy) && (
            <div className="sessionDetailsGroup">
              <div className="sessionDetailsGroupTitle">Session origin</div>
              <div className="sessionDetailsGrid">
                {session.mode && (
                  <div className="sessionDetailsRow">
                    <span className="sessionDetailsLabel">Mode:</span>
                    <span className={`sessionDetailsValue sessionDetailsValue--mode-${session.mode}`}>
                      {session.mode}
                    </span>
                  </div>
                )}
                {session.spawnSource && (
                  <div className="sessionDetailsRow">
                    <span className="sessionDetailsLabel">Started from:</span>
                    <span className="sessionDetailsValue">
                      {session.spawnSource}
                    </span>
                  </div>
                )}
                {session.spawnedBy && (
                  <div className="sessionDetailsRow">
                    <span className="sessionDetailsLabel">Started by:</span>
                    <span className="sessionDetailsValue sessionDetailsValue--mono">
                      {session.spawnedBy}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact summary version for inline display
interface SessionDetailsSummaryProps {
  session: MaestroSession;
}

export function SessionDetailsSummary({ session }: SessionDetailsSummaryProps) {
  return (
    <div className="sessionDetailsSummary">
      <span className="sessionDetailsSummaryItem">
        Started {formatTimeAgo(session.startedAt)}
      </span>
      <span className="sessionDetailsSummarySep">•</span>
      <span className="sessionDetailsSummaryItem">{session.platform}</span>
      {session.hostname && (
        <>
          <span className="sessionDetailsSummarySep">•</span>
          <span className="sessionDetailsSummaryItem">{session.hostname}</span>
        </>
      )}
    </div>
  );
}
