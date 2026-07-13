/**
 * COMPILE-TIME DRIFT GUARD — never imported by app code, never bundled.
 *
 * Asserts that every hand-mirrored domain type stays MUTUALLY ASSIGNABLE with
 * its maestro-server source of truth. It runs ONLY under tsconfig.drift.json
 * (its own gate). The app tsconfig EXCLUDES this dir and Metro blockLists it +
 * ../maestro-server, so server (CJS) type-errors never enter the app gate and
 * server code never ships in the RN bundle.
 *
 * If the server entity file changes shape, the corresponding `Exact<...>`
 * assertion below stops equalling `true` and this file fails to typecheck —
 * that is the drift signal. Fix the mirror, then re-run the gate.
 *
 * Relative depth from src/domain/__sync__/ to the worktree root is 4 levels:
 *   __sync__ → domain → src → maestro-mobile → <app root> → maestro-server/...
 */

// --- server source of truth (type-only; resolves only under tsconfig.drift.json) ---
import type * as Server from '../../../../maestro-server/src/types';
import type {
  TypedEventMap as ServerTypedEventMap,
} from '../../../../maestro-server/src/domain/events/DomainEvents';

// --- mobile mirrors ---
import type * as Enums from '../enums';
import type {
  Project,
  Ordering,
  LaunchConfig,
  MemberLaunchOverride,
  Task,
  TaskImage,
  DocEntry,
  Session,
  SessionEvent,
  SessionTimelineEvent,
  TeamMember,
  TeamMemberSnapshot,
  Team,
  TeamSnapshot,
  TeamTreeMember,
  TeamTreeNode,
  SpellDefinition,
  SpellEntity,
  SpellInvocationPayload,
  SpellInvocationResult,
  CustomPrompt,
  TaskList,
  TaskGraph,
  TaskGraphNode,
  TaskGraphEdge,
  ModelProfile,
  SessionPrompt,
  Huddle,
  HuddleSessionRef,
} from '../entities';
import type {
  UpdateOrderingPayload,
  CreateTaskListPayload,
  UpdateTaskListPayload,
  CreateTaskGraphPayload,
  UpdateTaskGraphPayload,
  CreateModelProfilePayload,
  UpdateModelProfilePayload,
  CreateTeamMemberPayload,
  UpdateTeamMemberPayload,
  CreateTeamPayload,
  UpdateTeamPayload,
  CreateTaskPayload,
  UpdateTaskPayload,
  UpdateSource,
  CreateSessionPayload,
  UpdateSessionPayload,
  SpawnSessionPayload,
  CreateCustomPromptPayload,
  UpdateCustomPromptPayload,
} from '../contracts/rest';
import type {
  SpawnRequestEvent,
  SessionModeChangedPayload,
  WsEventMap,
} from '../contracts/ws';

/**
 * Bidirectional assignability. `true` iff A ⊆ B AND B ⊆ A. Tuple-wrapped so
 * unions don't distribute (we want whole-union equality, not member-wise).
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Each `assert<...>` is `true` only when the two shapes are mutually assignable. */
type assert<T extends true> = T;

