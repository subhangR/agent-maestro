// Barrel — the ONLY place server→display translation lives. Features call these,
// never re-implement enum mapping in components.
export {
  type UiSessionStatus,
  type SessionTab,
  type SessionStatusInput,
  type SessionTabInput,
  UI_SESSION_STATUS_LABEL,
  toUiSessionStatus,
  isArchivedTab,
  isCompletedTab,
  isActiveTab,
  sessionTab,
} from './sessionStatus';
export { type DisplayTool, toDisplayTool, displayToolLabel } from './agentTool';
export { MODE_DISPLAY_LABEL, modeDisplayLabel } from './mode';
