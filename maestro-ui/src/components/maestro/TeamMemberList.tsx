import React, { useState, useMemo } from "react";
import { TeamMember, AgentTool } from "../../app/types/maestro";
import { AGENT_TOOL_LABELS } from "../../app/constants/agentTools";
import { AgentLogo } from "./AgentChip";
import { Icon } from "./redesign/kit";
import { useMaestroStore } from "../../stores/useMaestroStore";

type TeamMemberListProps = {
    teamMembers: TeamMember[];
    onEdit: (member: TeamMember) => void;
    onArchive?: (memberId: string) => void | Promise<void>;
    onUnarchive?: (memberId: string) => void | Promise<void>;
    onDelete?: (memberId: string) => void | Promise<void>;
    onNewMember: () => void;
    onRun?: (member: TeamMember) => void | Promise<void>;
};

function getModelDisplayLabel(model?: string, agentTool?: AgentTool): string {
    if (!model) return "";
    const modelLabels: Record<string, string> = {
        haiku: "Haiku",
        sonnet: "Sonnet",
        "sonnet[1m]": "Sonnet [1M]",
        opus: "Opus",
        "claude-fable-5": "Fable 5",
        "claude-fable-5[1m]": "Fable 5 [1M]",
        "claude-opus-4-8": "Opus 4.8",
        "claude-opus-4-8[1m]": "Opus 4.8 [1M]",
        "claude-opus-4-7": "Opus 4.7",
        "claude-opus-4-7[1m]": "Opus 4.7 [1M]",
        "opus[1m]": "Opus [1M]",
        "gpt-5.5": "5.5",
        "gpt-5.4": "5.4",
        "gpt-5.3-codex": "5.3-codex",
        "gpt-5.2-codex": "5.2-codex",
        "hermes-default": "Hermes default",
        "anthropic:claude-fable-5": "Claude Fable 5",
        "anthropic/claude-fable-5": "Claude Fable 5",
        "anthropic:claude-opus-4-8": "Claude Opus 4.8",
        "nous:anthropic/claude-opus-4.8": "Claude Opus 4.8",
        "openrouter:anthropic/claude-opus-4.8": "Claude Opus 4.8",
        "anthropic/claude-opus-4.8": "Claude Opus 4.8",
        "anthropic/claude-sonnet-4.6": "Claude Sonnet 4.6",
        "openai/gpt-5.5": "Codex OAuth GPT 5.5",
        "openai/gpt-5.4": "Codex OAuth GPT 5.4",
        "gpt-5.3-codex-spark": "Codex OAuth GPT 5.3 Codex Spark",
    };
    return modelLabels[model] || model;
}

