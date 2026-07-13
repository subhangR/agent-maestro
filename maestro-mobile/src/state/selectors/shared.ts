// Shared selector primitives. Pure — no React, no store import — so they're
// unit-testable against a plain EntityState.
import type { EntityState } from '../entityStore';

export type { EntityState };

interface ProjectScoped {
  id: string;
  projectId: string;
}

/**
 * Return a project's entities in canonical order: ids from the ordering array
 * first (in order), then any remaining project entities not yet in the ordering
 * (so a freshly-created entity shows up before the next ordering refresh).
 */
export function orderedForProject<T extends ProjectScoped>(
  map: Record<string, T>,
  order: readonly string[] | undefined,
  projectId: string,
): T[] {
  const all = Object.values(map).filter((e) => e.projectId === projectId);
  if (!order || order.length === 0) return all;
  const byId = new Map(all.map((e) => [e.id, e] as const));
  const result: T[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const e = byId.get(id);
    if (e) {
      result.push(e);
      seen.add(id);
    }
  }
  for (const e of all) if (!seen.has(e.id)) result.push(e);
  return result;
}
