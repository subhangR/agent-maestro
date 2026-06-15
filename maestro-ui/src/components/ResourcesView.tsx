import React, { useCallback, useEffect, useMemo, useState } from "react";
import { maestroClient } from "../utils/MaestroClient";
import { useMaestroStore } from "../stores/useMaestroStore";
import { useSpacesStore } from "../stores/useSpacesStore";
import { useSessionStore } from "../stores/useSessionStore";
import { useUIStore } from "../stores/useUIStore";
import type { DocEntry, TaskImage, MaestroTask } from "../app/types/maestro";
import { isDiagramDoc } from "../utils/docHelpers";

type ResourceType = "all" | "docs" | "diagrams" | "images";

interface ImageResource {
  kind: "image";
  image: TaskImage;
  task: MaestroTask;
  imageUrl: string;
}

interface DocResource {
  kind: "doc" | "diagram";
  doc: DocEntry;
}

type Resource = DocResource | ImageResource;

function DocIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
      <path d="M4 1.5h5l3 3v9a.5.5 0 01-.5.5h-7A.5.5 0 014 13.5V2a.5.5 0 010-1.5z" />
      <path d="M9 1.5V5h3" />
      <path d="M6 8h4M6 10.5h3" strokeLinecap="round" />
    </svg>
  );
}

function DiagramIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
      <path d="M8 2l1.5 2.6h3L10.5 7l1 3L8 8.6 4.5 10l1-3L3.5 4.6h3z" strokeLinejoin="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <circle cx="5.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <path d="M1.5 11l3.5-3 2.5 2.5 2-1.5 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const ResourcesView: React.FC<{
  projectId: string;
}> = ({ projectId }) => {
  const [typeFilter, setTypeFilter] = useState<ResourceType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectDocs, setProjectDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const tasks = useMaestroStore((s) => s.tasks);
  const createWhiteboard = useSpacesStore((s) => s.createWhiteboard);
  const setActiveId = useSessionStore((s) => s.setActiveId);
  const setDocOverlay = useUIStore((s) => s.setDocOverlay);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    maestroClient.getProjectDocs(projectId).then((docs) => {
      if (!cancelled) {
        setProjectDocs(docs);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const projectTasks = useMemo(
    () => Object.values(tasks).filter((t) => t.projectId === projectId),
    [tasks, projectId],
  );

  const allResources = useMemo<Resource[]>(() => {
    const docs: DocResource[] = projectDocs.map((doc) => ({
      kind: isDiagramDoc(doc) ? "diagram" : "doc",
      doc,
    }));

    const images: ImageResource[] = projectTasks.flatMap((task) =>
      (task.images ?? []).map((img) => ({
        kind: "image" as const,
        image: img,
        task,
        imageUrl: maestroClient.getTaskImageUrl(task.id, img.id),
      })),
    );

    return [...docs, ...images];
  }, [projectDocs, projectTasks]);

  const filtered = useMemo(() => {
    let list = allResources;
    if (typeFilter !== "all") {
      list = list.filter((r) => r.kind === (typeFilter === "images" ? "image" : typeFilter === "diagrams" ? "diagram" : "doc"));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => {
        if (r.kind === "image") return r.image.filename.toLowerCase().includes(q);
        return r.doc.title.toLowerCase().includes(q);
      });
    }
    return list;
  }, [allResources, typeFilter, searchQuery]);

  const handleOpen = useCallback((resource: Resource) => {
    if (resource.kind === "image") {
      setPreviewImage(resource.imageUrl);
      return;
    }
    if (resource.kind === "diagram") {
      const id = createWhiteboard(
        projectId,
        resource.doc.title,
        undefined,
        resource.doc.id,
        resource.doc.sessionId,
      );
      setActiveId(id);
    } else {
      setDocOverlay(resource.doc);
    }
  }, [projectId, createWhiteboard, setDocOverlay]);

  const docCount = allResources.filter((r) => r.kind === "doc").length;
  const diagramCount = allResources.filter((r) => r.kind === "diagram").length;
  const imageCount = allResources.filter((r) => r.kind === "image").length;

  return (
    <div className="resourcesView" data-testid="resources-view">
      <div className="resourcesViewSearch">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13" className="resourcesViewSearchIcon">
          <circle cx="6.5" cy="6.5" r="4" />
          <path d="M10 10l3 3" strokeLinecap="round" />
        </svg>
        <input
          className="resourcesViewSearchInput"
          placeholder="Search resources…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="resources-search"
        />
      </div>

      <div className="resourcesViewFilters" data-testid="resources-filters">
        {(["all", "docs", "diagrams", "images"] as ResourceType[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`resourcesViewFilter ${typeFilter === f ? "resourcesViewFilter--active" : ""}`}
            onClick={() => setTypeFilter(f)}
            data-filter={f}
          >
            {f === "all" ? `All (${allResources.length})` :
             f === "docs" ? `Docs (${docCount})` :
             f === "diagrams" ? `Diagrams (${diagramCount})` :
             `Images (${imageCount})`}
          </button>
        ))}
      </div>

      <div className="resourcesViewList" data-testid="resources-list">
        {loading && (
          <div className="resourcesViewEmpty">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="resourcesViewEmpty">
            {allResources.length === 0 ? "No resources yet." : "No matches."}
          </div>
        )}
        {!loading && filtered.map((resource, i) => {
          if (resource.kind === "image") {
            return (
              <button
                key={`${resource.task.id}-${resource.image.id}`}
                type="button"
                className="resourcesViewItem"
                onClick={() => handleOpen(resource)}
                data-testid="resource-item"
                data-kind="image"
              >
                <span className="resourcesViewItemIcon resourcesViewItemIcon--image">
                  <ImageIcon />
                </span>
                <span className="resourcesViewItemBody">
                  <span className="resourcesViewItemTitle">{resource.image.filename}</span>
                  <span className="resourcesViewItemMeta">
                    task: {resource.task.title}
                  </span>
                </span>
                <span className="resourcesViewItemBadge resourcesViewItemBadge--image">Image</span>
              </button>
            );
          }
          const isDiagram = resource.kind === "diagram";
          return (
            <button
              key={resource.doc.id ?? i}
              type="button"
              className="resourcesViewItem"
              onClick={() => handleOpen(resource)}
              data-testid="resource-item"
              data-kind={resource.kind}
            >
              <span className={`resourcesViewItemIcon resourcesViewItemIcon--${resource.kind}`}>
                {isDiagram ? <DiagramIcon /> : <DocIcon />}
              </span>
              <span className="resourcesViewItemBody">
                <span className="resourcesViewItemTitle">{resource.doc.title}</span>
                <span className="resourcesViewItemMeta">
                  {resource.doc.sessionName
                    ? `session: ${resource.doc.sessionName}`
                    : resource.doc.sessionId
                    ? `session: ${resource.doc.sessionId.slice(0, 8)}…`
                    : resource.doc.taskId
                    ? `task: ${resource.doc.taskId.slice(0, 8)}…`
                    : "project"}
                </span>
              </span>
              <span className={`resourcesViewItemBadge resourcesViewItemBadge--${resource.kind}`}>
                {isDiagram ? "Diagram" : "Doc"}
              </span>
            </button>
          );
        })}
      </div>

      {previewImage && (
        <div
          className="resourcesImageOverlay"
          onClick={() => setPreviewImage(null)}
          data-testid="image-preview-overlay"
        >
          <img
            src={previewImage}
            alt="Preview"
            className="resourcesImageOverlayImg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="resourcesImageOverlayClose"
            onClick={() => setPreviewImage(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
