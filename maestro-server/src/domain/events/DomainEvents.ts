import { Project, Task, Session, SpawnRequestEvent, TaskSessionStatus, TeamMember, Team, TaskList, TaskGraph, SpellInvocationResult, CustomPrompt, ModelProfile, SessionModeChangedPayload, ActiveSpell, Ensemble } from '../../types';

/**
 * Type-safe domain event definitions.
 * These match the events currently emitted by the Storage class.
 */

// Project Events
export interface ProjectCreatedEvent {
  type: 'project:created';
  data: Project;
}

export interface ProjectUpdatedEvent {
  type: 'project:updated';
  data: Project;
}

export interface ProjectDeletedEvent {
  type: 'project:deleted';
  data: { id: string };
}

// Task Events
export interface TaskCreatedEvent {
  type: 'task:created';
  data: Task;
}

export interface TaskUpdatedEvent {
  type: 'task:updated';
  data: Task;
}

export interface TaskDeletedEvent {
  type: 'task:deleted';
  data: { id: string };
}

export interface TaskSessionAddedEvent {
  type: 'task:session_added';
  data: { taskId: string; sessionId: string };
}

export interface TaskSessionRemovedEvent {
  type: 'task:session_removed';
  data: { taskId: string; sessionId: string };
}

// Task List Events
export interface TaskListCreatedEvent {
  type: 'task_list:created';
  data: TaskList;
}

export interface TaskListUpdatedEvent {
  type: 'task_list:updated';
  data: TaskList;
}

export interface TaskListDeletedEvent {
  type: 'task_list:deleted';
  data: { id: string };
}

export interface TaskListReorderedEvent {
  type: 'task_list:reordered';
  data: TaskList;
}

// Session Events
export interface SessionCreatedEvent {
  type: 'session:created';
  data: Session;
}

export interface SessionSpawnEvent {
  type: 'session:spawn';
  data: SpawnRequestEvent;
}

export interface SessionResumeEvent {
  type: 'session:resume';
  data: SpawnRequestEvent;
}

export interface SessionUpdatedEvent {
  type: 'session:updated';
  data: Session;
}

export interface SessionDeletedEvent {
  type: 'session:deleted';
  data: { id: string };
}

export interface SessionTaskAddedEvent {
  type: 'session:task_added';
  data: { sessionId: string; taskId: string };
}

export interface SessionStatusChangedEvent {
  type: 'session:status_changed';
  data: { id: string; status: string; lastActivity: string; needsInput?: { active: boolean; message?: string } };
}

export interface SessionTaskRemovedEvent {
  type: 'session:task_removed';
  data: { sessionId: string; taskId: string };
}

// Notification Events (fire alongside CRUD events for high-impact state transitions)
export interface NotifyTaskCompletedEvent {
  type: 'notify:task_completed';
  data: { taskId: string; title: string };
}

export interface NotifyTaskFailedEvent {
  type: 'notify:task_failed';
  data: { taskId: string; title: string };
}

export interface NotifyTaskInReviewEvent {
  type: 'notify:task_in_review';
  data: { taskId: string; title: string };
}

export interface NotifyTaskBlockedEvent {
  type: 'notify:task_blocked';
  data: { taskId: string; title: string };
}

export interface NotifyTaskSessionCompletedEvent {
  type: 'notify:task_session_completed';
  data: { taskId: string; sessionId: string; title: string };
}

export interface NotifyTaskSessionFailedEvent {
  type: 'notify:task_session_failed';
  data: { taskId: string; sessionId: string; title: string };
}

export interface NotifySessionCompletedEvent {
  type: 'notify:session_completed';
  data: { sessionId: string; name: string };
}

export interface NotifySessionFailedEvent {
  type: 'notify:session_failed';
  data: { sessionId: string; name: string };
}

export interface NotifyNeedsInputEvent {
  type: 'notify:needs_input';
  data: { sessionId: string; name: string; message?: string };
}

export interface NotifyProgressEvent {
  type: 'notify:progress';
  /** `channel` is an optional routing hint from notify-channel spell rules (§11.7). */
  data: { sessionId: string; taskId?: string; message?: string; channel?: string };
}

// Modal Events
export interface SessionModalEvent {
  type: 'session:modal';
  data: {
    sessionId: string;
    modalId: string;
    title: string;
    html: string;
    filePath?: string;
    timestamp: number;
  };
}

export interface SessionModalActionEvent {
  type: 'session:modal_action';
  data: {
    sessionId: string;
    modalId: string;
    action: string;
    data: Record<string, any>;
    timestamp: number;
  };
}

export interface SessionModalClosedEvent {
  type: 'session:modal_closed';
  data: {
    sessionId: string;
    modalId: string;
    timestamp: number;
  };
}

