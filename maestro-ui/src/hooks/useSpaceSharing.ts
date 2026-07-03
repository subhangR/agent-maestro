import { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { CollabSpace } from '../firebase/collabSpaceTypes';
import { SpaceTask, SpaceTeamMember, SpaceSpell } from '../firebase/spaceShareTypes';
import { SpaceTasksClient } from '../firebase/SpaceTasksClient';
import { SpaceTeamMembersClient } from '../firebase/SpaceTeamMembersClient';
import { SpaceSpellsClient } from '../firebase/SpaceSpellsClient';
import type { MaestroTask, Spell, TaskStatus } from '../app/types/maestro';
import type {
  SharedTaskInput,
  SharedTeamMemberInput,
  SharedSpellInput,
} from '../firebase/SpaceShareClient';
import type { SpaceTaskStatus } from '../firebase/spaceShareTypes';

/* ------------------------------------------------------------------ */
/*  Subscription hooks (loading / error / populated)                  */
/* ------------------------------------------------------------------ */

export interface SharedListState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  /** Force a re-subscribe after an error. */
  retry: () => void;
}

function useSharedList<T>(
  spaceId: string | null,
  subscribe: (
    spaceId: string,
    cb: (items: T[]) => void,
    onError?: (err: Error) => void,
  ) => () => void,
): SharedListState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!spaceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = subscribe(
      spaceId,
      (next) => {
        setItems(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message ?? 'Failed to load. Check your connection and retry.');
        setLoading(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, nonce]);

  return {
    items,
    loading,
    error,
    retry: () => setNonce((n) => n + 1),
  };
}

export function useSpaceTasks(spaceId: string | null): SharedListState<SpaceTask> {
  return useSharedList<SpaceTask>(spaceId, SpaceTasksClient.subscribe);
}

export function useSpaceTeamMembers(spaceId: string | null): SharedListState<SpaceTeamMember> {
  return useSharedList<SpaceTeamMember>(spaceId, SpaceTeamMembersClient.subscribe);
}

export function useSpaceSpells(spaceId: string | null): SharedListState<SpaceSpell> {
  return useSharedList<SpaceSpell>(spaceId, SpaceSpellsClient.subscribe);
}

/* ------------------------------------------------------------------ */
/*  Origin / identity resolution                                       */
/* ------------------------------------------------------------------ */

const ORIGIN_PALETTE = [
  '#7c9eff',
  '#f06767',
  '#ffc864',
  '#66ddaa',
  '#c084fc',
  '#4fd1c5',
  '#f6ad55',
  '#fc8181',
];

/** Deterministic per-uid accent color (members don't store a color). */
export function colorForUid(uid: string | null | undefined): string {
  if (!uid) return ORIGIN_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0;
  }
  return ORIGIN_PALETTE[Math.abs(hash) % ORIGIN_PALETTE.length];
}

export interface OriginIdentity {
  displayName: string;
  color: string;
}

/**
 * Resolve who published an entity from the space's denormalized member map.
 * Falls back gracefully when the source user has since left the space.
 */
export function resolveOrigin(
  space: CollabSpace,
  uid: string | null | undefined,
): OriginIdentity {
  const color = colorForUid(uid);
  if (!uid) return { displayName: 'Unknown', color };
  const member = space.members?.[uid];
  const displayName =
    member?.displayName?.trim() ||
    member?.email?.split('@')[0] ||
    'Former member';
  return { displayName, color };
}

/** Can the current user edit/delete this shared entity? (creator or space owner) */
export function canManageEntity(
  space: CollabSpace,
  currentUid: string | null | undefined,
  createdBy: string | null | undefined,
): boolean {
  if (!currentUid) return false;
  return currentUid === createdBy || currentUid === space.ownerId;
}

/* ------------------------------------------------------------------ */
/*  Relative time                                                      */
/* ------------------------------------------------------------------ */

