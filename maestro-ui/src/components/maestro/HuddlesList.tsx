import React, { useState } from "react";
import type { Huddle, HuddleSessionMember } from "../../app/types/maestro";
import { useProjectStore } from "../../stores/useProjectStore";
import { PromptList } from "./PromptList";
import { StatIcon } from "./SessionStatsIcons";

const AGENT_HUES = [
  "#ff6b6b", "#ffa94d", "#ffd43b", "#a9e34b", "#69db7c",
  "#38d9a9", "#3bc9db", "#74c0fc", "#748ffc", "#9775fa",
  "#da77f2", "#f783ac",
];

function hueFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AGENT_HUES[h % AGENT_HUES.length];
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function formatTimeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function memberDisplayName(m: HuddleSessionMember): string {
  return m.teamMember?.name ?? m.sessionName ?? m.sessionId.slice(0, 10);
}

export interface HuddleMemberChipProps {
  member: HuddleSessionMember;
  projectName?: string | null;
  onSessionClick?: (sessionId: string) => void;
}

function HuddleMemberChip({ member, projectName, onSessionClick }: HuddleMemberChipProps) {
  const name = memberDisplayName(member);
  const avatarRaw = member.teamMember?.avatar?.trim();
  const avatar = avatarRaw && (avatarRaw.length === 1 || avatarRaw.length === 2)
    ? avatarRaw
    : initialsOf(name);
  const clickable = Boolean(onSessionClick);
  return (
    <button
      type="button"
      className="ssv-huddle-member"
      onClick={clickable ? () => onSessionClick?.(member.sessionId) : undefined}
      disabled={!clickable}
      title={`Session ${member.sessionId}${projectName ? ` · ${projectName}` : ""}`}
    >
      <span
        className="ssv-huddle-member-av"
        style={{ background: hueFor(name) }}
      >
        {avatar}
      </span>
      <span className="ssv-huddle-member-text">
        <span className="ssv-huddle-member-name">{name}</span>
        {projectName && (
          <span className="ssv-huddle-member-proj">{projectName}</span>
        )}
      </span>
    </button>
  );
}

export interface HuddleCardProps {
  huddle: Huddle;
  defaultExpanded?: boolean;
  onSessionClick?: (sessionId: string) => void;
}

export function HuddleCard({ huddle, defaultExpanded = false, onSessionClick }: HuddleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const projects = useProjectStore((s) => s.projects);

  const projectNameFor = (projectId: string | null): string | null => {
    if (!projectId) return null;
    const p = projects.find((proj) => proj.id === projectId);
    return p?.name ?? null;
  };

  const memberCount = huddle.sessions.length;

  return (
    <div className={`ssv-huddle-card${expanded ? " ssv-huddle-card--open" : ""}`}>
      <button
        type="button"
        className="ssv-huddle-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <StatIcon name="chevron-right" size={11} className={`ssv-chev${expanded ? " open" : ""}`} />
        <div className="ssv-huddle-avs" aria-hidden="true">
          {huddle.sessions.slice(0, 4).map((m, i) => {
            const name = memberDisplayName(m);
            const avatarRaw = m.teamMember?.avatar?.trim();
            const avatar = avatarRaw && (avatarRaw.length === 1 || avatarRaw.length === 2)
              ? avatarRaw
              : initialsOf(name);
            return (
              <span
                key={m.sessionId}
                className="ssv-huddle-av"
                style={{ background: hueFor(name), zIndex: 10 - i }}
                title={name}
              >
                {avatar}
              </span>
            );
          })}
          {memberCount > 4 && (
            <span className="ssv-huddle-av ssv-huddle-av--more" title={`+${memberCount - 4} more`}>
              +{memberCount - 4}
            </span>
          )}
        </div>
        <div className="ssv-huddle-head-meta">
          <span className="ssv-huddle-head-count">
            {memberCount} session{memberCount === 1 ? "" : "s"}
          </span>
          <span className="ssv-huddle-head-sep">·</span>
          <span className="ssv-huddle-head-count">
            {huddle.promptCount} prompt{huddle.promptCount === 1 ? "" : "s"}
          </span>
        </div>
        <span className="ssv-huddle-head-when">{formatTimeAgo(huddle.lastActivity)}</span>
      </button>

      {expanded && (
        <div className="ssv-huddle-body">
          <div className="ssv-huddle-members">
            {huddle.sessions.map((m) => (
              <HuddleMemberChip
                key={m.sessionId}
                member={m}
                projectName={projectNameFor(m.projectId)}
                onSessionClick={onSessionClick}
              />
            ))}
          </div>
          <PromptList
            prompts={huddle.prompts}
            members={huddle.sessions}
            onSessionClick={onSessionClick}
            emptyLabel="No prompts in this huddle yet."
          />
        </div>
      )}
    </div>
  );
}

export interface HuddlesListProps {
  huddles: Huddle[];
  loading?: boolean;
  error?: string | null;
  onSessionClick?: (sessionId: string) => void;
}

export function HuddlesList({ huddles, loading, error, onSessionClick }: HuddlesListProps) {
  if (loading && huddles.length === 0) {
    return (
      <div className="sessionEmptyState">
        <span className="sessionEmptyState__icon" aria-hidden="true" style={{ color: 'var(--pn-ink-4)' }}>⟳</span>
        <span className="sessionEmptyState__title" style={{ color: 'var(--pn-ink)' }}>Loading huddles…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="sessionEmptyState">
        <span className="sessionEmptyState__icon" aria-hidden="true" style={{ color: 'var(--pn-ink-4)' }}>⚠</span>
        <span className="sessionEmptyState__title" style={{ color: 'var(--pn-ink)' }}>Couldn't load huddles</span>
        <span className="sessionEmptyState__hint" style={{ color: 'var(--pn-ink-3)' }}>{error}</span>
      </div>
    );
  }
  if (huddles.length === 0) {
    return (
      <div className="sessionEmptyState">
        <span className="sessionEmptyState__icon" aria-hidden="true" style={{ color: 'var(--pn-ink-4)' }}>◇</span>
        <span className="sessionEmptyState__title" style={{ color: 'var(--pn-ink)' }}>No huddles yet</span>
        <span className="sessionEmptyState__hint" style={{ color: 'var(--pn-ink-3)' }}>
          When sessions exchange prompts across projects, the connected groups show up here.
        </span>
      </div>
    );
  }
  return (
    <div className="ssv-huddle-list">
      {huddles.map((h, idx) => (
        <HuddleCard
          key={h.id}
          huddle={h}
          defaultExpanded={idx === 0}
          onSessionClick={onSessionClick}
        />
      ))}
    </div>
  );
}
