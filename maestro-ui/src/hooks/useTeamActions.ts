import { useMemo, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMaestroStore } from "../stores/useMaestroStore";
import { MaestroProject, MaestroTask, TeamMember, Team, CreateMaestroSessionInput, CreateTaskPayload } from "../app/types/maestro";

export function useTeamActions(projectId: string, project: MaestroProject, teamMembersMap: Record<string, TeamMember>, onCreateMaestroSession: (input: CreateMaestroSessionInput) => Promise<void>, createTask: (input: CreateTaskPayload) => Promise<MaestroTask>, onError: (msg: string) => void) {
    const { teamsMap, fetchTeams, wsConnected } = useMaestroStore(
        useShallow(s => ({ teamsMap: s.teams, fetchTeams: s.fetchTeams, wsConnected: s.wsConnected }))
    );

    useEffect(() => {
        if (projectId) {
            fetchTeams(projectId);
        }
    }, [projectId, fetchTeams, wsConnected]);

    const teams = useMemo(() => {
        return Object.values(teamsMap).filter(t => t.projectId === projectId);
    }, [teamsMap, projectId]);

    const activeTeams = useMemo(() => {
        return teams.filter(t => t.status === 'active');
    }, [teams]);

    const topLevelTeams = useMemo(() => {
        const teamIdSet = new Set(teams.map(t => t.id));
        return teams.filter(t => !t.parentTeamId || !teamIdSet.has(t.parentTeamId));
    }, [teams]);

    const handleRun = useCallback(async (team: Team) => {
        try {
            const leader = teamMembersMap[team.leaderId];
            if (!leader) { onError("Team has no valid leader"); return; }

            const task = await createTask({
                projectId,
                title: `Team: ${team.name}`,
                description: `Coordinator session for team: ${team.name}`,
                priority: 'medium',
                teamMemberId: leader.id,
                teamId: team.id,
            });

            const delegateIds = team.memberIds.filter((id: string) => id !== team.leaderId);

            await onCreateMaestroSession({
                task,
                project,
                mode: 'coordinator',
                teamMemberId: leader.id,
                // Bind the saved team so the server builds the recursive team structure
                // and the leader delegates down the tree (sub-team leaders spawn as
                // sub-coordinators). delegateIds remains a flat fallback roster.
                teamId: team.id,
                delegateTeamMemberIds: delegateIds.length > 0 ? delegateIds : undefined,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            onError(`Failed to start team session: ${message}`);
        }
    }, [projectId, project, teamMembersMap, createTask, onCreateMaestroSession, onError]);

    return {
        teams,
        activeTeams,
        topLevelTeams,
        handleRun,
    };
}