export interface SessionPromptSendEvent {
  type: 'session:prompt_send';
  data: {
    sessionId: string;
    content: string;
    mode: 'send' | 'paste';
    senderSessionId: string | null;
    senderProjectId: string | null;
    targetProjectId: string | null;
    timestamp: number;
  };
}

// Team Member Events
export interface TeamMemberCreatedEvent {
  type: 'team_member:created';
  data: TeamMember;
}

export interface TeamMemberUpdatedEvent {
  type: 'team_member:updated';
  data: TeamMember;
}

export interface TeamMemberDeletedEvent {
  type: 'team_member:deleted';
  data: { id: string };
}

export interface TeamMemberArchivedEvent {
  type: 'team_member:archived';
  data: TeamMember;
}

// Team Events
export interface TeamCreatedEvent {
  type: 'team:created';
  data: Team;
}

export interface TeamUpdatedEvent {
  type: 'team:updated';
  data: Team;
}

export interface TeamDeletedEvent {
  type: 'team:deleted';
  data: { id: string };
}

export interface TeamArchivedEvent {
  type: 'team:archived';
  data: Team;
}

// Spell Events
export interface SpellInvokedEvent {
  type: 'spell:invoked';
  data: SpellInvocationResult;
}

export interface SpellActivatedPayload {
  spellId: string;
  sessionIds: string[];
  activeSpell: ActiveSpell;
  timestamp: number;
}

export interface SpellDeactivatedPayload {
  spellId: string;
  sessionIds: string[];
  timestamp: number;
}

export interface SpellLoopResetPayload {
  spellId: string;
  sessionId: string;
  /** The specific rule reset, or `null` when ALL rules were reset. */
  ruleId: string | null;
  /** The updated active-spell entry (authoritative ruleIterations). */
  activeSpell: ActiveSpell;
  timestamp: number;
}

export interface SpellActivatedEvent {
  type: 'spell:activated';
  data: SpellActivatedPayload;
}

export interface SpellDeactivatedEvent {
  type: 'spell:deactivated';
  data: SpellDeactivatedPayload;
}

// Ensemble Events (P4 — multi-session coordination unit)
export interface EnsembleCreatedEvent {
  type: 'ensemble:created';
  data: Ensemble;
}

export interface EnsembleUpdatedEvent {
  type: 'ensemble:updated';
  data: Ensemble;
}

export interface EnsembleDisbandedEvent {
  type: 'ensemble:disbanded';
  data: { id: string; memberSessionIds: string[]; spellId: string };
}

export interface EnsembleMessageEvent {
  type: 'ensemble:message';
  data: {
    ensembleId: string;
    senderSessionId: string | null;
    recipients: string[];
    content: string;
    timestamp: number;
  };
}

export interface CustomPromptCreatedEvent {
  type: 'custom_prompt:created';
  data: CustomPrompt;
}

export interface CustomPromptUpdatedEvent {
  type: 'custom_prompt:updated';
  data: CustomPrompt;
}

export interface CustomPromptDeletedEvent {
  type: 'custom_prompt:deleted';
  data: { id: string };
}

// Model Profile Events
export interface ModelProfileCreatedEvent {
  type: 'model_profile:created';
  data: ModelProfile;
}

export interface ModelProfileUpdatedEvent {
  type: 'model_profile:updated';
  data: ModelProfile;
}

export interface ModelProfileDeletedEvent {
  type: 'model_profile:deleted';
  data: { id: string };
}

/**
 * Union type of all domain events.
 * Use this for type-safe event handling.
 */
export type DomainEvent =
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | TaskSessionAddedEvent
  | TaskSessionRemovedEvent
  | TaskListCreatedEvent
  | TaskListUpdatedEvent
  | TaskListDeletedEvent
  | TaskListReorderedEvent
  | SessionCreatedEvent
  | SessionSpawnEvent
  | SessionResumeEvent
  | SessionUpdatedEvent
  | SessionStatusChangedEvent
  | SessionDeletedEvent
  | SessionTaskAddedEvent
  | SessionTaskRemovedEvent
  | NotifyTaskCompletedEvent
  | NotifyTaskFailedEvent
  | NotifyTaskInReviewEvent
  | NotifyTaskBlockedEvent
  | NotifyTaskSessionCompletedEvent
  | NotifyTaskSessionFailedEvent
  | NotifySessionCompletedEvent
  | NotifySessionFailedEvent
  | NotifyNeedsInputEvent
  | NotifyProgressEvent
  | SessionModalEvent
  | SessionModalActionEvent
  | SessionModalClosedEvent
  | SessionPromptSendEvent
  | TeamMemberCreatedEvent
  | TeamMemberUpdatedEvent
  | TeamMemberDeletedEvent
  | TeamMemberArchivedEvent
  | TeamCreatedEvent
  | TeamUpdatedEvent
  | TeamDeletedEvent
  | TeamArchivedEvent
  | SpellInvokedEvent
  | SpellActivatedEvent
  | SpellDeactivatedEvent
  | EnsembleCreatedEvent
  | EnsembleUpdatedEvent
  | EnsembleDisbandedEvent
  | EnsembleMessageEvent
  | CustomPromptCreatedEvent
  | CustomPromptUpdatedEvent
  | CustomPromptDeletedEvent
  | ModelProfileCreatedEvent
  | ModelProfileUpdatedEvent
  | ModelProfileDeletedEvent;

