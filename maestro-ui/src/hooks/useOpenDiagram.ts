import { useCallback } from "react";
import { useSpacesStore } from "../stores/useSpacesStore";
import { useSessionStore } from "../stores/useSessionStore";
import type { DocEntry } from "../app/types/maestro";
import type { WhiteboardSpace } from "../app/types/space";

/**
 * Opens a `.excalidraw` diagram doc on the Excalidraw whiteboard (a Spaces
 * canvas) rather than in the doc-viewer overlay. Reuses an existing board for
 * the same doc instead of stacking duplicate tabs, mirroring how
 * `openDocument` dedupes document spaces.
 */
export function useOpenDiagram(): (doc: DocEntry, projectId: string) => void {
  const spaces = useSpacesStore((s) => s.spaces);
  const createWhiteboard = useSpacesStore((s) => s.createWhiteboard);
  const setActiveId = useSessionStore((s) => s.setActiveId);

  return useCallback(
    (doc: DocEntry, projectId: string) => {
      const existing = spaces.find(
        (s): s is WhiteboardSpace => s.type === "whiteboard" && s.docId === doc.id,
      );
      const id = existing
        ? existing.id
        : createWhiteboard(projectId, doc.title, undefined, doc.id, doc.sessionId);
      setActiveId(id);
    },
    [spaces, createWhiteboard, setActiveId],
  );
}
