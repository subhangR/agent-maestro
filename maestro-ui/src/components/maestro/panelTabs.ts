// Navigation tab types for the Maestro left panel. These used to live in
// PanelIconBar (a parallel navigator that is no longer rendered); they are kept
// here so MaestroPanel and AppLeftPanel can share them without that component.

export type PrimaryTab = "tasks" | "lists" | "team" | "skills" | "graphs" | "profiles" | "collab";
export type TaskSubTab = "current" | "pinned" | "completed" | "archived";
export type SkillSubTab = "browse" | "installed" | "marketplace";
export type TeamSubTab = "members" | "teams";
