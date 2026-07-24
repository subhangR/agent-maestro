import { useMemo } from "react";
import Fuse, { IFuseOptions } from "fuse.js";
import type { MaestroTask } from "../app/types/maestro";

const FUSE_OPTIONS: IFuseOptions<MaestroTask> = {
  keys: [
    { name: "title", weight: 0.4 },
    { name: "description", weight: 0.3 },
    { name: "initialPrompt", weight: 0.15 },
    { name: "status", weight: 0.1 },
    { name: "priority", weight: 0.05 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
};

/**
 * Hook that creates a Fuse.js search index for tasks and returns
 * a set of matching task IDs for the given query.
 *
 * The index is only built while a query is active — tasks update on every
 * WebSocket tick, and unconditionally re-indexing the full task list each
 * tick was measurable jank even when the search box was empty.
 */
export function useTaskSearch(tasks: MaestroTask[], query: string): Set<string> | null {
  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  const fuse = useMemo(
    () => (hasQuery ? new Fuse(tasks, FUSE_OPTIONS) : null),
    [tasks, hasQuery],
  );

  const matchingIds = useMemo(() => {
    if (!fuse || !trimmed) return null; // null = no filter, show all
    const results = fuse.search(trimmed);
    return new Set(results.map((r) => r.item.id));
  }, [fuse, trimmed]);

  return matchingIds;
}
