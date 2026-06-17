// The single writer for optimistic entity edits. Generalizes maestro-ui's
// session `pendingLifecycle` (humanCompletedAt/archivedAt override) to arbitrary
// fields on any entity map, so Forge's inline edits and the WS echo share ONE
// setter path.
//
// Flow (Forge's shared/optimistic.ts wraps this):
//   1. optimisticPatch(mapKey, id, partial) — applies immediately to the store
//      AND records an override so an in-flight WS full-replace can't bounce the
//      value back while the server write is in flight. Returns a rollback token.
//   2. Forge issues the server PATCH (via Conduit).
//   3. on success → clearOptimistic(mapKey, id, ...fields)  (server is now truth)
//      on failure → rollback(token)                          (restore prior value)
//
// The ingest reducer calls applyOverrides() on every inbound entity so a stale
// server payload can't clobber an un-confirmed optimistic edit.
import type {
  Project,
  Task,
  TaskList,
  Session,
  TeamMember,
  Team,
  ModelProfile,
  TaskGraph,
  CustomPrompt,
} from '@/domain';
import { useEntityStore, type EntityState } from './entityStore';

export type EntityMapKey =
  | 'projects'
  | 'tasks'
  | 'taskLists'
  | 'sessions'
  | 'teamMembers'
  | 'teams'
  | 'modelProfiles'
  | 'taskGraphs'
  | 'customPrompts';

interface EntityValueMap {
  projects: Project;
  tasks: Task;
  taskLists: TaskList;
  sessions: Session;
  teamMembers: TeamMember;
  teams: Team;
  modelProfiles: ModelProfile;
  taskGraphs: TaskGraph;
  customPrompts: CustomPrompt;
}

export interface OptimisticToken {
  mapKey: EntityMapKey;
  id: string;
  fields: string[];
  /** Prior values of the patched fields, for rollback. */
  prev: Record<string, unknown>;
}

// Active overrides keyed `${mapKey}:${id}` → the forced field values. Applied to
// every inbound entity of that (kind,id) until confirmed/cleared.
const overrides = new Map<string, Record<string, unknown>>();

const keyOf = (mapKey: EntityMapKey, id: string) => `${mapKey}:${id}`;

function writeEntity(mapKey: EntityMapKey, id: string, next: Record<string, unknown>): void {
  useEntityStore.setState((s) => {
    const map = s[mapKey] as Record<string, unknown>;
    return { [mapKey]: { ...map, [id]: next } } as Partial<EntityState>;
  });
}

function readEntity(mapKey: EntityMapKey, id: string): Record<string, unknown> | undefined {
  const map = useEntityStore.getState()[mapKey] as Record<string, unknown>;
  return map[id] as Record<string, unknown> | undefined;
}

/**
 * Apply an optimistic patch immediately + record the override. No-op (returns
 * null) if the entity isn't in the store. Returns a token to rollback with.
 */
export function optimisticPatch<K extends EntityMapKey>(
  mapKey: K,
  id: string,
  partial: Partial<EntityValueMap[K]>,
): OptimisticToken | null {
  const existing = readEntity(mapKey, id);
  if (!existing) return null;

  const patch = partial as Record<string, unknown>;
  const fields = Object.keys(patch);
  const prev: Record<string, unknown> = {};
  for (const f of fields) prev[f] = existing[f];

  const okey = keyOf(mapKey, id);
  overrides.set(okey, { ...(overrides.get(okey) ?? {}), ...patch });
  writeEntity(mapKey, id, { ...existing, ...patch });

  return { mapKey, id, fields, prev };
}

/** Roll back a failed optimistic patch — restore prior field values + drop the override. */
export function rollback(token: OptimisticToken): void {
  const okey = keyOf(token.mapKey, token.id);
  const override = overrides.get(okey);
  if (override) {
    for (const f of token.fields) delete override[f];
    if (Object.keys(override).length === 0) overrides.delete(okey);
  }
  const existing = readEntity(token.mapKey, token.id);
  if (existing) writeEntity(token.mapKey, token.id, { ...existing, ...token.prev });
}

/**
 * Clear an override once the server confirms (so the next inbound payload is
 * authoritative). Omit `fields` to clear the whole override for that entity.
 */
export function clearOptimistic(mapKey: EntityMapKey, id: string, ...fields: string[]): void {
  const okey = keyOf(mapKey, id);
  const override = overrides.get(okey);
  if (!override) return;
  if (fields.length === 0) {
    overrides.delete(okey);
    return;
  }
  for (const f of fields) delete override[f];
  if (Object.keys(override).length === 0) overrides.delete(okey);
}

/**
 * Re-apply any active override on top of an inbound entity before it lands in
 * the map. Called by the ingest reducer + fetch actions so a stale server
 * payload can't undo an un-confirmed optimistic edit.
 */
export function applyOverrides<T extends object>(mapKey: EntityMapKey, id: string, entity: T): T {
  const override = overrides.get(keyOf(mapKey, id));
  return override ? { ...entity, ...override } : entity;
}

/** Test seam: drop all overrides. */
export function __clearAllOverrides(): void {
  overrides.clear();
}
