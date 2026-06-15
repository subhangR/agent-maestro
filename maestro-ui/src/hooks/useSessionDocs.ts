import { useEffect, useMemo, useState } from "react";
import type { DocEntry, MaestroSession } from "../app/types/maestro";
import { maestroClient } from "../utils/MaestroClient";

/**
 * Returns docs for a session with content hydrated from the server.
 *
 * The session entity carried over the websocket has `docs` metadata only (no
 * file content), so rendering those directly leaves the DocViewer empty. This
 * fetches the hydrated session docs plus the docs of every task the session is
 * working on, merged and deduped by id. Refetches whenever the session's doc
 * set or task set changes.
 */
export function useSessionDocs(
  session: MaestroSession | null | undefined,
  enabled = true,
): DocEntry[] {
  const [docs, setDocs] = useState<DocEntry[]>([]);

  const signature = useMemo(() => {
    const docIds = (session?.docs ?? []).map((d) => d.id).sort().join(",");
    const taskIds = (session?.taskIds ?? []).slice().sort().join(",");
    return `${session?.id ?? ""}|${docIds}|${taskIds}`;
  }, [session?.id, session?.docs, session?.taskIds]);

  useEffect(() => {
    if (!enabled || !session?.id) {
      setDocs([]);
      return;
    }
    let cancelled = false;
    const sessionId = session.id;
    const taskIds = session.taskIds ?? [];

    (async () => {
      const results = await Promise.allSettled([
        maestroClient.getSessionDocs(sessionId),
        ...taskIds.map((taskId) => maestroClient.getTaskDocs(taskId)),
      ]);
      if (cancelled) return;
      const merged = new Map<string, DocEntry>();
      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const doc of result.value) merged.set(doc.id, doc);
        }
      }
      setDocs([...merged.values()].sort((a, b) => b.addedAt - a.addedAt));
    })();

    return () => {
      cancelled = true;
    };
  }, [signature, enabled]);

  return docs;
}
