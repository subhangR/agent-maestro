// Team-member selectors — pure functions over EntityState.
import type { TeamMember, TeamMemberId, ProjectId } from '@/domain';
import { toUiSessionStatus } from '@/domain';
import type { EntityState } from '../entityStore';
import { LIVE_STATUSES } from './sessions';

export function selectTeamMember(state: EntityState, id: TeamMemberId): TeamMember | undefined {
  return state.teamMembers[id];
}

export function selectMembersByProject(state: EntityState, projectId: ProjectId): TeamMember[] {
  return Object.values(state.teamMembers).filter((m) => m.projectId === projectId);
}

export interface MemberWithLiveCount {
  member: TeamMember;
  liveCount: number;
}

const memberOwnsSession = (memberId: string, s: { teamMemberId?: string; teamMemberIds?: string[] }): boolean =>
  s.teamMemberId === memberId || (s.teamMemberIds?.includes(memberId) ?? false);

/**
 * Project members each annotated with the count of their currently-live sessions
 * (display status working/run/wait). Drives roster tiles' live dots.
 *
 * MEMOIZED on the input references (teamMembers + sessions maps + projectId). This
 * selector builds NEW wrapper objects ({member, liveCount}), so `useShallow` can't
 * stabilise it (each element is a fresh reference) → without this it re-snapshots
 * every render and React throws "Maximum update depth exceeded". The store mutates
 * immutably, so reference-equality on the maps is a correct change signal.
 */
let liveCountsMemo:
  | { teamMembers: EntityState['teamMembers']; sessions: EntityState['sessions']; projectId: ProjectId; result: MemberWithLiveCount[] }
  | null = null;

export function selectMembersWithLiveCounts(state: EntityState, projectId: ProjectId): MemberWithLiveCount[] {
  if (
    liveCountsMemo &&
    liveCountsMemo.teamMembers === state.teamMembers &&
    liveCountsMemo.sessions === state.sessions &&
    liveCountsMemo.projectId === projectId
  ) {
    return liveCountsMemo.result;
  }
  const liveSessions = Object.values(state.sessions).filter((s) => LIVE_STATUSES.has(toUiSessionStatus(s)));
  const result = selectMembersByProject(state, projectId).map((member) => ({
    member,
    liveCount: liveSessions.filter((s) => memberOwnsSession(member.id, s)).length,
  }));
  liveCountsMemo = { teamMembers: state.teamMembers, sessions: state.sessions, projectId, result };
  return result;
}
