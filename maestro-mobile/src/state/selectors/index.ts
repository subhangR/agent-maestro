// Pure selector surface — the canonical, testable read API (Forge composes these
// with useShallow; the hooks in ../hooks wrap the same functions). Selectors are
// pure (state, ...args) → value and consume @/domain/derive for status/tab logic.
export { orderedForProject, type EntityState } from './shared';
export {
  selectSession,
  selectSessionUiStatus,
  selectSessionsByProject,
  selectSessionsByTab,
  selectLiveSessions,
  selectSessionsForTask,
  LIVE_STATUSES,
} from './sessions';
export {
  selectTask,
  selectTasksByProject,
  selectOpenTasks,
  selectChildTasks,
  selectTaskTree,
  type TaskTreeNode,
} from './tasks';
export {
  selectTeamMember,
  selectMembersByProject,
  selectMembersWithLiveCounts,
  type MemberWithLiveCount,
} from './members';
export { selectTeam, selectTeamsByProject, selectProject, selectProjects } from './teams';
