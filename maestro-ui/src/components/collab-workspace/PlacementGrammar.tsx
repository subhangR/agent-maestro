import React, { useMemo, useState } from "react";
import { EntityCard } from "./EntityPrimitives";
import type { EntityKind, EntitySummary } from "./types";

/**
 * A placement is deliberately a semantic intent, rather than a UI-specific
 * relationship.  When /placements becomes available this exact object can be
 * sent to the facade; today it only drives the local demonstration state.
 */
export type PlacementIntent = "attach" | "assign" | "depend" | "subtask" | "embed" | "reparent";

export interface PlacementOption {
    intent: PlacementIntent;
    label: string;
    ghostLabel: string;
    description: string;
}

export interface LocalPlacement {
    id: string;
    sourceId: string;
    targetId: string;
    intent: PlacementIntent;
    summary: string;
}

const attachableToTask = new Set<EntityKind>(["doc", "file", "spell", "skill"]);
const actorKinds = new Set<EntityKind>(["member", "team_member"]);

export function placementOptions(source: EntitySummary, target: EntitySummary, targetRole: "entity" | "parent-zone" = "entity"): PlacementOption[] {
    if (source.id === target.id) return [];

    if (targetRole === "parent-zone") {
        const option = reparentOption(source, target);
        return option ? [option] : [];
    }

    if (target.id === "collab-placement-composer" && target.kind === "message") {
        return [{ intent: "embed", label: "Embed in message", ghostLabel: `Embed ${source.title} in message`, description: "Adds a live entity card to this message." }];
    }

    if (target.kind === "channel") {
        return [{ intent: "attach", label: "Attach to channel", ghostLabel: `Attach to #${target.title}`, description: "Creates an attached-to relationship." }];
    }
    if (target.kind === "task") {
        if (attachableToTask.has(source.kind)) {
            return [{ intent: "attach", label: "Attach to task", ghostLabel: `Attach to ${target.title}`, description: "Keeps this supporting item on the task." }];
        }
        if (actorKinds.has(source.kind)) {
            return [{ intent: "assign", label: "Assign to task", ghostLabel: `Assign ${source.title} to ${target.title}`, description: "Makes this person or agent an assignee." }];
        }
        if (source.kind === "task") {
            return [
                { intent: "attach", label: "Attach", ghostLabel: `Attach ${source.title} to ${target.title}`, description: "Adds a visible task attachment." },
                { intent: "depend", label: "Depends on", ghostLabel: `${target.title} depends on ${source.title}`, description: "Creates a dependency from the target task." },
                { intent: "subtask", label: "Make subtask", ghostLabel: `Make ${source.title} a subtask of ${target.title}`, description: "Moves the source beneath the target task." },
            ];
        }
    }
    if (actorKinds.has(target.kind) && source.kind === "task") {
        return [{ intent: "assign", label: "Assign task", ghostLabel: `Assign ${source.title} to ${target.title}`, description: "Makes this person or agent an assignee." }];
    }
    return [];
}

export function reparentOption(source: EntitySummary, target: EntitySummary): PlacementOption | null {
    if (source.id === target.id || source.kind !== target.kind) return null;
    return { intent: "reparent", label: "Move into hierarchy", ghostLabel: `Move ${source.title} under ${target.title}`, description: "Moves this item into the target's hierarchy." };
}

export function embedPlacementOption(source: EntitySummary): PlacementOption {
    return { intent: "embed", label: "Embed in message", ghostLabel: `Embed ${source.title} in message`, description: "Adds a live entity card to this message." };
}

function placementSummary(source: EntitySummary, target: EntitySummary, option: PlacementOption) {
    switch (option.intent) {
        case "attach": return `${source.title} attached to ${target.title}`;
        case "assign": return `${source.title} assigned with ${target.title}`;
        case "depend": return `${target.title} now depends on ${source.title}`;
        case "subtask": return `${source.title} made a subtask of ${target.title}`;
        case "embed": return `${source.title} embedded in a message`;
        case "reparent": return `${source.title} moved under ${target.title}`;
    }
}

type Preview = { source: EntitySummary; target: EntitySummary; options: PlacementOption[]; via: "drag" | "keyboard" };

/**
 * Collection-level interaction adapter. It uses native HTML drag and drop so it
 * stays lightweight, works without a graph dependency, and remains API-neutral.
 */
