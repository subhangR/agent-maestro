import type { DocEntry } from "../app/types/maestro";

/**
 * A doc is a diagram when explicitly tagged `kind === 'diagram'` OR when its
 * file ends in `.excalidraw`. The extension fallback matters because docs that
 * flow through session/task timelines often arrive without `kind` set, and
 * without it they'd wrongly render as raw JSON instead of on the board.
 */
export function isDiagramDoc(doc: Pick<DocEntry, "kind" | "filePath">): boolean {
  return doc.kind === "diagram" || !!doc.filePath?.toLowerCase().endsWith(".excalidraw");
}
