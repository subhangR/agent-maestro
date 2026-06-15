import React, { useMemo } from "react";
import { Team, TeamMember } from "../../../app/types/maestro";
import { TeamMemberSelector } from "./TeamMemberSelector";
import "./team-task-picker.css";

export interface TeamTaskPickerProps {
    /** Active teams for the project. */
    teams: Team[];
    /** Active team members for the project. */
    teamMembers: TeamMember[];
    /** Currently assigned team id, or null when none. */
    selectedTeamId: string | null;
    /** Currently assigned individual team member ids. */
    selectedTeamMemberIds: string[];
    /** Selecting a team (null clears the team assignment). */
    onTeamChange: (teamId: string | null) => void;
    /** Member multi-select passthrough. */
    onMembersChange: (ids: string[]) => void;
    /** Optional loading flag for the team/member lists. */
    isLoading?: boolean;
}

type PickerMode = "team" | "member";

/** A team plus its computed nesting depth, flattened for rendering. */
interface FlatTeam {
    team: Team;
    depth: number;
}

/**
 * Flatten teams into a depth-annotated list: root teams (no parentTeamId, or a
 * parent not present in the list) appear at depth 0, with their sub-teams nested
 * beneath. Guards against cycles via a visited set.
 */
function flattenTeams(teams: Team[]): FlatTeam[] {
    const byId = new Map(teams.map(t => [t.id, t]));
    const childrenOf = new Map<string, Team[]>();
    const roots: Team[] = [];

    for (const team of teams) {
        const parentId = team.parentTeamId;
        if (parentId && byId.has(parentId)) {
            const siblings = childrenOf.get(parentId) ?? [];
            siblings.push(team);
            childrenOf.set(parentId, siblings);
        } else {
            roots.push(team);
        }
    }

    const out: FlatTeam[] = [];
    const visited = new Set<string>();
    const walk = (team: Team, depth: number) => {
        if (visited.has(team.id)) return;
        visited.add(team.id);
        out.push({ team, depth });
        // Prefer explicit subTeamIds ordering, fall back to inferred children.
        const ordered = team.subTeamIds
            .map(id => byId.get(id))
            .filter((t): t is Team => Boolean(t));
        const seen = new Set(ordered.map(t => t.id));
        const inferred = (childrenOf.get(team.id) ?? []).filter(t => !seen.has(t.id));
        for (const child of [...ordered, ...inferred]) walk(child, depth + 1);
    };
    for (const root of roots) walk(root, 0);
    // Append any teams unreachable from a root (e.g. orphaned cycle members).
    for (const team of teams) if (!visited.has(team.id)) walk(team, 0);
    return out;
}