export function PlacementCollection({ items, onOpen, children, onLocalPlacement, onLocalUndo }: {
    items: EntitySummary[];
    onOpen: (id: string) => void;
    children?: (card: React.ReactNode, entity: EntitySummary) => React.ReactNode;
    /** Adapter seam for the future, feature-gated placement command. */
    onLocalPlacement?: (placement: LocalPlacement) => void;
    onLocalUndo?: (placement: LocalPlacement) => void;
}) {
    const [source, setSource] = useState<EntitySummary | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [placement, setPlacement] = useState<LocalPlacement | null>(null);
    const [undone, setUndone] = useState(false);

    const sourceLabel = source ? source.title : "";
    const activeTargetIds = useMemo(() => new Set(source ? items.filter((target) => placementOptions(source, target).length > 0).map((target) => target.id) : []), [items, source]);

    const begin = (entity: EntitySummary) => {
        setSource(entity);
        setPreview(null);
        setUndone(false);
    };
    const previewTarget = (target: EntitySummary, via: Preview["via"]) => {
        if (!source || source.id === target.id) return;
        const options = placementOptions(source, target);
        if (options.length) setPreview({ source, target, options, via });
    };
    const commit = (option: PlacementOption) => {
        if (!preview) return;
        const nextPlacement: LocalPlacement = {
            id: `local-placement-${Date.now()}`,
            sourceId: preview.source.id,
            targetId: preview.target.id,
            intent: option.intent,
            summary: placementSummary(preview.source, preview.target, option),
        };
        setPlacement(nextPlacement);
        onLocalPlacement?.(nextPlacement);
        setPreview(null);
        setSource(null);
        setUndone(false);
    };
    const cancel = () => {
        setPreview(null);
        setSource(null);
    };

    const composerTarget = source ? createComposerTarget(source) : null;

    return <div className="collabPlacementLayer" aria-describedby="collabPlacementHelp">
        <p id="collabPlacementHelp" className="sr-only">Drag an entity card to a compatible card, or use its Place button and then choose a destination. Every placement names its meaning before it is committed.</p>
        {placement && <div className="collabPlacementActivity" role="status">
            <span><strong>Local activity:</strong> {undone ? `Undid ${placement.summary}.` : placement.summary}</span>
            {!undone && (!onLocalPlacement || onLocalUndo) && <button type="button" onClick={() => { setUndone(true); onLocalUndo?.(placement); }}>Undo</button>}
        </div>}
        {source && !preview && <div className="collabPlacementToolbar" role="status">
            <span>Placing <strong>{sourceLabel}</strong> — choose a highlighted destination.</span>
            <button type="button" onClick={cancel}>Cancel placement</button>
        </div>}
        {items.map((entity) => {
            const isSource = source?.id === entity.id;
            const options = source ? placementOptions(source, entity) : [];
            const isTarget = activeTargetIds.has(entity.id);
            const card = <EntityCard entity={entity} onOpen={onOpen} />;
            return <div
                className={`collabPlacementCard ${isSource ? "is-placement-source" : ""} ${isTarget ? "is-placement-target" : ""}`}
                data-placement-target={entity.id}
                key={entity.id}
                draggable
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "link";
                    event.dataTransfer.setData("application/x-maestro-entity", entity.id);
                    begin(entity);
                }}
                onDragOver={(event) => {
                    if (!source || source.id === entity.id || options.length === 0) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "link";
                    previewTarget(entity, "drag");
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    if (!source || options.length === 0) return;
                    previewTarget(entity, "drag");
                    if (options.length === 1) setPreview({ source, target: entity, options, via: "drag" });
                }}
            >
                <div className="collabPlacementCardBody">{children ? children(card, entity) : card}</div>
                <button type="button" className="collabPlacementHandle" onClick={() => begin(entity)} aria-label={`Place ${entity.title}`} aria-pressed={isSource}>
                    Place
                </button>
                {isTarget && <button type="button" className="collabPlacementTarget" onClick={() => previewTarget(entity, "keyboard")} aria-label={`Choose how to place ${sourceLabel} with ${entity.title}`}>
                    Drop here
                </button>}
                {source && source.id !== entity.id && source.kind === entity.kind && <button type="button" className="collabPlacementParentTarget" onClick={() => {
                    const options = placementOptions(source, entity, "parent-zone");
                    if (options.length) setPreview({ source, target: entity, options, via: "keyboard" });
                }} aria-label={`Move ${sourceLabel} under ${entity.title}`}>
                    Parent zone
                </button>}
            </div>;
        })}
        {source && composerTarget && <div
            className="collabPlacementComposerTarget"
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; previewTarget(composerTarget, "drag"); }}
            onDrop={(event) => { event.preventDefault(); previewTarget(composerTarget, "drag"); }}
        >
            <span aria-hidden="true">◌</span><strong>Message composer</strong><span>Drop here to embed {source.title}</span>
            <button type="button" onClick={() => previewTarget(composerTarget, "keyboard")}>Embed in message</button>
        </div>}
        {preview && <PlacementPreview preview={preview} onCommit={commit} onCancel={cancel} />}
    </div>;
}

function createComposerTarget(source: EntitySummary): EntitySummary {
    return {
        ...source,
        id: "collab-placement-composer",
        kind: "message",
        title: "Message composer",
        state: { kind: "message", anchorId: source.id, rootMessageId: null, author: source.createdBy },
    };
}

function PlacementPreview({ preview, onCommit, onCancel }: { preview: Preview; onCommit: (option: PlacementOption) => void; onCancel: () => void }) {
    const [selected, setSelected] = useState(preview.options.length === 1 ? preview.options[0] : null);
    const isAmbiguous = preview.options.length > 1;
    return <section className="collabPlacementPreview" aria-label="Placement preview" aria-live="polite">
        <span className="collabEyebrow">DROP PREVIEW</span>
        <strong>{selected?.ghostLabel ?? `Choose a placement for ${preview.source.title}`}</strong>
        {isAmbiguous ? <div className="collabPlacementMenu" role="group" aria-label="Placement intent">
            {preview.options.map((option) => <button type="button" key={option.intent} className={selected?.intent === option.intent ? "is-active" : ""} onClick={() => setSelected(option)}>
                <span>{option.label}</span><small>{option.description}</small>
            </button>)}
        </div> : <p>{preview.options[0].description}</p>}
        <div className="collabPlacementPreviewActions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="button" className="collabPrimaryButton" onClick={() => selected && onCommit(selected)} disabled={!selected}>Confirm</button>
        </div>
    </section>;
}
