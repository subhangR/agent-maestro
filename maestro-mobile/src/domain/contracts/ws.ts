// WebSocket wire contracts. Pulse (services/realtime/) consumes ONLY these.
//
// Envelope verified against maestro-server WebSocketBridge.ts:
//   - shape: { type, event, data, timestamp } with type === event
//   - batched flush  → WsEnvelope[]   (an array of envelopes)
//   - immediate event → WsEnvelope    (a single envelope, un-batched)
// schemas/wsEnvelope.ts encodes the Array.isArray branch + safe-parse.
//
// WsEventMap mirrors maestro-server TypedEventMap (DomainEvents.ts) — do not
// edit a payload shape without re-running the drift guard.
import type { Project } from '../entities/project';
import type { Task } from '../entities/task';
import type { Session } from '../entities/session';
import type { TeamMember } from '../entities/teamMember';
import type { Team } from '../entities/team';
import type { TaskList } from '../entities/taskList';
import type { TaskGraph } from '../entities/taskGraph';
import type { ModelProfile } from '../entities/modelProfile';
import type { CustomPrompt, SpellInvocationResult } from '../entities/spell';
import type { AgentMode } from '../enums';
import type { EpochMs } from '../primitives';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/** The wire envelope. On the server `type === event` always. */
export interface WsEnvelope<T = unknown> {
  type: string;
  event: string;
  data: T;
  timestamp: number;
}

/** A raw message is either a single envelope (immediate) or an array (batch). */
export type WsRawMessage = WsEnvelope | WsEnvelope[];

/**
 * Events the server delivers un-batched (WebSocketBridge IMMEDIATE_EVENTS,
 * verified L16-24). Exactly these 7. Informational for clients — the server
 * decides batching — but documents which arrive solo vs in an array.
 */
export const IMMEDIATE_EVENTS = [
  'session:spawn',
  'session:resume',
  'session:prompt_send',
  'session:modal',
  'session:modal_action',
  'session:modal_closed',
  'spell:invoked',
] as const;

export type ImmediateEventName = (typeof IMMEDIATE_EVENTS)[number];

const IMMEDIATE_EVENT_SET: ReadonlySet<string> = new Set(IMMEDIATE_EVENTS);

/** True if this event arrives un-batched (a single envelope, not an array). */
export function isImmediateEvent(event: string): event is ImmediateEventName {
  return IMMEDIATE_EVENT_SET.has(event);
}

// ---------------------------------------------------------------------------
// Event payloads not represented by a top-level entity
// ---------------------------------------------------------------------------

/** Emitted by the server to the UI on session:spawn / session:resume. */
export interface SpawnRequestEvent {
  session: Session;
  projectId: string;
  taskIds: string[];
  command: string;
  cwd: string;
  envVars: Record<string, string>;
  manifest?: any;
  spawnSource: 'ui' | 'session';
  parentSessionId?: string;
  rootSessionId?: string;
  _isSpawnCreated?: boolean;
}

/** Payload on session:mode_changed. */
export interface SessionModeChangedPayload {
  sessionId: string;
  mode: AgentMode;
  previousMode: AgentMode;
  changed: boolean;
  timestamp: EpochMs;
}

/**
 * session:status_changed is a PARTIAL — NOT a full Session. Ledger must
 * shallow-merge into the existing session, never replace it.
 */
export interface SessionStatusChangedPayload {
  id: string;
  status: string;
  lastActivity: string;
  needsInput?: { active: boolean; message?: string };
}

export interface SessionModalPayload {
  sessionId: string;
  modalId: string;
  title: string;
  html: string;
  filePath?: string;
  timestamp: EpochMs;
}

export interface SessionModalActionPayload {
  sessionId: string;
  modalId: string;
  action: string;
  data: Record<string, any>;
  timestamp: EpochMs;
}

export interface SessionModalClosedPayload {
  sessionId: string;
  modalId: string;
  timestamp: EpochMs;
}

/** Matches server TypedEventMap['session:prompt_send'] (5 fields). */
export interface SessionPromptSendPayload {
  sessionId: string;
  content: string;
  mode: 'send' | 'paste';
  senderSessionId: string | null;
  timestamp: EpochMs;
}

// ---------------------------------------------------------------------------
// WsEventMap — mirror of TypedEventMap
// ---------------------------------------------------------------------------