// ---------------------------------------------------------------------------
// Enums / closed unions
// ---------------------------------------------------------------------------
type _TaskStatus = assert<Exact<Server.TaskStatus, Enums.TaskStatus>>;
type _TaskSessionStatus = assert<Exact<Server.TaskSessionStatus, Enums.TaskSessionStatus>>;
type _TaskPriority = assert<Exact<Server.TaskPriority, Enums.TaskPriority>>;
type _SessionStatus = assert<Exact<Server.SessionStatus, Enums.SessionStatus>>;
type _SessionTimelineEventType = assert<Exact<Server.SessionTimelineEventType, Enums.SessionTimelineEventType>>;
type _AgentMode = assert<Exact<Server.AgentMode, Enums.AgentMode>>;
type _LegacyAgentMode = assert<Exact<Server.LegacyAgentMode, Enums.LegacyAgentMode>>;
type _AgentModeInput = assert<Exact<Server.AgentModeInput, Enums.AgentModeInput>>;
type _AgentTool = assert<Exact<Server.AgentTool, Enums.AgentTool>>;
type _LaunchProvider = assert<Exact<Server.LaunchProvider, Enums.LaunchProvider>>;
type _LaunchReasoningEffort = assert<Exact<Server.LaunchReasoningEffort, Enums.LaunchReasoningEffort>>;
type _LaunchSpeed = assert<Exact<Server.LaunchSpeed, Enums.LaunchSpeed>>;
type _LaunchAccessMode = assert<Exact<Server.LaunchAccessMode, Enums.LaunchAccessMode>>;
type _TaskGraphStatus = assert<Exact<Server.TaskGraphStatus, Enums.TaskGraphStatus>>;
type _TeamMemberStatus = assert<Exact<Server.TeamMemberStatus, Enums.TeamMemberStatus>>;
type _TeamMemberScope = assert<Exact<Server.TeamMemberScope, Enums.TeamMemberScope>>;
type _SystemTeamMemberKind = assert<Exact<Server.SystemTeamMemberKind, Enums.SystemTeamMemberKind>>;
type _TeamStatus = assert<Exact<Server.TeamStatus, Enums.TeamStatus>>;
type _SpellEntityType = assert<Exact<Server.SpellEntityType, Enums.SpellEntityType>>;
type _WorkerStrategy = assert<Exact<Server.WorkerStrategy, Enums.WorkerStrategy>>;
type _OrchestratorStrategy = assert<Exact<Server.OrchestratorStrategy, Enums.OrchestratorStrategy>>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
type _Project = assert<Exact<Server.Project, Project>>;
type _Ordering = assert<Exact<Server.Ordering, Ordering>>;
type _LaunchConfig = assert<Exact<Server.LaunchConfig, LaunchConfig>>;
type _MemberLaunchOverride = assert<Exact<Server.MemberLaunchOverride, MemberLaunchOverride>>;
type _Task = assert<Exact<Server.Task, Task>>;
type _TaskImage = assert<Exact<Server.TaskImage, TaskImage>>;
type _DocEntry = assert<Exact<Server.DocEntry, DocEntry>>;
type _Session = assert<Exact<Server.Session, Session>>;
type _SessionEvent = assert<Exact<Server.SessionEvent, SessionEvent>>;
type _SessionTimelineEvent = assert<Exact<Server.SessionTimelineEvent, SessionTimelineEvent>>;
type _TeamMember = assert<Exact<Server.TeamMember, TeamMember>>;
type _TeamMemberSnapshot = assert<Exact<Server.TeamMemberSnapshot, TeamMemberSnapshot>>;
type _Team = assert<Exact<Server.Team, Team>>;
type _TeamSnapshot = assert<Exact<Server.TeamSnapshot, TeamSnapshot>>;
type _TeamTreeMember = assert<Exact<Server.TeamTreeMember, TeamTreeMember>>;
type _TeamTreeNode = assert<Exact<Server.TeamTreeNode, TeamTreeNode>>;
type _SpellDefinition = assert<Exact<Server.SpellDefinition, SpellDefinition>>;
type _SpellEntity = assert<Exact<Server.SpellEntity, SpellEntity>>;
type _SpellInvocationPayload = assert<Exact<Server.SpellInvocationPayload, SpellInvocationPayload>>;
type _SpellInvocationResult = assert<Exact<Server.SpellInvocationResult, SpellInvocationResult>>;
type _CustomPrompt = assert<Exact<Server.CustomPrompt, CustomPrompt>>;
type _TaskList = assert<Exact<Server.TaskList, TaskList>>;
type _TaskGraph = assert<Exact<Server.TaskGraph, TaskGraph>>;
type _TaskGraphNode = assert<Exact<Server.TaskGraphNode, TaskGraphNode>>;
type _TaskGraphEdge = assert<Exact<Server.TaskGraphEdge, TaskGraphEdge>>;
type _ModelProfile = assert<Exact<Server.ModelProfile, ModelProfile>>;
type _SessionPrompt = assert<Exact<Server.SessionPrompt, SessionPrompt>>;
type _Huddle = assert<Exact<Server.Huddle, Huddle>>;
type _HuddleSessionRef = assert<Exact<Server.HuddleSessionRef, HuddleSessionRef>>;

