// The WS→state reducer — what Pulse calls. Pulse owns transport + Array.isArray
// decode + envelope-normalize; it calls ingestBatch(array) for a batched flush
// or ingestEvent(single) for an immediate envelope. The switch(event)
// reconciliation + batchSet coalescing are MINE (Pulse never touches set()).
//
// All entity writes go through `batchSet`, so a whole array flush (plus anything
// else queued this tick) collapses into ONE set() → one render. spawn/resume use
// a direct set for immediacy (mirrors useMaestroStore L403/L421).
//
// The switch is exhaustive over Lexicon's WsEvent union with an assertNever
// default — a NEW server event becomes a compile error here, not a silent miss.
import type { WsEvent } from '@/domain';
import {
  asProjectId,
  asTaskId,
  asTaskListId,
  asSessionId,
  asTeamMemberId,
  asTeamId,
  asModelProfileId,
  asTaskGraphId,
  asCustomPromptId,
} from '@/domain';
import { useEntityStore, batchSet } from './entityStore';
import { normalizeSession, statusOnlyPatch } from './batchSet';
import { applyOverrides } from './optimistic';
import { fetchTask, fetchSession, resyncProject as fetchResyncProject } from './fetchActions';
import { getActiveProjectId } from './uiStore';

declare const __DEV__: boolean;

function assertNever(e: never): void {
  // A drift safety net — should be unreachable given the typed union.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn('[state] unhandled ws event', e);
  }
}

// Tasks must always carry an object taskSessionStatuses.
function ensureTaskStatuses<T extends { taskSessionStatuses?: unknown }>(task: T): T {
  if (task.taskSessionStatuses && typeof task.taskSessionStatuses === 'object') return task;
  return { ...task, taskSessionStatuses: {} };
}

