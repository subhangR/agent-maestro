// Shared doc-kind helpers for the docs browsing surfaces (session tab, task tab,
// project browser, and the full-screen viewer). Resolves a DocEntry to a short
// kind chip label and a filter bucket. Content-aware when content is hydrated
// (a 'diagram' can be mermaid OR excalidraw); falls back to the server `kind`.
import type { DocEntry } from '@/domain';

import { detectDocKind, type DocContentKind } from './DocsViewer';

/** Coarse kind used for filtering the project browser. */
export type DocFilterKind = 'markdown' | 'mermaid' | 'excalidraw';

/** Short chip label for a doc (MD / Mermaid / Excalidraw). */
export function docKindLabel(doc: Pick<DocEntry, 'kind' | 'content'>): string {
  const k = resolveDocKind(doc);
  return k === 'markdown' ? 'MD' : k === 'mermaid' ? 'Mermaid' : 'Excalidraw';
}

/** Resolve a DocEntry to a concrete content kind (content-aware when hydrated). */
export function resolveDocKind(doc: Pick<DocEntry, 'kind' | 'content'>): DocContentKind {
  if (doc.content != null && doc.content.trim().length > 0) {
    return detectDocKind(doc.content, doc.kind);
  }
  return doc.kind === 'diagram' ? 'excalidraw' : 'markdown';
}

/** A stable creation-time label (locale short date) for list rows. */
export function docDateLabel(addedAt: number | undefined): string {
  if (addedAt == null) return '';
  return new Date(addedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