// ---------------------------------------------------------------------------
// REST payloads
// ---------------------------------------------------------------------------
type _UpdateOrderingPayload = assert<Exact<Server.UpdateOrderingPayload, UpdateOrderingPayload>>;
type _CreateTaskListPayload = assert<Exact<Server.CreateTaskListPayload, CreateTaskListPayload>>;
type _UpdateTaskListPayload = assert<Exact<Server.UpdateTaskListPayload, UpdateTaskListPayload>>;
type _CreateTaskGraphPayload = assert<Exact<Server.CreateTaskGraphPayload, CreateTaskGraphPayload>>;
type _UpdateTaskGraphPayload = assert<Exact<Server.UpdateTaskGraphPayload, UpdateTaskGraphPayload>>;
type _CreateModelProfilePayload = assert<Exact<Server.CreateModelProfilePayload, CreateModelProfilePayload>>;
type _UpdateModelProfilePayload = assert<Exact<Server.UpdateModelProfilePayload, UpdateModelProfilePayload>>;
type _CreateTeamMemberPayload = assert<Exact<Server.CreateTeamMemberPayload, CreateTeamMemberPayload>>;
type _UpdateTeamMemberPayload = assert<Exact<Server.UpdateTeamMemberPayload, UpdateTeamMemberPayload>>;
type _CreateTeamPayload = assert<Exact<Server.CreateTeamPayload, CreateTeamPayload>>;
type _UpdateTeamPayload = assert<Exact<Server.UpdateTeamPayload, UpdateTeamPayload>>;
type _CreateTaskPayload = assert<Exact<Server.CreateTaskPayload, CreateTaskPayload>>;
type _UpdateTaskPayload = assert<Exact<Server.UpdateTaskPayload, UpdateTaskPayload>>;
type _UpdateSource = assert<Exact<Server.UpdateSource, UpdateSource>>;
type _CreateSessionPayload = assert<Exact<Server.CreateSessionPayload, CreateSessionPayload>>;
type _UpdateSessionPayload = assert<Exact<Server.UpdateSessionPayload, UpdateSessionPayload>>;
type _SpawnSessionPayload = assert<Exact<Server.SpawnSessionPayload, SpawnSessionPayload>>;
type _CreateCustomPromptPayload = assert<Exact<Server.CreateCustomPromptPayload, CreateCustomPromptPayload>>;
type _UpdateCustomPromptPayload = assert<Exact<Server.UpdateCustomPromptPayload, UpdateCustomPromptPayload>>;

// ---------------------------------------------------------------------------
// Event payloads + the realtime event map (vs server TypedEventMap)
// ---------------------------------------------------------------------------
type _SpawnRequestEvent = assert<Exact<Server.SpawnRequestEvent, SpawnRequestEvent>>;
type _SessionModeChangedPayload = assert<Exact<Server.SessionModeChangedPayload, SessionModeChangedPayload>>;
type _WsEventMap = assert<Exact<ServerTypedEventMap, WsEventMap>>;

// Touch the alias types so `noUnusedLocals` (if enabled) stays quiet; they exist
// purely to force evaluation of every `assert<...>` above.
export type DriftGuardChecks = [
  _TaskStatus, _TaskSessionStatus, _TaskPriority, _SessionStatus, _SessionTimelineEventType,
  _AgentMode, _LegacyAgentMode, _AgentModeInput, _AgentTool, _LaunchProvider, _LaunchReasoningEffort,
  _LaunchSpeed, _LaunchAccessMode, _TaskGraphStatus, _TeamMemberStatus, _TeamMemberScope,
  _SystemTeamMemberKind, _TeamStatus, _SpellEntityType, _WorkerStrategy, _OrchestratorStrategy,
  _Project, _Ordering, _LaunchConfig, _MemberLaunchOverride, _Task, _TaskImage, _DocEntry, _Session,
  _SessionEvent, _SessionTimelineEvent, _TeamMember, _TeamMemberSnapshot, _Team, _TeamSnapshot,
  _TeamTreeMember, _TeamTreeNode, _SpellDefinition, _SpellEntity, _SpellInvocationPayload,
  _SpellInvocationResult, _CustomPrompt, _TaskList, _TaskGraph, _TaskGraphNode, _TaskGraphEdge,
  _ModelProfile, _SessionPrompt, _Huddle, _HuddleSessionRef,
  _UpdateOrderingPayload, _CreateTaskListPayload, _UpdateTaskListPayload, _CreateTaskGraphPayload,
  _UpdateTaskGraphPayload, _CreateModelProfilePayload, _UpdateModelProfilePayload,
  _CreateTeamMemberPayload, _UpdateTeamMemberPayload, _CreateTeamPayload, _UpdateTeamPayload,
  _CreateTaskPayload, _UpdateTaskPayload, _UpdateSource, _CreateSessionPayload, _UpdateSessionPayload,
  _SpawnSessionPayload, _CreateCustomPromptPayload, _UpdateCustomPromptPayload,
  _SpawnRequestEvent, _SessionModeChangedPayload, _WsEventMap,
];