export function TeamTaskPicker({
    teams,
    teamMembers,
    selectedTeamId,
    selectedTeamMemberIds,
    onTeamChange,
    onMembersChange,
    isLoading = false,
}: TeamTaskPickerProps) {
    const [mode, setMode] = React.useState<PickerMode>(
        selectedTeamId ? "team" : "member"
    );

    const flatTeams = useMemo(() => flattenTeams(teams), [teams]);

    const membersById = useMemo(
        () => new Map(teamMembers.map(m => [m.id, m])),
        [teamMembers]
    );

    const selectedTeam = useMemo(
        () => (selectedTeamId ? teams.find(t => t.id === selectedTeamId) ?? null : null),
        [teams, selectedTeamId]
    );

    const previewMembers = useMemo(() => {
        if (!selectedTeam) return [] as TeamMember[];
        return selectedTeam.memberIds
            .map(id => membersById.get(id))
            .filter((m): m is TeamMember => Boolean(m));
    }, [selectedTeam, membersById]);

    const switchMode = (next: PickerMode) => {
        if (next === mode) return;
        setMode(next);
        if (next === "member") {
            // Member mode is mutually exclusive with a team assignment.
            onTeamChange(null);
        }
    };

    const handleSelectTeam = (teamId: string) => {
        if (teamId === selectedTeamId) {
            onTeamChange(null);
            return;
        }
        // Assigning a team clears any individual member assignment.
        onTeamChange(teamId);
        if (selectedTeamMemberIds.length > 0) onMembersChange([]);
    };

    return (
        <div className="ttp">
            <div className="ttp__head">
                <span className="ttp__label">Assignee</span>
                <div className="ttp__seg" role="tablist" aria-label="Assignee type">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "team"}
                        className={mode === "team" ? "on" : ""}
                        onClick={() => switchMode("team")}
                    >
                        Team
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mode === "member"}
                        className={mode === "member" ? "on" : ""}
                        onClick={() => switchMode("member")}
                    >
                        Member
                    </button>
                </div>
            </div>

            {mode === "member" ? (
                <div className="ttp__member-mode">
                    <TeamMemberSelector
                        selectedTeamMemberIds={selectedTeamMemberIds}
                        onSelectionChange={(ids) => {
                            // Selecting members is mutually exclusive with a team.
                            if (selectedTeamId) onTeamChange(null);
                            onMembersChange(ids);
                        }}
                        teamMembers={teamMembers}
                    />
                </div>
            ) : (
                <div className="ttp__panes">
                    {/* LEFT: teams (with sub-team nesting) */}
                    <div className="ttp__pane">
                        <div className="ttp__panehead">
                            <span>Teams</span>
                            <span>{teams.length}</span>
                        </div>
                        <div className="ttp__list">
                            {isLoading ? (
                                <div className="ttp__empty">Loading teams…</div>
                            ) : flatTeams.length === 0 ? (
                                <div className="ttp__empty">No teams yet</div>
                            ) : (
                                flatTeams.map(({ team, depth }) => {
                                    const isSelected = team.id === selectedTeamId;
                                    return (
                                        <button
                                            key={team.id}
                                            type="button"
                                            className={"ttp__team" + (isSelected ? " on" : "")}
                                            style={depth > 0 ? { marginLeft: depth * 14 } : undefined}
                                            aria-pressed={isSelected}
                                            onClick={() => handleSelectTeam(team.id)}
                                        >
                                            <span className="ttp__team-av">
                                                {team.avatar || "\u{1F46A}"}
                                            </span>
                                            <span className="ttp__team-body">
                                                <span className="ttp__team-name">{team.name}</span>
                                                <span className="ttp__team-meta">
                                                    {team.memberIds.length}{" "}
                                                    {team.memberIds.length === 1 ? "member" : "members"}
                                                    {team.subTeamIds.length > 0
                                                        ? ` · ${team.subTeamIds.length} sub`
                                                        : ""}
                                                </span>
                                            </span>
                                            {isSelected && (
                                                <span className="ttp__team-check">{"✓"}</span>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* RIGHT: selected team's member preview (read-only) */}
                    <div className="ttp__pane">
                        <div className="ttp__panehead">
                            <span>{selectedTeam ? selectedTeam.name : "Members"}</span>
                            {selectedTeam && (
                                <span>
                                    {previewMembers.length}{" "}
                                    {previewMembers.length === 1 ? "member" : "members"}
                                </span>
                            )}
                        </div>
                        <div className="ttp__list">
                            {!selectedTeam ? (
                                <div className="ttp__empty">
                                    Select a team to preview its members
                                </div>
                            ) : previewMembers.length === 0 ? (
                                <div className="ttp__empty">This team has no members</div>
                            ) : (
                                previewMembers.map(member => {
                                    const isLeader = member.id === selectedTeam.leaderId;
                                    return (
                                        <div key={member.id} className="ttp__member">
                                            <span className="ttp__member-av">{member.avatar}</span>
                                            <span className="ttp__member-body">
                                                <span className="ttp__member-name">{member.name}</span>
                                                {member.role && (
                                                    <span className="ttp__member-role">
                                                        {member.role}
                                                    </span>
                                                )}
                                            </span>
                                            {isLeader && (
                                                <span className="ttp__leader-badge">
                                                    {"★"} Leader
                                                </span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
