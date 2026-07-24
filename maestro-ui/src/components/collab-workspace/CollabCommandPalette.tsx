import React, { useEffect, useMemo, useState } from "react";
import { EntityGlyph } from "./EntityPrimitives";
import type { EntityDetail } from "./types";
import "./CollabFullViews.css";

const FUTURE_COMMANDS = [
    { title: "Create task in…", description: "Use the workspace New task action." },
    { title: "Link entities", description: "Use graph handles or placement targets." },
    { title: "Pull or re-pull", description: "Open an entity with pull capability." },
];

export interface CollabCommandPaletteProps {
    open: boolean;
    entities: Record<string, EntityDetail>;
    contextEntity?: EntityDetail;
    onOpenChange: (open: boolean) => void;
    onNavigate: (entityId: string) => void;
}

/**
 * The static command-palette seam. It is useful before search/action endpoints
 * ship, while clearly separating browsable known entities from future commands.
 */
export function CollabCommandPalette({ open, entities, contextEntity, onOpenChange, onNavigate }: CollabCommandPaletteProps) {
    const [query, setQuery] = useState("");
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onOpenChange(false); };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onOpenChange]);
    const results = useMemo(() => Object.values(entities).filter((entity) => `${entity.title} ${entity.kind}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8), [entities, query]);
    if (!open) return null;
    return <div className="collabCommandPaletteBackdrop" role="presentation" onMouseDown={() => onOpenChange(false)}>
        <section className="collabCommandPalette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
            <header><span>⌘K</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={contextEntity ? `Search from ${contextEntity.title}` : "Search known entities"} aria-label="Search known entities" /><button type="button" onClick={() => onOpenChange(false)} aria-label="Close command palette">×</button></header>
            {contextEntity ? <p className="collabCommandContext">Context: <strong>{contextEntity.title}</strong> · actions will apply here when enabled.</p> : null}
            <section><h3>Go to</h3>{results.length ? results.map((entity) => <button type="button" key={entity.id} className="collabCommandEntity" onClick={() => { onNavigate(entity.id); onOpenChange(false); }}><EntityGlyph kind={entity.kind} /><span>{entity.title}<small>{entity.kind.replace(/_/g, " ")}</small></span><kbd>↵</kbd></button>) : <p className="collabEmptyCopy">No known entity matches “{query}”.</p>}</section>
            <section><h3>Future actions</h3>{FUTURE_COMMANDS.map((command) => <button type="button" className="collabCommandFuture" key={command.title} disabled title={command.description}><span>{command.title}</span><small>{command.description}</small><em>Use workspace</em></button>)}</section>
            <footer>Navigation uses entities already loaded in this workspace. Server search is intentionally excluded.</footer>
        </section>
    </div>;
}