/** Reconcile one normalized realtime event into the store. */
function reduce(e: WsEvent): void {
  switch (e.event) {
    // ---- Projects ----
    case 'project:created':
    case 'project:updated': {
      const p = e.data;
      batchSet((prev) => ({ projects: { ...prev.projects, [asProjectId(p.id)]: p } }));
      return;
    }
    case 'project:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asProjectId(id)]: _omit, ...projects } = prev.projects;
        return { projects };
      });
      return;
    }

    // ---- Tasks ----
    case 'task:created':
    case 'task:updated': {
      const t = ensureTaskStatuses(e.data);
      batchSet((prev) => ({ tasks: { ...prev.tasks, [asTaskId(t.id)]: t } }));
      return;
    }
    case 'task:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asTaskId(id)]: _omit, ...tasks } = prev.tasks;
        return { tasks };
      });
      return;
    }
    case 'task:session_added':
    case 'task:session_removed': {
      // Relationship change — refresh the task entity.
      if (e.data.taskId) void fetchTask(e.data.taskId);
      return;
    }

    // ---- Task lists ----
    case 'task_list:created':
    case 'task_list:updated':
    case 'task_list:reordered': {
      const list = e.data;
      batchSet((prev) => ({ taskLists: { ...prev.taskLists, [asTaskListId(list.id)]: list } }));
      return;
    }
    case 'task_list:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asTaskListId(id)]: _omit, ...taskLists } = prev.taskLists;
        return { taskLists };
      });
      return;
    }

    // ---- Sessions ----
    case 'session:created':
    case 'session:updated': {
      const session = applyOverrides('sessions', e.data.id, normalizeSession(e.data));
      batchSet((prev) => ({ sessions: { ...prev.sessions, [asSessionId(session.id)]: session } }));
      return;
    }
    case 'session:spawn':
    case 'session:resume': {
      // SpawnRequestEvent carries the full session; insert immediately (not
      // batched) so the tile appears at once. Terminal spawn is Pulse/Relay's
      // job — I only own session metadata. Idempotent by id.
      const raw = e.data.session;
      if (!raw?.id) return;
      const session = applyOverrides('sessions', raw.id, normalizeSession(raw));
      useEntityStore.setState((prev) => ({
        sessions: { ...prev.sessions, [asSessionId(session.id)]: session },
      }));
      return;
    }
    case 'session:status_changed': {
      // Lightweight in-place patch — never a full replace, skip if absent.
      const payload = e.data;
      const existing = useEntityStore.getState().sessions[asSessionId(payload.id)];
      if (!existing) return;
      const updated = statusOnlyPatch(existing, payload);
      batchSet((prev) => ({ sessions: { ...prev.sessions, [asSessionId(payload.id)]: updated } }));
      return;
    }
    case 'session:mode_changed': {
      const { sessionId, mode } = e.data;
      batchSet((prev) => {
        const existing = prev.sessions[asSessionId(sessionId)];
        if (!existing) return {};
        return { sessions: { ...prev.sessions, [asSessionId(sessionId)]: { ...existing, mode } } };
      });
      return;
    }
    case 'session:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asSessionId(id)]: _omit, ...sessions } = prev.sessions;
        return { sessions };
      });
      return;
    }
    case 'session:task_added':
    case 'session:task_removed': {
      if (e.data.sessionId) void fetchSession(e.data.sessionId);
      return;
    }

    // ---- Team members ----
    case 'team_member:created':
    case 'team_member:updated':
    case 'team_member:archived': {
      const tm = e.data;
      batchSet((prev) => ({ teamMembers: { ...prev.teamMembers, [asTeamMemberId(tm.id)]: tm } }));
      return;
    }
    case 'team_member:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asTeamMemberId(id)]: _omit, ...teamMembers } = prev.teamMembers;
        return { teamMembers };
      });
      return;
    }

    // ---- Teams (declared but NOT broadcast — REST-poll-only; handled for completeness) ----
    case 'team:created':
    case 'team:updated':
    case 'team:archived': {
      const team = e.data;
      batchSet((prev) => ({ teams: { ...prev.teams, [asTeamId(team.id)]: team } }));
      return;
    }
    case 'team:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asTeamId(id)]: _omit, ...teams } = prev.teams;
        return { teams };
      });
      return;
    }

    // ---- Custom prompts ----
    case 'custom_prompt:created':
    case 'custom_prompt:updated': {
      const cp = e.data;
      batchSet((prev) => ({ customPrompts: { ...prev.customPrompts, [asCustomPromptId(cp.id)]: cp } }));
      return;
    }
    case 'custom_prompt:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asCustomPromptId(id)]: _omit, ...customPrompts } = prev.customPrompts;
        return { customPrompts };
      });
      return;
    }

    // ---- Model profiles ----
    case 'model_profile:created':
    case 'model_profile:updated': {
      const mp = e.data;
      batchSet((prev) => ({ modelProfiles: { ...prev.modelProfiles, [asModelProfileId(mp.id)]: mp } }));
      return;
    }
    case 'model_profile:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asModelProfileId(id)]: _omit, ...modelProfiles } = prev.modelProfiles;
        return { modelProfiles };
      });
      return;
    }

    // ---- Task graphs ----
    case 'task_graph:created':
    case 'task_graph:updated': {
      const tg = e.data;
      batchSet((prev) => ({ taskGraphs: { ...prev.taskGraphs, [asTaskGraphId(tg.id)]: tg } }));
      return;
    }
    case 'task_graph:deleted': {
      const { id } = e.data;
      batchSet((prev) => {
        const { [asTaskGraphId(id)]: _omit, ...taskGraphs } = prev.taskGraphs;
        return { taskGraphs };
      });
      return;
    }

    // ---- Non-entity signals (no store mutation) ----
    // notify:* → notification side-channel / push (Phase 5), never entity state.
    case 'notify:task_completed':
    case 'notify:task_failed':
    case 'notify:task_in_review':
    case 'notify:task_blocked':
    case 'notify:task_session_completed':
    case 'notify:task_session_failed':
    case 'notify:session_completed':
    case 'notify:session_failed':
    case 'notify:needs_input':
    case 'notify:progress':
    // Modal side-channel is Compass's; PTY injection is Pulse/Relay's.
    case 'session:modal':
    case 'session:modal_action':
    case 'session:modal_closed':
    case 'session:prompt_send':
    case 'spell:invoked':
      return;

    default:
      assertNever(e);
  }
}

// ---------------------------------------------------------------------------
// Public surface for Pulse
// ---------------------------------------------------------------------------

/** Reconcile a single immediate envelope. */
export function ingestEvent(event: WsEvent): void {
  reduce(event);
}

/** Reconcile a batched flush — every event coalesces under one queueMicrotask. */
export function ingestBatch(events: WsEvent[]): void {
  for (const event of events) reduce(event);
}

/**
 * WS onopen handshake. Re-fetch the active project's entities so a reconnect is
 * authoritative. Pulse calls this on every open; pass a projectId or let it read
 * the active one from uiStore.
 */
export function resyncProject(projectId?: string | null): Promise<void> {
  return fetchResyncProject(projectId ?? getActiveProjectId());
}
