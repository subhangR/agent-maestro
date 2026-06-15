import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectDocsPaginated } from '../hooks/useProjectDocsPaginated';
import { useUIStore } from '../stores/useUIStore';
import { useDocStatusStore } from '../stores/useDocStatusStore';
import { useSpacesStore } from '../stores/useSpacesStore';
import { useSessionStore } from '../stores/useSessionStore';
import { Icon } from './maestro/redesign/kit';

interface ProjectDocsListProps {
  projectId: string;
  kind: 'markdown' | 'diagram';
}

type DocSubTab = 'open' | 'done' | 'all';

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
  const createWhiteboard = useSpacesStore((s) => s.createWhiteboard);
  const setActiveId = useSessionStore((s) => s.setActiveId);
  const statuses = useDocStatusStore((s) => s.statuses);
  const setStatus = useDocStatusStore((s) => s.setStatus);
  const toggleDone = useDocStatusStore((s) => s.toggleDone);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [subTab, setSubTab] = useState<DocSubTab>('open');

  const statusOf = (id: string): 'open' | 'done' | 'closed' => statuses[id] ?? 'open';

  const openCount = useMemo(
    () => items.filter((d) => statusOf(d.id) === 'open').length,
    [items, statuses],
  );
  const doneCount = useMemo(
    () => items.filter((d) => statusOf(d.id) === 'done').length,
    [items, statuses],
  );

  const visible = useMemo(() => {
    if (subTab === 'all') return items;
    return items.filter((d) => statusOf(d.id) === subTab);
  }, [items, statuses, subTab]);

  // Keep loading more pages while a status-filtered tab has fewer items than a
  // screenful — otherwise filtering can leave the sub-tab looking empty even
  // though more matching docs exist further down the server list.
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

  const noun = kind === 'diagram' ? 'drawings' : 'documents';
  const isEmpty = !loading && visible.length === 0;
  const emptyLabel =
    subTab === 'open'
      ? `No open ${noun}.`
      : subTab === 'done'
      ? `No ${noun} marked done.`
      : `No ${noun} yet.`;

  const SUB_TABS: { id: DocSubTab; label: string; count: number | null }[] = [
    { id: 'open', label: 'Open', count: openCount },
    { id: 'done', label: 'Done', count: doneCount },
    { id: 'all', label: 'All', count: total },
  ];

  return (
    <div className="projectDocsListWrap">
      <div className="pn-subbar" role="tablist" aria-label={`${noun} filter`}>
        {SUB_TABS.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={subTab === id}
            className={`pn-subtab ${subTab === id ? 'pn-subtab--active' : ''}`}
            onClick={() => setSubTab(id)}
          >
            <span>{label}</span>
            {count != null && count > 0 && <span className="pn-tab-n">{count}</span>}
          </button>
        ))}
      </div>

      <div className="projectDocsList">
        {isEmpty && <div className="projectDocsListEmpty">{emptyLabel}</div>}

        {visible.map((doc) => {
          const status = statusOf(doc.id);
          const isDone = status === 'done';
          const meta = doc.sessionName
            ? `session: ${doc.sessionName}`
            : doc.taskId
            ? `task: ${doc.taskId.slice(0, 8)}…`
            : 'project';

          return (
            <div key={doc.id} className="projectDocsListItem">
              <button
                type="button"
                className={`pn-st__radio${isDone ? ' pn-st__radio--on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDone(doc.id);
                }}
                title={isDone ? 'Marked done — click to move back to Open' : 'Mark done — moves to the Done tab'}
                aria-pressed={isDone}
              >
                {isDone && <Icon name="check" size={10} sw={2.2} />}
              </button>

              <button
                type="button"
                className="projectDocsListItem__main"
                onClick={() => {
                  // Opening a closed doc returns it to the Open tab; viewing an
                  // open/done doc leaves its status untouched.
                  if (status === 'closed') setStatus(doc.id, 'open');
                  if (kind === 'diagram') {
                    // Diagrams open full-screen in the center as an Excalidraw
                    // whiteboard space — same as the "Draw" button — not in the
                    // doc overlay.
                    const id = createWhiteboard(projectId, doc.title, undefined, doc.id, doc.sessionId);
                    setActiveId(id);
                  } else {
                    setDocOverlay(doc);
                  }
                }}
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

              <button
                type="button"
                className="projectDocsListItem__close"
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus(doc.id, 'closed');
                }}
                title="Close — moves to the All tab"
                aria-label="Close"
              >
                <Icon name="x" size={11} sw={2} />
              </button>
            </div>
          );
        })}

        {loading && <div className="projectDocsListLoading">Loading…</div>}

        {!loading && !isEmpty && subTab === 'all' && total !== null && (
          <div className="projectDocsListCount">{total} total</div>
        )}

        {/* Scroll sentinel — triggers loadMore via IntersectionObserver */}
        {hasMore && <div ref={sentinelRef} className="projectDocsListSentinel" />}
      </div>
    </div>
  );
};
