import React, { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Team } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { Icon } from "./redesign/kit";
import { copyToClipboardOrWarn } from "../../utils/domUtils";

type TeamTab = 'members' | 'subteams' | 'details';

type TeamListItemProps = {
    team: Team;
    depth?: number;
    onEdit: (team: Team) => void;
    onRun: (team: Team) => void;
    allTeams: Team[];
};

function formatDate(timestamp: string): string {
    return new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatTimeAgo(timestamp: string): string {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function TeamListItem({
    team,
    depth = 0,
    onEdit,
    onRun,
    allTeams,
}: TeamListItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<TeamTab>('members');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [childrenCollapsed, setChildrenCollapsed] = useState(true);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const teamMembersMap = useMaestroStore(s => s.teamMembers);
    const archiveTeam = useMaestroStore(s => s.archiveTeam);
    const unarchiveTeam = useMaestroStore(s => s.unarchiveTeam);
    const deleteTeam = useMaestroStore(s => s.deleteTeam);

    const leader = teamMembersMap[team.leaderId];
    const members = useMemo(() =>
        team.memberIds.map(id => teamMembersMap[id]).filter(Boolean),
        [team.memberIds, teamMembersMap]
    );
    const subTeams = useMemo(() =>
        allTeams.filter(t => team.subTeamIds.includes(t.id)),
        [allTeams, team.subTeamIds]
    );
    const isArchived = team.status === 'archived';
    const hasSubTeams = subTeams.length > 0;

    const handleArchiveToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            if (isArchived) {
                await unarchiveTeam(team.id, team.projectId);
            } else {
                await archiveTeam(team.id, team.projectId);
            }
        } catch {}
    };

    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteTeam(team.id, team.projectId);
            setShowDeleteConfirm(false);
        } catch {} finally {
            setIsDeleting(false);
        }
    };

    const handleCopyField = useCallback((label: string, value: string) => {
        void copyToClipboardOrWarn(value, label).then((ok) => {
            if (!ok) return;
            setCopiedField(label);
            setTimeout(() => setCopiedField(null), 1500);
        });
    }, []);

    const handleSubTeamToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setChildrenCollapsed(!childrenCollapsed);
    };

    return (
        <>
            <div
                className={'pn-mem' + (isArchived ? ' pn-mem--archived' : '')}
                style={depth > 0 ? { marginLeft: `${depth * 16}px` } : undefined}
            >
                <div className="pn-mem__main" onClick={() => setIsExpanded(!isExpanded)}>
                    <span className="pn-mem__av">{team.avatar || '\u{1F46A}'}</span>
                    <div className="pn-mem__body">
                        <div className="pn-mem__name" title={team.name} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{team.name}</div>
                        {leader && (
                            <div className="pn-mem__role">{leader.avatar} {leader.name}</div>
                        )}
                    </div>

                    <div className="pn-mem__badges">
                        {hasSubTeams && (
                            <button type="button"
                                onClick={handleSubTeamToggle}
                                title={childrenCollapsed ? `Expand ${subTeams.length} sub-team${subTeams.length !== 1 ? 's' : ''}` : `Collapse sub-teams`}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    height: 21, padding: '0 6px',
                                    background: 'transparent', border: '1px solid var(--pn-line-2)',
                                    borderRadius: 'var(--pn-r-xs)',
                                    color: 'var(--pn-ink-3)',
                                    cursor: 'pointer',
                                }}
                            >
                                <Icon name="gitBranch" size={11} />
                                <span style={{ fontFamily: 'var(--pn-mono)', fontSize: 9.5, fontWeight: 700 }}>{subTeams.length}</span>
                            </button>
                        )}

                        <span className={'pn-mbadge' + (isArchived ? '' : ' pn-mbadge--default')}>
                            {isArchived ? 'ARCHIVED' : 'ACTIVE'}
                        </span>

                        <span className="pn-mbadge">
                            {team.memberIds.length} {team.memberIds.length === 1 ? 'MEMBER' : 'MEMBERS'}
                        </span>

                        <span style={{ fontFamily: 'var(--pn-mono)', fontSize: 10, color: 'var(--pn-ink-4)', whiteSpace: 'nowrap' }}>
                            {formatTimeAgo(team.updatedAt)}
                        </span>
                    </div>

                    <span className={'pn-mem__chev' + (isExpanded ? ' pn-mem__chev--open' : '')}>
                        <Icon name="chevronD" size={14} />
                    </span>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <div className="pn-mem__exp">
                        {/* Tab Navigation */}
                        <div onClick={(e) => e.stopPropagation()}>
                            <div className="pn-vtoggle">
                                <button type="button"
                                    className={activeTab === 'members' ? 'on' : ''}
                                    onClick={() => setActiveTab('members')}
                                >
                                    Members <span className="n">{members.length}</span>
                                </button>
                                <button type="button"
                                    className={activeTab === 'subteams' ? 'on' : ''}
                                    onClick={() => setActiveTab('subteams')}
                                >
                                    Sub-Teams <span className="n">{subTeams.length}</span>
                                </button>
                                <button type="button"
                                    className={activeTab === 'details' ? 'on' : ''}
                                    onClick={() => setActiveTab('details')}
                                >
                                    Details
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div onClick={(e) => e.stopPropagation()}>
                            {/* Members Tab */}
                            {activeTab === 'members' && (
                                <>
                                    {members.length === 0 ? (
                                        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--pn-ink-4)' }}>No members in this team</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {members.map(member => {
                                                if (!member) return null;
                                                const isLeader = member.id === team.leaderId;
                                                return (
                                                    <div
                                                        key={member.id}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                                                    >
                                                        <span style={{ fontSize: 14, flex: '0 0 auto' }}>{member.avatar}</span>
                                                        <span style={{
                                                            fontSize: 12.5,
                                                            fontWeight: isLeader ? 700 : 500,
                                                            color: 'var(--pn-ink-2)',
                                                        }}>
                                                            {member.name}
                                                        </span>
                                                        {member.role && (
                                                            <span className="pn-mbadge">{member.role}</span>
                                                        )}
                                                        {member.mode && (
                                                            <span className="pn-mbadge">{member.mode}</span>
                                                        )}
                                                        {isLeader && (
                                                            <span className="pn-mbadge pn-mbadge--profile">★ Leader</span>
                                                        )}
                                                        {member.agentTool && (
                                                            <span className="pn-mbadge">{member.agentTool}</span>
                                                        )}
                                                        {member.model && (
                                                            <span className="pn-mbadge pn-mbadge--model">{member.model}</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Sub-Teams Tab */}
                            {activeTab === 'subteams' && (
                                <>
                                    {subTeams.length === 0 ? (
                                        <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--pn-ink-4)' }}>No sub-teams</div>
                                    ) : (
                                        <div>
                                            {subTeams.map(subTeam => (
                                                <TeamListItem
                                                    key={subTeam.id}
                                                    team={subTeam}
                                                    depth={depth + 1}
                                                    onEdit={onEdit}
                                                    onRun={onRun}
                                                    allTeams={allTeams}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Details Tab */}
                            {activeTab === 'details' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                                    {team.description && (
                                        <div className="pn-mem__block">
                                            <div className="pn-mem__blocklabel">Description</div>
                                            <div className="pn-mem__blocktext">{team.description}</div>
                                        </div>
                                    )}
                                    <div className="pn-mem__block">
                                        <div className="pn-mem__blocklabel">Created</div>
                                        <div className="pn-mem__blocktext">{formatDate(team.createdAt)}</div>
                                    </div>
                                    <div className="pn-mem__block">
                                        <div className="pn-mem__blocklabel">Updated</div>
                                        <div className="pn-mem__blocktext">{formatDate(team.updatedAt)}</div>
                                    </div>
                                    <div className="pn-mem__block">
                                        <div className="pn-mem__blocklabel">Team ID</div>
                                        <div className="pn-mem__blocktext pn-mem__blocktext--mono" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.id}</code>
                                            <button type="button"
                                                className="pn-btn pn-btn--ghost"
                                                style={{ height: 22, padding: '0 7px', fontSize: 10 }}
                                                onClick={() => handleCopyField('id', team.id)}
                                            >
                                                <Icon name="copy" size={10} /> {copiedField === 'id' ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                    </div>
                                    {team.parentTeamId && (
                                        <div className="pn-mem__block">
                                            <div className="pn-mem__blocklabel">Parent Team</div>
                                            <div className="pn-mem__blocktext">{allTeams.find(t => t.id === team.parentTeamId)?.name || team.parentTeamId}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Actions Bar at Bottom */}
                        <div className="pn-mem__actions">
                            {!isArchived && (
                                <button type="button"
                                    className="pn-btn pn-btn--primary"
                                    style={{ height: 28 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRun(team);
                                    }}
                                    title="Run team (spawn coordinator session)"
                                >
                                    <Icon name="play" size={12} /> Run
                                </button>
                            )}

                            <span className="pn-head-spacer" />

                            <button type="button"
                                className="pn-btn"
                                style={{ height: 28 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(team);
                                }}
                                title="Edit team"
                            >
                                <Icon name="pen" size={12} /> Edit
                            </button>
                            <button type="button"
                                className="pn-btn pn-btn--ghost"
                                style={{ height: 28 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyField('id', team.id);
                                }}
                                title="Copy team ID"
                            >
                                <Icon name="copy" size={12} /> {copiedField === 'id' ? 'Copied!' : 'Copy ID'}
                            </button>
                            <button type="button"
                                className="pn-btn pn-btn--ghost"
                                style={{ height: 28 }}
                                onClick={handleArchiveToggle}
                                title={isArchived ? "Unarchive team" : "Archive team"}
                            >
                                {isArchived
                                    ? <><Icon name="refresh" size={12} /> Unarchive</>
                                    : <><Icon name="archiveBox" size={12} /> Archive</>}
                            </button>
                            {isArchived && (
                                <button type="button"
                                    className="pn-btn pn-btn--ghost"
                                    style={{ height: 28, color: 'var(--pn-block)' }}
                                    onClick={handleDeleteClick}
                                    title="Permanently delete team"
                                >
                                    <Icon name="trash" size={12} /> Delete Team
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Nested sub-teams (when expanded via the tree button, outside the row) */}
            {hasSubTeams && !childrenCollapsed && (
                <div>
                    {subTeams.map(subTeam => (
                        <TeamListItem
                            key={subTeam.id}
                            team={subTeam}
                            depth={depth + 1}
                            onEdit={onEdit}
                            onRun={onRun}
                            allTeams={allTeams}
                        />
                    ))}
                </div>
            )}

            {showDeleteConfirm && createPortal(
                <ConfirmActionModal
                    isOpen={showDeleteConfirm}
                    title="[ DELETE TEAM ]"
                    message={<>Are you sure you want to delete <strong>"{team.name}"</strong>?</>}
                    confirmLabel="Delete"
                    cancelLabel="Cancel"
                    confirmDanger
                    busy={isDeleting}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={confirmDelete}
                />,
                document.body
            )}
        </>
    );
}