function TeamMemberRow({
    member,
    isArchived,
    onEdit,
    onArchive,
    onUnarchive,
    onDelete,
    onRun,
    loadingAction,
    setLoadingAction,
}: {
    member: TeamMember;
    isArchived: boolean;
    onEdit: (member: TeamMember) => void;
    onArchive?: (memberId: string) => void | Promise<void>;
    onUnarchive?: (memberId: string) => void | Promise<void>;
    onDelete?: (memberId: string) => void | Promise<void>;
    onRun?: (member: TeamMember) => void | Promise<void>;
    loadingAction: string | null;
    setLoadingAction: (v: string | null) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    const isLoading = (action: string) => loadingAction === `${action}:${member.id}`;

    const handleArchive = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setLoadingAction(`archive:${member.id}`);
        try {
            await onArchive?.(member.id);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setLoadingAction(`delete:${member.id}`);
        try {
            await onDelete?.(member.id);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleUnarchive = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setLoadingAction(`unarchive:${member.id}`);
        try {
            await onUnarchive?.(member.id);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleRun = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setLoadingAction(`run:${member.id}`);
        try {
            await onRun?.(member);
        } finally {
            setLoadingAction(null);
        }
    };

    const modelLabel = member.model
        ? getModelDisplayLabel(member.model, member.agentTool)
        : member.agentTool
            ? AGENT_TOOL_LABELS[member.agentTool]
            : null;

    const profileName = useMaestroStore(s =>
        member.modelProfileId ? s.modelProfiles[member.modelProfileId]?.name : undefined,
    );

    return (
        <div className={'pn-mem' + (isArchived ? ' pn-mem--archived' : '')}>
            {/* Single row: avatar + name/role + badges + chevron */}
            <div className="pn-mem__main" onClick={() => setIsExpanded(!isExpanded)}>
                <span className={'pn-mem__av' + (member.isDefault ? ' pn-mem__av--ring' : '')}>
                    {member.avatar}
                </span>
                <div className="pn-mem__body">
                    <div className="pn-mem__name">{member.name}</div>
                    {member.role && <div className="pn-mem__role">{member.role}</div>}
                </div>

                <div className="pn-mem__badges">
                    {/* Model: profile badge when bound, else agent badge / raw model */}
                    {member.modelProfileId && profileName ? (
                        <span className="pn-mbadge pn-mbadge--profile" title="Bound to a model profile">
                            {'◈'} {profileName}
                        </span>
                    ) : member.agentTool ? (
                        <span className="pn-mbadge pn-mbadge--model">
                            <AgentLogo agentTool={member.agentTool} size={12} /> {modelLabel}
                        </span>
                    ) : modelLabel ? (
                        <span className="pn-mbadge pn-mbadge--model">{modelLabel}</span>
                    ) : null}

                    {/* Global scope indicator */}
                    {member.scope === 'global' && (
                        <span className="pn-mbadge pn-mbadge--global">
                            {'\uD83C\uDF10'} GLOBAL
                        </span>
                    )}

                    {/* Default indicator */}
                    {member.isDefault && (
                        <span className="pn-mbadge pn-mbadge--default">DEFAULT</span>
                    )}
                </div>

                <span className={'pn-mem__chev' + (isExpanded ? ' pn-mem__chev--open' : '')}>
                    <Icon name="chevronD" size={14} />
                </span>
            </div>

            {/* Expanded content - shown on click */}
            {isExpanded && (
                <div className="pn-mem__exp">
                    {/* Role */}
                    {member.role && (
                        <div className="pn-mem__block">
                            <div className="pn-mem__blocklabel">Role</div>
                            <div className="pn-mem__blocktext">{member.role}</div>
                        </div>
                    )}

                    {/* Identity / Instructions */}
                    {member.identity && (
                        <div className="pn-mem__block">
                            <div className="pn-mem__blocklabel">Instructions</div>
                            <div className="pn-mem__blocktext pn-mem__blocktext--mono">{member.identity}</div>
                        </div>
                    )}

                    {/* Skills */}
                    {member.skillIds && member.skillIds.length > 0 && (
                        <div className="pn-mem__block">
                            <div className="pn-mem__blocklabel">Skills</div>
                            <div className="pn-mem__skills">
                                {member.skillIds.map(s => (
                                    <span key={s} className="pn-skill__tag">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions bar */}
                    <div className="pn-mem__actions">
                        {!isArchived && onRun && (
                            <button type="button"
                                className="pn-btn pn-btn--primary"
                                style={{ height: 28 }}
                                onClick={handleRun}
                                disabled={!!loadingAction}
                                title={`Run a session with ${member.name}`}
                            >
                                <Icon name="play" size={12} /> {isLoading('run') ? 'Starting…' : 'Run'}
                            </button>
                        )}

                        <span className="pn-head-spacer" />

                        {!isArchived && (
                            <button type="button"
                                className="pn-btn"
                                style={{ height: 28 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(member);
                                }}
                                title={member.isDefault ? "Configure default member" : "Edit member"}
                            >
                                {member.isDefault ? 'Configure' : 'Edit'}
                            </button>
                        )}

                        {!isArchived && (
                            <button type="button"
                                className="pn-btn pn-btn--ghost"
                                style={{ height: 28 }}
                                onClick={handleArchive}
                                disabled={!!loadingAction}
                            >
                                <Icon name="archiveBox" size={12} /> {isLoading('archive') ? 'Archiving…' : 'Archive'}
                            </button>
                        )}

                        {isArchived && (
                            <>
                                <button type="button"
                                    className="pn-btn"
                                    style={{ height: 28 }}
                                    onClick={handleUnarchive}
                                    disabled={!!loadingAction}
                                >
                                    <Icon name="refresh" size={12} /> {isLoading('unarchive') ? '…' : 'Restore'}
                                </button>
                                <button type="button"
                                    className="pn-btn pn-btn--ghost"
                                    style={{ height: 28, color: 'var(--pn-block)' }}
                                    onClick={handleDelete}
                                    disabled={!!loadingAction}
                                >
                                    <Icon name="trash" size={12} /> {isLoading('delete') ? '…' : 'Delete'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function TeamMemberList({
    teamMembers,
    onEdit,
    onArchive,
    onUnarchive,
    onDelete,
    onNewMember,
    onRun,
}: TeamMemberListProps) {
    const [showArchived, setShowArchived] = useState(false);
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    const { defaultMembers, customMembers, globalMembers, archivedMembers } = useMemo(() => {
        const result: { defaultMembers: TeamMember[]; customMembers: TeamMember[]; globalMembers: TeamMember[]; archivedMembers: TeamMember[] } = {
            defaultMembers: [], customMembers: [], globalMembers: [], archivedMembers: [],
        };
        for (const m of teamMembers) {
            if (m.status === 'archived') result.archivedMembers.push(m);
            else if (m.scope === 'global' && m.status === 'active') result.globalMembers.push(m);
            else if (m.status === 'active' && m.isDefault) result.defaultMembers.push(m);
            else if (m.status === 'active') result.customMembers.push(m);
        }
        return result;
    }, [teamMembers]);
    const activeMembers = defaultMembers.length + customMembers.length + globalMembers.length > 0 ? [...defaultMembers, ...customMembers, ...globalMembers] : [];

    const renderMemberRow = (member: TeamMember, options?: { isArchived?: boolean }) => (
        <TeamMemberRow
            key={member.id}
            member={member}
            isArchived={options?.isArchived ?? false}
            onEdit={onEdit}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onDelete={onDelete}
            onRun={onRun}
            loadingAction={loadingAction}
            setLoadingAction={setLoadingAction}
        />
    );

    return (
        <div>
            {/* Default members section */}
            {defaultMembers.length > 0 && (
                <div>
                    {defaultMembers.map(member => renderMemberRow(member))}
                </div>
            )}

            {/* Custom members section */}
            {customMembers.length > 0 && (
                <div>
                    {customMembers.map(member => renderMemberRow(member))}
                </div>
            )}

            {/* Global members section */}
            {globalMembers.length > 0 && (
                <div>
                    <div className="pn-vsec">
                        <span className="pn-eyebrow">
                            <Icon name="globe" size={11} style={{ verticalAlign: '-1px', marginRight: 5 }} />
                            Global Members
                        </span>
                        <span className="pn-line" />
                    </div>
                    <div>
                        {globalMembers.map(member => renderMemberRow(member))}
                    </div>
                </div>
            )}

            {/* Archived section - collapsible */}
            {archivedMembers.length > 0 && (
                <div>
                    <button type="button"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '13px 15px 6px',
                            background: 'transparent',
                            border: 'none',
                            borderTop: '1px solid var(--pn-line)',
                            cursor: 'pointer',
                        }}
                        onClick={() => setShowArchived(!showArchived)}
                    >
                        <span className="pn-eyebrow">
                            <Icon name="archive" size={11} style={{ verticalAlign: '-1px', marginRight: 5 }} />
                            Archived \u00B7 {archivedMembers.length}
                        </span>
                        <Icon name="chevronD" size={13} style={{ color: 'var(--pn-ink-4)', transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 140ms' }} />
                    </button>
                    {showArchived && (
                        <div>
                            {archivedMembers.map(member => renderMemberRow(member, { isArchived: true }))}
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {activeMembers.length === 0 && (
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--pn-ink-2)' }}>NO TEAM MEMBERS</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--pn-ink-4)', fontFamily: 'var(--pn-mono)' }}>$ create your first team member</p>
                </div>
            )}
        </div>
    );
}
