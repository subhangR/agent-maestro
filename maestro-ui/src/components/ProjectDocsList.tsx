import React, { useEffect, useRef } from 'react';
import { useProjectDocsPaginated } from '../hooks/useProjectDocsPaginated';
import { useUIStore } from '../stores/useUIStore';
import { useOpenDiagram } from '../hooks/useOpenDiagram';
import { isDiagramDoc } from '../utils/docHelpers';

interface ProjectDocsListProps {
  projectId: string;
  kind: 'markdown' | 'diagram';
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const ProjectDocsList: React.FC<ProjectDocsListProps> = ({ projectId, kind }) => {
  const { items, loading, hasMore, loadMore, total } = useProjectDocsPaginated(projectId, kind);
  const setDocOverlay = useUIStore((s) => s.setDocOverlay);
  const openDiagram = useOpenDiagram();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const isEmpty = !loading && items.length === 0;
  const emptyLabel = kind === 'diagram' ? 'drawings' : 'documents';

  return (
    <div className="projectDocsList">
      {isEmpty && (
        <div className="projectDocsListEmpty">No {emptyLabel} yet.</div>
      )}

      {items.map((doc) => {
        const meta = doc.sessionName
          ? `session: ${doc.sessionName}`
          : doc.taskId
          ? `task: ${doc.taskId.slice(0, 8)}…`
          : 'project';

        return (
          <button
            key={doc.id}
            type="button"
            className="projectDocsListItem"
            onClick={() => (isDiagramDoc(doc) ? openDiagram(doc, projectId) : setDocOverlay(doc))}
          >
            <span className="projectDocsListItem__icon" aria-hidden="true">
              {kind === 'diagram' ? '⬡' : 'M↓'}
            </span>
            <span className="projectDocsListItem__body">
              <span className="projectDocsListItem__title">{doc.title}</span>
              <span className="projectDocsListItem__meta">{meta}</span>
            </span>
            <span className="projectDocsListItem__time">{formatTimeAgo(doc.addedAt)}</span>
          </button>
        );
      })}

      {loading && (
        <div className="projectDocsListLoading">Loading…</div>
      )}

      {!loading && !isEmpty && total !== null && (
        <div className="projectDocsListCount">{total} total</div>
      )}

      {/* Scroll sentinel — triggers loadMore via IntersectionObserver */}
      {hasMore && <div ref={sentinelRef} className="projectDocsListSentinel" />}
    </div>
  );
};