/**
 * Type-safe event map for event bus.
 * Maps event name strings to their payload types.
 */
export interface TypedEventMap {
  'project:created': Project;
  'project:updated': Project;
  'project:deleted': { id: string };
  'task:created': Task;
  'task:updated': Task;
  'task:deleted': { id: string };
  'task:session_added': { taskId: string; sessionId: string };
  'task:session_removed': { taskId: string; sessionId: string };
  'task_list:created': TaskList;
  'task_list:updated': TaskList;
  'task_list:deleted': { id: string };
  'task_list:reordered': TaskList;
  'session:created': Session;
  'session:spawn': SpawnRequestEvent;
  'session:resume': SpawnRequestEvent;
  'session:updated': Session;
  'session:status_changed': { id: string; status: string; lastActivity: string; needsInput?: { active: boolean; message?: string } };
  'session:mode_changed': SessionModeChangedPayload;
  'session:deleted': { id: string };
  'session:task_added': { sessionId: string; taskId: string };
  'session:task_removed': { sessionId: string; taskId: string };
  // Notification events
  'notify:task_completed': { taskId: string; title: string };
  'notify:task_failed': { taskId: string; title: string };
  'notify:task_in_review': { taskId: string; title: string };
  'notify:task_blocked': { taskId: string; title: string };
  'notify:task_session_completed': { taskId: string; sessionId: string; title: string };
  'notify:task_session_failed': { taskId: string; sessionId: string; title: string };
  'notify:session_completed': { sessionId: string; name: string };
  'notify:session_failed': { sessionId: string; name: string };
  'notify:needs_input': { sessionId: string; name: string; message?: string };
  'notify:progress': { sessionId: string; taskId?: string; message?: string; channel?: string };
  'session:modal': {
    sessionId: string;
    modalId: string;
    title: string;
    html: string;
    filePath?: string;
    timestamp: number;
  };
  'session:modal_action': {
    sessionId: string;
    modalId: string;
    action: string;
    data: Record<string, any>;
    timestamp: number;
  };
  'session:modal_closed': {
    sessionId: string;
    modalId: string;
    timestamp: number;
  };
  'session:prompt_send': {
    sessionId: string;
    content: string;
    mode: 'send' | 'paste';
    senderSessionId: string | null;
    /** Project the sender lives in (null = UI). */
    senderProjectId?: string | null;
    /** Project the target session lives in. */
    targetProjectId?: string | null;
    timestamp: number;
  };
  // Team member events
  'team_member:created': TeamMember;
  'team_member:updated': TeamMember;
  'team_member:deleted': { id: string };
  'team_member:archived': TeamMember;
  // Team events
  'team:created': Team;
  'team:updated': Team;
  'team:deleted': { id: string };
  'team:archived': Team;
  // Spell events
  'spell:invoked': SpellInvocationResult;
  'spell:activated': SpellActivatedPayload;
  'spell:deactivated': SpellDeactivatedPayload;
  // PI-6: lightweight per-rule observability so silent dispatch failures are visible.
  'spell:rule_fired': {
    sessionId: string;
    spellId: string;
    ruleId: string;
    event: string;
    action: string;
    outcome: 'ok' | 'error';
    timestamp: number;
  };
  // D9/FR-6.6: loop-counter reset broadcast so the UI can drop optimistic state.
  'spell:loop_reset': SpellLoopResetPayload;
  // Ensemble events
  'ensemble:created': Ensemble;
  'ensemble:updated': Ensemble;
  'ensemble:disbanded': { id: string; memberSessionIds: string[]; spellId: string };
  'ensemble:message': {
    ensembleId: string;
    senderSessionId: string | null;
    recipients: string[];
    content: string;
    timestamp: number;
  };
  'custom_prompt:created': CustomPrompt;
  'custom_prompt:updated': CustomPrompt;
  'custom_prompt:deleted': { id: string };
  // Model profile events
  'model_profile:created': ModelProfile;
  'model_profile:updated': ModelProfile;
  'model_profile:deleted': { id: string };
  // Task graph events
  'task_graph:created': TaskGraph;
  'task_graph:updated': TaskGraph;
  'task_graph:deleted': { id: string; projectId: string };
}

/**
 * All valid event names.
 */
export type EventName = keyof TypedEventMap;

/**
 * Get the payload type for a specific event name.
 */
export type EventPayload<K extends EventName> = TypedEventMap[K];
