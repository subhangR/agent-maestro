import type { MaestroSession } from '../app/types/maestro';

// The sub-tabs shown in the Spaces panel Agents view.
// 'open' | 'done' | 'archived' are project-scoped and resolved by
// resolveSessionTab() from persisted server fields. 'huddles' is a
// cross-project virtual tab — no session resolves to it; the view fetches
// huddles from GET /api/huddles instead.
export type SessionSubTab = 'open' | 'done' | 'archived' | 'huddles';

// The tab a session (tree root) belongs to.
// Driven purely by two persisted server fields — no local terminal state needed.
// Archived (archivedAt) always wins. Done (humanCompletedAt) is next.
// Everything else is Open (default for new sessions).
// Liveness (live dot) is decoration within tabs, not a routing criterion.
// 'huddles' is excluded — it's a virtual tab that no session resolves to.
export type SessionLifecycleTab = Exclude<SessionSubTab, 'huddles'>;

export function resolveSessionTab(
  session: Pick<MaestroSession, 'archivedAt' | 'humanCompletedAt'>,
): SessionLifecycleTab {
  if (session.archivedAt) return 'archived';
  if (session.humanCompletedAt) return 'done';
  return 'open';
}

// Build a parentSessionId → child ids index for the given sessions.
export function buildChildrenByParent(
  sessions: Array<{ id: string; parentSessionId?: string | null }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of sessions) {
    const pid = s.parentSessionId;
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(s.id);
  }
  return map;
}

// All session ids in the spawn subtree rooted at rootId (inclusive). Cycle-safe.
export function collectSubtreeIds(
  rootId: string,
  childrenByParent: Map<string, string[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    const kids = childrenByParent.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}
