// Local docs port for the whiteboard module.
//
// WHY THIS EXISTS: a small, documented narrowing of the wired REST client to the
// exact docs surface the whiteboard consumes. The public `MaestroClientApi` seam
// (`@/state` → getMaestroClient) now exposes the docs methods (added by Ledger),
// so `WhiteboardDocsClient` is a structural SUBSET of the seam and the client is
// assignable to it with NO cast. Keeping the local interface keeps the module's
// dependency on the seam explicit and minimal; it can be deleted entirely if you
// prefer to consume `MaestroClientApi` directly.
import { getMaestroClient } from '@/state';
import type { DocEntry } from '@/domain';

/** The slice of the REST client the whiteboard reads/writes for scene docs. */
export interface WhiteboardDocsClient {
  getSessionDocs(sessionId: string): Promise<DocEntry[]>;
  getTaskDocs(taskId: string): Promise<DocEntry[]>;
  getProjectDocs(projectId: string): Promise<DocEntry[]>;
  addSessionDoc(
    sessionId: string,
    title: string,
    content: string,
    kind?: 'markdown' | 'diagram',
  ): Promise<DocEntry>;
  addTaskDoc(
    taskId: string,
    sessionId: string,
    title: string,
    content: string,
    kind?: 'markdown' | 'diagram',
  ): Promise<DocEntry>;
  // updateDocContent always routes through /sessions/:id/docs/:docId/content on
  // the server, so the owning session id is required even for task/project docs.
  updateDocContent(sessionId: string, docId: string, content: string): Promise<DocEntry>;
}

/**
 * The wired client, narrowed to the docs surface. Throws (via getMaestroClient)
 * if called before app-boot wiring — callers should gate on `hasMaestroClient()`.
 */
export function getDocsClient(): WhiteboardDocsClient {
  // MaestroClientApi now declares these methods, so it's assignable to the
  // narrower WhiteboardDocsClient with no cast.
  return getMaestroClient();
}
