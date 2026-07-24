import React, { useMemo, useState } from "react";
import { entityWorkStatus } from "./EntityPrimitives";
import { PlacementCollection } from "./PlacementGrammar";
import type { CollectionLayout, CollectionResult } from "./types";
import type { LocalPlacement } from "./PlacementGrammar";

const layouts: Array<{ id: CollectionLayout; label: string }> = [
    { id: "list", label: "List" }, { id: "board", label: "Board" }, { id: "tree", label: "Tree" }, { id: "feed", label: "Feed" }, { id: "gallery", label: "Gallery" },
];

export function CollectionView({ result, onOpen, onPlacement }: { result: CollectionResult; onOpen: (id: string) => void; onPlacement?: (placement: LocalPlacement) => void }) {
    const [layout, setLayout] = useState<CollectionLayout>(result.query.layout);
    const groups = useMemo(() => {
        if (layout !== "board") return [["All entities", result.page.items] as const];
        const buckets = new Map<string, typeof result.page.items>();
        for (const item of result.page.items) {
            const status = entityWorkStatus(item);
            const key = status ? status.replace("_", " ") : item.kind.replace("_", " ");
            buckets.set(key, [...(buckets.get(key) ?? []), item]);
        }
        return [...buckets.entries()];
    }, [layout, result.page.items]);

    const items = result.page.items;
    return <section className="collabCollection" aria-labelledby="collabCollectionTitle">
        <header className="collabCollectionHeader">
            <div><span className="collabEyebrow">SAVED VIEW</span><h2 id="collabCollectionTitle">{result.query.title ?? "Collection"}</h2><p>{items.length} entities · grouped by {result.query.groupBy ?? "none"}</p></div>
            <div className="collabLayoutSwitch" aria-label="Collection layout">
                {layouts.map((item) => <button key={item.id} type="button" className={layout === item.id ? "is-active" : ""} onClick={() => setLayout(item.id)} aria-pressed={layout === item.id}>{item.label}</button>)}
            </div>
        </header>
        <div className={`collabCollectionBody collabCollectionBody--${layout}`}>
            {groups.map(([group, items]) => <section className="collabCollectionGroup" key={group}><h3>{group}</h3><div className="collabCollectionCards"><PlacementCollection items={items} onOpen={onOpen} onLocalPlacement={onPlacement} /></div></section>)}
        </div>
    </section>;
}
