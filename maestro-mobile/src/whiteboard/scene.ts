// Scene helpers — pure, dependency-free. Mirrors DocsViewer's detection so the
// editable whiteboard and the read-only viewer agree on what an Excalidraw doc is.
import type { DocEntry } from '@/domain';

/** Is this string an Excalidraw scene JSON? (`type:'excalidraw'` or an elements[]). */
export function isExcalidrawSceneJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parsed?.type === 'excalidraw' || Array.isArray(parsed?.elements);
  } catch {
    return false;
  }
}

/** Resolve the doc's editable content string (inline `content`, else empty). */
export function docContent(doc: DocEntry): string {
  return doc.content ?? '';
}

/**
 * Pick the scene doc to edit from a doc list: the one matching `docId` when
 * given, else the first doc that parses as an Excalidraw scene (or, failing
 * that, the first 'diagram'-kind doc).
 */
export function pickSceneDoc(docs: DocEntry[], docId?: string): DocEntry | undefined {
  if (docId != null) return docs.find((d) => d.id === docId);
  return (
    docs.find((d) => isExcalidrawSceneJson(docContent(d))) ??
    docs.find((d) => d.kind === 'diagram')
  );
}

/** An empty Excalidraw scene (used when creating a brand-new whiteboard doc). */
export const EMPTY_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: 'maestro-mobile',
  elements: [],
  appState: {},
  files: {},
});