export function formatRelative(ts: Timestamp | null | undefined): string {
  if (!ts || typeof (ts as Timestamp).toMillis !== 'function') return 'just now';
  const then = (ts as Timestamp).toMillis();
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

/* ------------------------------------------------------------------ */
/*  Local → shared input builders (Push / Publish)                     */
/* ------------------------------------------------------------------ */

/** Local task statuses map 1:1 onto space statuses except `archived`. */
export function localStatusToSpace(status: TaskStatus): SpaceTaskStatus {
  if (status === 'archived') return 'cancelled';
  return status;
}

export function buildTaskShareInput(task: MaestroTask): SharedTaskInput {
  return {
    title: task.title,
    description: task.description ?? '',
    status: localStatusToSpace(task.status),
    priority: task.priority,
    sourceTaskId: task.id,
    sourceProjectId: task.projectId,
  };
}

export function buildTeamMemberShareInput(tm: {
  id: string;
  projectId: string;
  name: string;
  role: string;
  identity: string;
  avatar?: string;
  model?: string;
  agentTool?: string;
  mode?: string;
  skillIds?: string[];
  commandPermissions?: { groups?: Record<string, boolean>; commands?: Record<string, boolean> };
}): SharedTeamMemberInput {
  return {
    name: tm.name,
    role: tm.role ?? '',
    identity: tm.identity ?? '',
    avatar: tm.avatar || null,
    model: tm.model ?? null,
    agentTool: tm.agentTool ?? null,
    mode: tm.mode ?? null,
    skillIds: tm.skillIds ?? [],
    commandPermissions: tm.commandPermissions ?? {},
    sourceTeamMemberId: tm.id,
    sourceProjectId: tm.projectId,
  };
}

/**
 * The new spell model is rule-based (no single `body`). Build a human-readable
 * preview body from the rules so the shared Preview stays useful, and default
 * the target `entityType` to `session`.
 */
export function buildSpellBody(spell: Spell): string {
  if (!spell.rules?.length) return spell.description ?? '';
  const lines = spell.rules.map((r) => {
    const trigger =
      r.trigger.type === 'hook'
        ? `on ${r.trigger.hookEvent}${r.trigger.matcher ? ` (${r.trigger.matcher})` : ''}`
        : 'on schedule';
    const action = r.action;
    let detail: string = action.type;
    if (action.type === 'inject-prompt' || action.type === 'feed-context') {
      detail = `${action.type}: ${action.prompt}`;
    } else if (action.type === 'run-command') {
      detail = `run-command: ${action.command}`;
    } else if (action.type === 'notify-channel') {
      detail = `notify-channel${action.channel ? `: ${action.channel}` : ''}`;
    } else if (action.type === 'continue-loop') {
      detail = `continue-loop${action.loopType ? `: ${action.loopType}` : ''}`;
    }
    const label = r.label ? `${r.label} — ` : '';
    return `• ${label}${trigger} → ${detail}${r.enabled ? '' : ' (disabled)'}`;
  });
  return lines.join('\n');
}

export function buildSpellShareInput(spell: Spell): SharedSpellInput {
  return {
    name: spell.name,
    description: spell.description ?? '',
    body: buildSpellBody(spell),
    entityType: 'session',
    icon: spell.icon ?? null,
    sourceSpellId: spell.id,
  };
}

/* ------------------------------------------------------------------ */
/*  Filtering helpers                                                   */
/* ------------------------------------------------------------------ */

export function useDebouncedValue<T>(value: T, ms = 120): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Stable helper so status labels stay consistent between filter + pill. */
export const SPACE_STATUS_LABELS: Record<SpaceTaskStatus, string> = {
  todo: 'todo',
  in_progress: 'in progress',
  in_review: 'in review',
  blocked: 'blocked',
  completed: 'completed',
  cancelled: 'cancelled',
};

export function useMemoizedIds(ids: string[] | undefined): Set<string> {
  return useMemo(() => new Set(ids ?? []), [ids]);
}
