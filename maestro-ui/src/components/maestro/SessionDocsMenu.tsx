import { useMaestroStore } from "../../stores/useMaestroStore";
import { useUIStore } from "../../stores/useUIStore";
import { useSessionDocs } from "../../hooks/useSessionDocs";
import { isDiagramDoc } from "../../utils/docHelpers";

interface SessionDocsMenuProps {
  maestroSessionId: string;
}

/**
 * Inline docs/diagrams tabs for the bottom terminal strip. Renders one tab per
 * doc and diagram this session produced (its own docs + docs of the tasks it's
 * working on, hydrated with content). Clicking a tab opens it in the shared
 * doc overlay — the same path the task tile uses — so diagrams render with their
 * scene content. Clicking the active tab again closes the overlay.
 */
export function SessionDocsMenu({ maestroSessionId }: SessionDocsMenuProps) {
  const session = useMaestroStore((s) => s.sessions[maestroSessionId]);
  const docs = useSessionDocs(session);
  const docOverlay = useUIStore((s) => s.docOverlay);
  const setDocOverlay = useUIStore((s) => s.setDocOverlay);

  if (docs.length === 0) return null;

  return (
    <div className="termStripDocTabs" role="tablist" aria-label="Docs & diagrams from this session">
      {docs.map((doc) => {
        const diagram = isDiagramDoc(doc);
        const active = docOverlay?.id === doc.id;
        return (
          <button
            type="button"
            key={doc.id}
            role="tab"
            aria-selected={active}
            className={`termStripDocTab${diagram ? " termStripDocTab--diagram" : ""}${active ? " termStripDocTab--active" : ""}`}
            title={doc.title}
            onClick={() => setDocOverlay(active ? null : doc)}
          >
            <span className="termStripDocTabIcon">{diagram ? "⬢" : "M↓"}</span>
            <span className="termStripDocTabLabel">{doc.title}</span>
          </button>
        );
      })}
    </div>
  );
}
