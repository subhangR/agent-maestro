import React, { useEffect, useState } from "react";
import type { DocEntry, MaestroSession } from "../../app/types/maestro";
import { DocViewer } from "./DocViewer";
import { useSessionDocs } from "../../hooks/useSessionDocs";
import { isDiagramDoc } from "../../utils/docHelpers";

interface SessionDocsBarProps {
  session: MaestroSession | null | undefined;
}

/**
 * Floating tab strip pinned to the top of the terminal pane. Lists the docs and
 * diagrams produced by the active session (and the tasks it works on). Clicking
 * a tab opens the doc in an overlay over the terminal; the terminal stays
 * mounted underneath.
 */
export const SessionDocsBar = React.memo(function SessionDocsBar({ session }: SessionDocsBarProps) {
  const docs = useSessionDocs(session);
  const [selected, setSelected] = useState<DocEntry | null>(null);

  // Keep the open doc in sync with refetches (content may hydrate after open).
  useEffect(() => {
    if (!selected) return;
    const fresh = docs.find((d) => d.id === selected.id);
    if (!fresh) {
      setSelected(null);
    } else if (fresh !== selected) {
      setSelected(fresh);
    }
  }, [docs, selected]);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  if (docs.length === 0) return null;

  return (
    <>
      <div className="sessionDocsBar" role="tablist" aria-label="Session documents">
        {docs.map((doc) => {
          const isActive = selected?.id === doc.id;
          return (
            <button
              type="button"
              key={doc.id}
              role="tab"
              aria-selected={isActive}
              className={`sessionDocsTab ${isActive ? "sessionDocsTab--active" : ""}`}
              title={doc.title}
              onClick={() => setSelected((prev) => (prev?.id === doc.id ? null : doc))}
            >
              <span className="sessionDocsTabIcon">{isDiagramDoc(doc) ? "⬢" : "M↓"}</span>
              <span className="sessionDocsTabLabel">{doc.title}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="sessionDocsOverlay">
          <button
            type="button"
            className="sessionDocsOverlayClose"
            onClick={() => setSelected(null)}
            title="Close (Esc)"
            aria-label="Close document"
          >
            {"✕"}
          </button>
          <DocViewer doc={selected} inline onClose={() => setSelected(null)} />
        </div>
      )}
    </>
  );
});
