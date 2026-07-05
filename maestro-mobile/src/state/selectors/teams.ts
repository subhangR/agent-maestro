// Team + project selectors — pure functions over EntityState.
import type { Team, TeamId, Project, ProjectId } from '@/domain';
import type { EntityState } from '../entityStore';

export function selectTeam(state: EntityState, id: TeamId): Team | undefined {
  return state.teams[id];
}

export function selectTeamsByProject(state: EntityState, projectId: ProjectId): Team[] {
  return Object.values(state.teams).filter((t) => t.projectId === projectId);
}

export function selectProject(state: EntityState, id: ProjectId): Project | undefined {
  return state.projects[id];
}

export function selectProjects(state: EntityState): Project[] {
  return Object.values(state.projects);
}
