import React from "react";
import type { ActorRef, EntityKind, EntityRef, EntityState, EntitySummary, WorkStatus } from "./types";

const ICONS: Record<EntityKind | "graph" | "home", string> = {
    channel: "#", task: "✓", doc: "▤", file: "⌁", message: "◌", member: "○", team_member: "◇", spell: "✦", skill: "✧", pull_request: "⌘", commit: "•", graph: "⌘", home: "⌂",
};

const KIND_LABELS: Record<EntityKind, string> = {
    channel: "Channel", task: "Task", doc: "Document", file: "File", message: "Message", member: "Member", team_member: "Agent", spell: "Spell", skill: "Skill", pull_request: "Pull request", commit: "Commit",
};

export function EntityGlyph({ kind, className = "" }: { kind: EntityKind | "graph" | "home"; className?: string }) {
    return <span className={`collabGlyph collabGlyph--${kind} ${className}`} aria-hidden="true">{ICONS[kind]}</span>;
}

export function entityKindLabel(kind: EntityKind): string {
    return KIND_LABELS[kind];
}

export function ActorAvatar({ actor, small = false }: { actor: ActorRef; small?: boolean }) {
    return <span className={`collabAvatar ${small ? "collabAvatar--small" : ""} ${actor.kind === "team_member" ? "collabAvatar--agent" : ""}`} style={{ "--avatar-color": actor.color ?? "#778" } as React.CSSProperties} title={`${actor.displayName}${actor.kind === "team_member" ? " (agent)" : ""}`}>{actor.initials ?? actor.displayName.slice(0, 2).toUpperCase()}</span>;
}

export function entityWorkStatus(entity: Pick<EntitySummary, "state" | "badges">): WorkStatus | undefined {
    return entity.state.kind === "task" ? entity.state.workStatus : undefined;
}

export function entityAssignees(entity: Pick<EntitySummary, "state">): ActorRef[] {
    return entity.state.kind === "task" ? entity.state.assignees : [];
}

export function entityIsStale(entity: Pick<EntitySummary, "badges">): boolean {
    return entity.badges.pulls?.some((pull) => pull.contentStale) ?? false;
}

export function WorkStatusPill({ status }: { status?: WorkStatus }) {
    if (!status) return null;
    const labels: Record<WorkStatus, string> = { open: "Open", pulled: "Pulled", working: "Working", in_review: "In review", done: "Done", blocked: "Blocked", cancelled: "Cancelled" };
    return <span className={`collabStatus collabStatus--${status}`}><span aria-hidden="true">●</span> {labels[status]}</span>;
}

type SummaryField = { label: string; value: React.ReactNode; tone?: "danger" | "accent" | "success" };

/** The one adapter from an entity discriminator to its 2–4 Z2 summary fields. */
export function entitySummaryFields(entity: Pick<EntitySummary, "kind" | "state" | "badges" | "excerpt">): SummaryField[] {
    const state = entity.state;
    switch (state.kind) {
        case "channel": return [
            { label: "Topic", value: state.topic || entity.excerpt || "No topic" },
            { label: "Unread", value: state.unreadCount ? `${state.unreadCount} unread` : "Caught up", tone: state.unreadCount ? "accent" : undefined },
            { label: "Live", value: state.workingAgentCount ? `${state.workingAgentCount} agents working` : "No agents working", tone: state.workingAgentCount ? "success" : undefined },
        ];
        case "task": return [
            { label: "Status", value: <WorkStatusPill status={state.workStatus} /> },
            { label: "Priority", value: state.priority },
            { label: "Progress", value: `${state.acceptance.completed}/${state.acceptance.total} criteria` },
            ...(entity.badges.blocked ? [{ label: "Blocked", value: `Waiting on ${entity.badges.blocked.unresolvedHardDependencyCount}`, tone: "danger" as const }] : []),
        ];
        case "doc": return [{ label: "Format", value: state.format }, { label: "Structure", value: `${state.childCount} ${state.childCount === 1 ? "child" : "children"}` }, ...(entity.excerpt ? [{ label: "Preview", value: entity.excerpt }] : [])];
        case "file": return [{ label: "Type", value: state.mimeType }, { label: "Size", value: formatBytes(state.sizeBytes) }, { label: "Name", value: state.name }];
        case "message": return [{ label: "Author", value: state.author.displayName }, ...(entity.excerpt ? [{ label: "Message", value: entity.excerpt }] : []), ...(state.editedAt ? [{ label: "Edited", value: "Edited" }] : [])];
        case "member": return [{ label: "Role", value: state.role }, { label: "Score", value: `${state.score} pts` }, { label: "Completed", value: `${state.taskDoneCount} tasks` }];
        case "team_member": return [
            { label: "Owner", value: state.owner.displayName },
            ...(state.model ? [{ label: "Model", value: state.model }] : []),
            ...(state.agentTool ? [{ label: "Tool", value: state.agentTool }] : []),
            ...(state.liveWork ? [{ label: "Working", value: state.liveWork.task.title, tone: "success" as const }] : []),
        ];
        case "spell":
        case "skill": return [
            ...(state.description ? [{ label: "About", value: state.description }] : []),
            { label: "Status", value: state.equipped ? "Equipped" : "Available", tone: state.equipped ? "success" : undefined },
        ];
        case "pull_request": return [{ label: "Repository", value: state.repository }, { label: "PR", value: `#${state.number}` }, { label: "State", value: state.state }, ...(state.stale ? [{ label: "Freshness", value: "Refresh needed", tone: "danger" as const }] : [])];
        case "commit": return [{ label: "Repository", value: state.repository }, { label: "SHA", value: state.sha.slice(0, 8) }, { label: "Message", value: state.message }];
    }
}

