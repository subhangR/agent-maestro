import React, { useEffect, useRef, useState } from "react";
import type { DocEntry } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { DocViewer } from "./DocViewer";
import { useSessionDocs } from "../../hooks/useSessionDocs";
import { isDiagramDoc } from "../../utils/docHelpers";
import { Icon } from "../Icon";

interface SessionDocsMenuProps {
  maestroSessionId: string;
}

/**
 * Docs/diagrams control for the bottom terminal strip. Renders a button that
 * opens a drop-UP menu (we're at the bottom of the pane) listing every doc and
 * diagram this session produced. Picking one opens it in an overlay over the
 * terminal; the terminal stays mounted underneath.
 */
export function SessionDocsMenu({ maestroSessionId }: SessionDocsMenuProps) {
  const session = useMaestroStore((s) => s.sessions[maestroSessionId]);
  const docs = useSessionDocs(session);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<DocEntry | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the open doc in sync with refetches (content may hydrate after open).
  useEffect(() => {
    if (!selected) return;
    const fresh = docs.find((d) => d.id === selected.id);
    if (!fresh) setSelected(null);
    else if (fresh !== selected) setSelected(fresh);
  }, [docs, selected]);

  // Close the dropdown on outside click / Escape; Escape also closes the doc.
  useEffect(() => {
    if (!menuOpen && !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) setSelected(null);
      else setMenuOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen, selected]);

  if (docs.length === 0) return null;

  return (
    <div className="termStripDocs" ref={rootRef}>
      <button
        type="button"
        className={`termStripActionBtn termStripDocsBtn ${menuOpen ? "termStripDocsBtn--open" : ""}`}
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Docs & diagrams from this session"
      >
        <Icon name="files" size={15} />
        <span className="termStripDocsCount">{docs.length}</span>
      </button>

      {menuOpen && (
        <div className="termStripDocsMenu" role="menu">
          <div className="termStripDocsMenuTitle">Docs &amp; Diagrams</div>
          {docs.map((doc) => {
            const diagram = isDiagramDoc(doc);
            return (
              <button
                type="button"
                key={doc.id}
                role="menuitem"
                className="termStripDocsItem"
                title={doc.title}
                onClick={() => {
                  setSelected(doc);
                  setMenuOpen(false);
                }}
              >
                <span className={`termStripDocsItemIcon ${diagram ? "termStripDocsItemIcon--diagram" : ""}`}>
                  {diagram ? "⬢" : "M↓"}
                </span>
                <span className="termStripDocsItemLabel">{doc.title}</span>
              </button>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