export interface WsEventMap {
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
  'session:status_changed': SessionStatusChangedPayload;
  'session:mode_changed': SessionModeChangedPayload;
  'session:deleted': { id: string };
  'session:task_added': { sessionId: string; taskId: string };
  'session:task_removed': { sessionId: string; taskId: string };
  'notify:task_completed': { taskId: string; title: string };
  'notify:task_failed': { taskId: string; title: string };
  'notify:task_in_review': { taskId: string; title: string };
  'notify:task_blocked': { taskId: string; title: string };
  'notify:task_session_completed': { taskId: string; sessionId: string; title: string };
  'notify:task_session_failed': { taskId: string; sessionId: string; title: string };
  'notify:session_completed': { sessionId: string; name: string };
  'notify:session_failed': { sessionId: string; name: string };
  'notify:needs_input': { sessionId: string; name: string; message?: string };
  'notify:progress': { sessionId: string; taskId?: string; message?: string };
  'session:modal': SessionModalPayload;
  'session:modal_action': SessionModalActionPayload;
  'session:modal_closed': SessionModalClosedPayload;
  'session:prompt_send': SessionPromptSendPayload;
  'team_member:created': TeamMember;
  'team_member:updated': TeamMember;
  'team_member:deleted': { id: string };
  'team_member:archived': TeamMember;
  // team:* are declared but NOT broadcast (REST-poll-only) — typed for completeness.
  'team:created': Team;
  'team:updated': Team;
  'team:deleted': { id: string };
  'team:archived': Team;
  'spell:invoked': SpellInvocationResult;
  'custom_prompt:created': CustomPrompt;
  'custom_prompt:updated': CustomPrompt;
  'custom_prompt:deleted': { id: string };
  'model_profile:created': ModelProfile;
  'model_profile:updated': ModelProfile;
  'model_profile:deleted': { id: string };
  'task_graph:created': TaskGraph;
  'task_graph:updated': TaskGraph;
  'task_graph:deleted': { id: string; projectId: string };
}

export type WsEventName = keyof WsEventMap;
export type WsEventPayload<K extends WsEventName> = WsEventMap[K];

/**
 * Runtime list of every known event name (for the envelope parser's
 * drop-unknown filter). The `satisfies` + `_MissingWsEvent` guard makes this a
 * compile error if it ever drifts from WsEventMap's keys.
 */
export const WS_EVENT_NAMES = [
  'project:created',
  'project:updated',
  'project:deleted',
  'task:created',
  'task:updated',
  'task:deleted',
  'task:session_added',
  'task:session_removed',
  'task_list:created',
  'task_list:updated',
  'task_list:deleted',
  'task_list:reordered',
  'session:created',
  'session:spawn',
  'session:resume',
  'session:updated',
  'session:status_changed',
  'session:mode_changed',
  'session:deleted',
  'session:task_added',
  'session:task_removed',
  'notify:task_completed',
  'notify:task_failed',
  'notify:task_in_review',
  'notify:task_blocked',
  'notify:task_session_completed',
  'notify:task_session_failed',
  'notify:session_completed',
  'notify:session_failed',
  'notify:needs_input',
  'notify:progress',
  'session:modal',
  'session:modal_action',
  'session:modal_closed',
  'session:prompt_send',
  'team_member:created',
  'team_member:updated',
  'team_member:deleted',
  'team_member:archived',
  'team:created',
  'team:updated',
  'team:deleted',
  'team:archived',
  'spell:invoked',
  'custom_prompt:created',
  'custom_prompt:updated',
  'custom_prompt:deleted',
  'model_profile:created',
  'model_profile:updated',
  'model_profile:deleted',
  'task_graph:created',
  'task_graph:updated',
  'task_graph:deleted',
] as const satisfies readonly WsEventName[];

// Compile-time exhaustiveness: errors if WS_EVENT_NAMES misses a WsEventMap key.
type _MissingWsEvent = Exclude<WsEventName, (typeof WS_EVENT_NAMES)[number]>;
const _wsEventsExhaustive: _MissingWsEvent extends never ? true : ['missing ws events', _MissingWsEvent] = true;
void _wsEventsExhaustive;

const WS_EVENT_NAME_SET: ReadonlySet<string> = new Set(WS_EVENT_NAMES);

/** True if `event` is a known server event name. */
export function isKnownWsEvent(event: string): event is WsEventName {
  return WS_EVENT_NAME_SET.has(event);
}

/**
 * Discriminated union of every realtime event, carrying the full envelope so a
 * reducer `switch (e.event)` is exhaustive (use a `never` default — a new
 * server event then becomes a compile error, not a silent miss).
 */
export type RealtimeEvent = {
  [K in WsEventName]: {
    type: K;
    event: K;
    data: WsEventMap[K];
    timestamp: number;
  };
}[WsEventName];

/** Alias — Pulse/Ledger may refer to either name. */
export type WsEvent = RealtimeEvent;