export function entityStateLabel(state: EntityState): string | undefined {
    switch (state.kind) {
        case "task": return state.workStatus;
        case "channel": return state.unreadCount ? `${state.unreadCount} unread` : undefined;
        case "doc": return state.format;
        case "member": return state.role;
        case "team_member": return state.liveWork ? "working" : undefined;
        case "pull_request": return state.state;
        case "file": return state.mimeType;
        case "spell":
        case "skill": return state.equipped ? "equipped" : undefined;
        case "commit": return state.sha.slice(0, 7);
        case "message": return state.editedAt ? "edited" : undefined;
    }
}

export function EntityChip({ entity, onOpen, compact = false }: { entity: EntityRef; onOpen?: (id: string) => void; compact?: boolean }) {
    const stale = entity.badges ? entityIsStale({ badges: entity.badges }) : false;
    const stateLabel = entity.state ? entityStateLabel(entity.state) : undefined;
    const content = <><EntityGlyph kind={entity.kind} /><span className="collabChipLabel">{entity.title}</span>{stateLabel && <span className="collabChipState">{stateLabel}</span>}{stale && <span className="collabChipStale">stale</span>}</>;
    return onOpen ? <button type="button" className={`collabChip collabChip--${entity.kind} ${compact ? "collabChip--compact" : ""}`} onClick={() => onOpen(entity.id)} aria-label={`Open ${entityKindLabel(entity.kind)} ${entity.title}`}>{content}</button> : <span className={`collabChip collabChip--${entity.kind} ${compact ? "collabChip--compact" : ""}`}>{content}</span>;
}

export function ReactionBar({ entity, dense = false, onReact, onGrantPoints, disabled = false }: { entity: Pick<EntitySummary, "counters">; dense?: boolean; onReact?: (type: "likes" | "stars", active: boolean) => void; onGrantPoints?: () => void; disabled?: boolean }) {
    return <div className={`collabReactions ${dense ? "collabReactions--dense" : ""}`} aria-label="Entity reactions and points">
        <button type="button" className="collabReaction" aria-label={`${entity.counters.likes} likes`} disabled={disabled || !onReact} onClick={() => onReact?.("likes", entity.counters.viewerReaction !== "like")}>↑ {entity.counters.likes}</button>
        <button type="button" className="collabReaction" aria-label={`${entity.counters.stars} stars`} disabled={disabled || !onReact} onClick={() => onReact?.("stars", entity.counters.viewerReaction !== "star")}>☆ {entity.counters.stars}</button>
        <button type="button" className="collabReaction" aria-label={`${entity.counters.points} points`} disabled={disabled || !onGrantPoints} onClick={onGrantPoints}>◈ {entity.counters.points}</button>
        <span className="collabReaction collabReaction--static" aria-label={`${entity.counters.messages} messages`}>◌ {entity.counters.messages}</span>
    </div>;
}

export function EntityCard({ entity, onOpen, selected = false }: { entity: EntitySummary; onOpen: (id: string) => void; selected?: boolean }) {
    const stale = entityIsStale(entity);
    const status = entityWorkStatus(entity);
    const assignees = entityAssignees(entity);
    const fields = entitySummaryFields(entity);
    const teamOwner = entity.state.kind === "team_member" ? entity.state.owner : undefined;
    return <article className={`collabEntityCard collabEntityCard--${entity.kind} ${selected ? "collabEntityCard--selected" : ""}`}>
        <button type="button" className="collabEntityCardMain" onClick={() => onOpen(entity.id)} aria-label={`Open ${entityKindLabel(entity.kind)} ${entity.title}`}>
            <span className="collabEntityCardMeta"><EntityGlyph kind={entity.kind} /><span>{entityKindLabel(entity.kind)}</span>{stale && <span className="collabStaleBadge">v{entity.version} → stale</span>}<span className="collabEntityCardVersion">v{entity.version}</span></span>
            <span className="collabEntityCardTitle">{entity.title}</span>
            {entity.excerpt && <span className="collabEntityCardExcerpt">{entity.excerpt}</span>}
            <span className="collabEntityCardFacts">{fields.slice(0, 4).map((field) => <span className={`collabEntityCardFact ${field.tone ? `is-${field.tone}` : ""}`} key={field.label}><small>{field.label}</small><span>{field.value}</span></span>)}</span>
        </button>
        <div className="collabEntityCardFooter">
            <div className="collabEntityCardPeople">{assignees.map((actor) => <ActorAvatar key={actor.id} actor={actor} small />)}{teamOwner && <ActorAvatar actor={{ ...teamOwner, id: `${entity.id}-owner` }} small />}{status && <WorkStatusPill status={status} />}</div>
            <ReactionBar entity={entity} dense />
        </div>
    </article>;
}

function formatBytes(sizeBytes: number): string {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
