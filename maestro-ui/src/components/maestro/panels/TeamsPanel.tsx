import React, { useState } from "react";
import { TeamListItem } from "../TeamListItem";
import { TeamModal } from "../TeamModal";
import { TeamOrgChart } from "../TeamOrgChart";
import { Icon } from "../redesign/kit";

type TeamsPanelProps = {
    projectId: string;
    teams: any[];
    topLevelTeams: any[];
    onEdit: (team: any) => void;
    onRun: (team: any) => void;
};

export function TeamsPanel({
    projectId,
    teams,
    topLevelTeams,
    onEdit,
    onRun,
}: TeamsPanelProps) {
    const [showModal, setShowModal] = useState(false);
    const [editingTeam, setEditingTeam] = useState<any | null>(null);
    const [view, setView] = useState<'list' | 'chart'>('list');

    const handleEdit = (team: any) => {
        setEditingTeam(team);
        setShowModal(true);
        onEdit(team);
    };

    const handleNewTeam = () => {
        setEditingTeam(null);
        setShowModal(true);
    };

    return (
        <>
            <div className="pn-vscroll">
                {topLevelTeams.length === 0 ? (
                    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--pn-ink-2)' }}>NO TEAMS YET</p>
                        <p style={{ margin: '4px 0 14px', fontSize: 12, color: 'var(--pn-ink-4)', fontFamily: 'var(--pn-mono)' }}>$ create teams to group your team members</p>
                        <button type="button"
                            className="pn-btn pn-btn--primary"
                            style={{ height: 30 }}
                            onClick={handleNewTeam}
                        >
                            <Icon name="plus" size={14} /> Create Team
                        </button>
                    </div>
                ) : (
                    <>
                        <div style={{ padding: '11px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div className="pn-seg" role="tablist" aria-label="Teams view">
                                <button type="button"
                                    className={`pn-seg__btn ${view === 'list' ? 'pn-seg__btn--on' : ''}`}
                                    onClick={() => setView('list')}
                                    title="List view"
                                >
                                    <Icon name="layers" size={12} /> List
                                </button>
                                <button type="button"
                                    className={`pn-seg__btn ${view === 'chart' ? 'pn-seg__btn--on' : ''}`}
                                    onClick={() => setView('chart')}
                                    title="Org chart"
                                >
                                    <Icon name="gitBranch" size={12} /> Org chart
                                </button>
                            </div>
                            <button type="button"
                                className="pn-btn pn-btn--primary"
                                style={{ height: 28 }}
                                onClick={handleNewTeam}
                            >
                                <Icon name="plus" size={12} /> Create Team
                            </button>
                        </div>
                        {view === 'list' ? (
                            <div>
                                {topLevelTeams.map(team => (
                                    <TeamListItem
                                        key={team.id}
                                        team={team}
                                        depth={0}
                                        onEdit={handleEdit}
                                        onRun={onRun}
                                        allTeams={teams}
                                    />
                                ))}
                            </div>
                        ) : (
                            <TeamOrgChart projectId={projectId} teams={teams} />
                        )}
                    </>
                )}
            </div>

            <TeamModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setEditingTeam(null);
                }}
                team={editingTeam}
                projectId={projectId}
            />
        </>
    );
}
