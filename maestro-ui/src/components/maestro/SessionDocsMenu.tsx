import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DocEntry } from "../../app/types/maestro";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { useUIStore } from "../../stores/useUIStore";
import { useSessionDocs } from "../../hooks/useSessionDocs";
import { isDiagramDoc } from "../../utils/docHelpers";

interface SessionDocsMenuProps {
  maestroSessionId: string;
}

type Group = "docs" | "diagrams";

const GROUP_ICON: Record<Group, string> = { docs: "M↓", diagrams: "⬢" };
const GROUP_LABEL: Record<Group, string> = { docs: "Docs", diagrams: "Diagrams" };

/**
 * Compact docs/diagrams control for the bottom terminal strip. Instead of one
 * tab per doc (which grew the strip vertically), this renders two fixed-size
 * chips — an icon + count for docs and one for diagrams. Clicking a chip opens
 * a portal dropdown listing that group's items; clicking an item opens it in the
 * shared doc overlay — the same path the task tile uses — so diagrams render
 * with their scene content. Clicking the open item again closes the overlay.
 * Empty groups hide their chip, so the strip stays a constant height.
 */
export function SessionDocsMenu({ maestroSessionId }: SessionDocsMenuProps) {
  const session = useMaestroStore((s) => s.sessions[maestroSessionId]);
  const docs = useSessionDocs(session);
  const docOverlay = useUIStore((s) => s.docOverlay);
  const setDocOverlay = useUIStore((s) => s.setDocOverlay);

  const [open, setOpen] = useState<Group | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const docsBtnRef = useRef<HTMLButtonElement>(null);
  const diagramsBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { plainDocs, diagrams } = useMemo(() => {
    const plainDocs: DocEntry[] = [];
    const diagrams: DocEntry[] = [];
    for (const doc of docs) (isDiagramDoc(doc) ? diagrams : plainDocs).push(doc);
    return { plainDocs, diagrams };
  }, [docs]);

  const btnFor = (group: Group) => (group === "docs" ? docsBtnRef : diagramsBtnRef);

  const openMenu = useCallback((group: Group) => {
    setOpen((prev) => {
      if (prev === group) return null;
      const rect = btnFor(group).current?.getBoundingClientRect();
      if (rect) {
        const MENU_MAX = 300;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < MENU_MAX && rect.top > spaceBelow;
        setMenuStyle({
          position: "fixed",
          left: rect.left,
          ...(openUp
            ? { bottom: window.innerHeight - rect.top + 4 }
            : { top: rect.bottom + 4 }),
        });
      }
      return group;
    });
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (docsBtnRef.current?.contains(target)) return;
      if (diagramsBtnRef.current?.contains(target)) return;
      setOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (docs.length === 0) return null;

  const items = open === "docs" ? plainDocs : open === "diagrams" ? diagrams : [];

  const renderChip = (group: Group, groupDocs: DocEntry[]) => {
    if (groupDocs.length === 0) return null;
    const isOpen = open === group;
    const hasActive = groupDocs.some((d) => d.id === docOverlay?.id);
    return (
      <button
        type="button"
        ref={btnFor(group)}
        className={`termStripDocChip${isOpen ? " termStripDocChip--open" : ""}${hasActive ? " termStripDocChip--active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={`${groupDocs.length} ${GROUP_LABEL[group].toLowerCase()}`}
        onClick={() => openMenu(group)}
      >
        <span className="termStripDocChipIcon">{GROUP_ICON[group]}</span>
        <span className="termStripDocChipCount">{groupDocs.length}</span>
      </button>
    );
  };

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            className="termStripDocMenu"
            style={menuStyle}
            role="menu"
            aria-label={`${GROUP_LABEL[open]} from this session`}
          >
            {items.map((doc) => {
              const diagram = isDiagramDoc(doc);
              const active = docOverlay?.id === doc.id;
              return (
                <button
                  type="button"
                  key={doc.id}
                  role="menuitem"
                  className={`termStripDocMenuItem${active ? " termStripDocMenuItem--active" : ""}`}
                  title={doc.title}
                  onClick={() => {
                    setDocOverlay(active ? null : doc);
                    setOpen(null);
                  }}
                >
                  <span className="termStripDocMenuItemIcon">{diagram ? "⬢" : "M↓"}</span>
                  <span className="termStripDocMenuItemLabel">{doc.title}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="termStripDocChips" aria-label="Docs & diagrams from this session">
      {renderChip("docs", plainDocs)}
      {renderChip("diagrams", diagrams)}
      {menu}
    </div>
  );
}
