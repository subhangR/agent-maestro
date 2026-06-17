// Branded (nominal) string IDs — zero runtime cost, compile-time only.
//
// IMPORTANT: entity `id` fields in entities/* are declared as plain `string`
// (an exact mirror of the server, which the drift guard checks). These branded
// types are an OPT-IN convenience layer for Ledger/Conduit/Pulse: stores key
// maps as `Record<SessionId, Session>`, and the REST/WS parsers cast a raw
// string to its brand ONCE at the boundary (`asSessionId(raw)`), after which
// the rest of the app stays nominally type-safe across all entity kinds. The
// brands never appear inside the mirrored entity definitions, so they cannot
// break mutual assignability against the server source.

declare const __brand: unique symbol;

/** Generic nominal brand over a base type. */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ProjectId = Brand<string, 'ProjectId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type TeamMemberId = Brand<string, 'TeamMemberId'>;
export type TeamId = Brand<string, 'TeamId'>;
export type TaskListId = Brand<string, 'TaskListId'>;
export type TaskGraphId = Brand<string, 'TaskGraphId'>;
export type ModelProfileId = Brand<string, 'ModelProfileId'>;
export type CustomPromptId = Brand<string, 'CustomPromptId'>;
export type SessionPromptId = Brand<string, 'SessionPromptId'>;
export type HuddleId = Brand<string, 'HuddleId'>;
export type DocId = Brand<string, 'DocId'>;
export type SkillId = Brand<string, 'SkillId'>;
export type AgentId = Brand<string, 'AgentId'>;

/** Any branded id — for generic helpers. */
export type AnyId =
  | ProjectId
  | TaskId
  | SessionId
  | TeamMemberId
  | TeamId
  | TaskListId
  | TaskGraphId
  | ModelProfileId
  | CustomPromptId
  | SessionPromptId
  | HuddleId
  | DocId
  | SkillId
  | AgentId;

// Boundary cast helpers. Use these exactly once, where a raw string crosses
// into the typed domain (REST response, WS payload). They are identity at
// runtime — pure compile-time narrowing.
export const asProjectId = (s: string): ProjectId => s as ProjectId;
export const asTaskId = (s: string): TaskId => s as TaskId;
export const asSessionId = (s: string): SessionId => s as SessionId;
export const asTeamMemberId = (s: string): TeamMemberId => s as TeamMemberId;
export const asTeamId = (s: string): TeamId => s as TeamId;
export const asTaskListId = (s: string): TaskListId => s as TaskListId;
export const asTaskGraphId = (s: string): TaskGraphId => s as TaskGraphId;
export const asModelProfileId = (s: string): ModelProfileId => s as ModelProfileId;
export const asCustomPromptId = (s: string): CustomPromptId => s as CustomPromptId;
export const asSessionPromptId = (s: string): SessionPromptId => s as SessionPromptId;
export const asHuddleId = (s: string): HuddleId => s as HuddleId;
export const asDocId = (s: string): DocId => s as DocId;
export const asSkillId = (s: string): SkillId => s as SkillId;
export const asAgentId = (s: string): AgentId => s as AgentId;
