import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { CollabCommandPalette } from "./CollabCommandPalette";
import { CollectionView } from "./CollectionView";
import { EntityGlyph } from "./EntityPrimitives";
import { EntityPanel, type EntityPanelActions } from "./EntityPanel";
import { GraphCanvas } from "./GraphCanvas";
import { mockCollabWorkspaceData } from "./mockData";
import type { LocalPlacement } from "./PlacementGrammar";
import type { CollabWorkspaceData, EntityDetail, EntityKind, EntitySummary, WorkStatus } from "./types";

export interface CollabWorkspaceActions {
    createTask(input: { title: string; description?: string; parentId?: string | null }): Promise<unknown>;
    createDoc(input: { title: string; body?: string; format?: "markdown" | "mermaid" | "excalidraw" }): Promise<unknown>;
    createFile(input: { name: string; mimeType: string; sizeBytes: number; storagePath: string }): Promise<unknown>;
    postMessage(anchorId: string, body: string): Promise<unknown>;
    setReaction(entityId: string, type: "likes" | "stars", active: boolean): Promise<unknown>;
    grantPoints(entityId: string, amount: number): Promise<unknown>;
    place(placement: Pick<LocalPlacement, "sourceId" | "targetId" | "intent">): Promise<unknown>;
    createEdge(input: { srcId: string; dstId: string; type: string; props?: Record<string, unknown> }): Promise<unknown>;
    completeTask(entity: EntityDetail): Promise<unknown>;
    pullEntity(entity: EntityDetail): Promise<unknown>;
    updateWork(entity: EntityDetail, status: WorkStatus): Promise<unknown>;
    markInboxRead(notificationId: string): Promise<unknown>;
    refreshTracking(entityIds?: string[]): Promise<unknown>;
}

type CreateMode = "task" | "doc" | "file" | null;

export function CollabWorkspace({ data = mockCollabWorkspaceData, actions, pending = false, actionError }: { data?: CollabWorkspaceData; actions?: CollabWorkspaceActions; pending?: boolean; actionError?: string | null }) {
    const initialId = data.defaultEntityId ?? data.collection.page.items[0]?.id ?? null;
    const [activeNav, setActiveNav] = useState(data.defaultEntityId ? "channels" : "home");
    const [panelStack, setPanelStack] = useState<string[]>(initialId ? [initialId] : []);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [createMode, setCreateMode] = useState<CreateMode>(null);
    const [childParent, setChildParent] = useState<EntityDetail | null>(null);
    const selectedId = panelStack[panelStack.length - 1] ?? null;
    const selected = selectedId ? data.entities[selectedId] : undefined;

    useEffect(() => { setPanelStack(initialId ? [initialId] : []); }, [data, initialId]);

    const openEntity = (id: string) => setPanelStack((stack) => stack[stack.length - 1] === id ? stack : [...stack, id]);
    const activeLabel = useMemo(() => data.navigation.find((item) => item.id === activeNav)?.label ?? "Home", [activeNav, data.navigation]);
    const visibleKinds = useMemo<Set<EntityKind> | null>(() => {
        if (activeNav === "tasks") return new Set(["task"]);
        if (activeNav === "channels") return new Set(["channel"]);
        if (activeNav === "docs") return new Set(["doc", "file"]);
        if (activeNav === "team") return new Set(["member", "team_member"]);
        if (activeNav === "tracking") return new Set(["pull_request", "commit"]);
        return null;
    }, [activeNav]);
    const visibleCollection = useMemo(() => ({ ...data.collection, query: { ...data.collection.query, title: activeNav === "home" ? "My work" : activeLabel, layout: activeNav === "docs" ? "gallery" as const : data.collection.query.layout }, page: { ...data.collection.page, items: visibleKinds ? data.collection.page.items.filter((item) => visibleKinds.has(item.kind)) : data.collection.page.items } }), [activeLabel, activeNav, data.collection, visibleKinds]);
    const graph = useMemo(() => ({
        nodes: data.collection.page.items,
        edges: Object.values(data.entities).flatMap((entity) => entity.connections.groups.flatMap((group) => group.items.map((target, index) => ({ id: `${entity.id}:${group.type}:${target.id}:${index}`, type: group.type, sourceId: group.direction === "outgoing" ? entity.id : target.id, targetId: group.direction === "outgoing" ? target.id : entity.id })))),
        clusters: Object.values(data.entities).filter((entity) => entity.hierarchy.children.items.length).map((entity) => ({ parentId: entity.id, childIds: entity.hierarchy.children.items.map((item) => item.id) })),
    }), [data.collection.page.items, data.entities]);

    const panelActions: EntityPanelActions | undefined = actions ? {
        onReact: (id, type, active) => { void actions.setReaction(id, type, active); },
        onGrantPoints: (id) => { void actions.grantPoints(id, 1); },
        onPostMessage: (id, body) => actions.postMessage(id, body),
        onAddChild: (entity) => { setChildParent(entity); setCreateMode("task"); },
        onComplete: (entity) => { void actions.completeTask(entity); },
        onPull: (entity) => { void actions.pullEntity(entity); },
        onWork: (entity, status) => { void actions.updateWork(entity, status); },
    } : undefined;

    return <main className="collabWorkspace" aria-label="Collab V2 workspace">
        <aside className="collabSpaceRail"><div className="collabBrand" aria-label="Maestro">&gt;···+</div><span className="collabSpaceButton is-active" aria-label={`${data.space.name} active space`}>{data.space.name.slice(0, 1).toUpperCase()}</span></aside>
        <nav className="collabNav" aria-label="Space navigation"><header><span className="collabEyebrow">SPACE</span><h1>{data.space.name}</h1><p>{data.space.description}</p></header>{data.navigation.map((item) => <button type="button" key={item.id} className={activeNav === item.id ? "is-active" : ""} onClick={() => setActiveNav(item.id)} aria-current={activeNav === item.id ? "page" : undefined}><EntityGlyph kind={(item.icon === "pr" ? "pull_request" : item.icon) as Parameters<typeof EntityGlyph>[0]["kind"]} />{item.label}{typeof item.count === "number" && item.count > 0 && <span className="collabUnread">{item.count}</span>}</button>)}<footer><span className="collabLiveDot" aria-hidden="true" />{data.workingAgentCount ?? 0} agents working</footer></nav>
        <section className="collabWorkspaceCenter"><header className="collabWorkspaceHeader"><div><span className="collabEyebrow">{activeLabel}</span><h2>{activeNav === "home" ? "Focus on the work moving now." : activeLabel}</h2></div><div>{activeNav === "tracking" && <button type="button" disabled={!actions || pending} onClick={() => void actions?.refreshTracking()}>Refresh tracking</button>}<button type="button" onClick={() => setPaletteOpen(true)}>⌘K</button>{activeNav === "docs" && <><button type="button" disabled={!actions} onClick={() => setCreateMode("doc")}>New doc</button><button type="button" disabled={!actions} onClick={() => setCreateMode("file")}>Register file</button></>}<button type="button" className="collabPrimaryButton" disabled={!actions} onClick={() => setCreateMode("task")}>New task</button></div></header>
            {actionError && <p className="collabV2Launcher__warning" role="alert">{actionError}</p>}
            {activeNav === "inbox" ? <Inbox items={data.inbox ?? []} onOpen={openEntity} onRead={actions ? (id) => void actions.markInboxRead(id) : undefined} /> : activeNav === "graph" ? <GraphCanvas result={graph} onOpen={openEntity} canCreateEdges={Boolean(actions)} onCreateEdge={actions ? (input) => void actions.createEdge({ srcId: input.sourceId, dstId: input.targetId, type: input.type }) : undefined} /> : <CollectionView result={visibleCollection} onOpen={openEntity} onPlacement={actions ? (placement) => void actions.place(placement) : undefined} />}
        </section>
        {selected && <div className="collabPanelStack" aria-label="Open entity panels">{panelStack.length > 1 && <button type="button" className="collabStackBack" onClick={() => setPanelStack((stack) => stack.slice(0, -1))}>‹ Back to {data.entities[panelStack[panelStack.length - 2] ?? ""]?.title ?? "entity"}</button>}<EntityPanel entity={selected} thread={data.threads[selected.id]} presence={data.presence[selected.id]} activity={data.activity[selected.id]} onOpen={openEntity} onClose={() => setPanelStack([])} actions={panelActions} pending={pending} /></div>}
        <CollabCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} entities={data.entities} contextEntity={selected} onNavigate={openEntity} />
        {createMode && actions && <CreateEntityDialog mode={createMode} parent={childParent} onClose={() => { setCreateMode(null); setChildParent(null); }} actions={actions} />}
    </main>;
}

function Inbox({ items, onOpen, onRead }: { items: NonNullable<CollabWorkspaceData["inbox"]>; onOpen: (id: string) => void; onRead?: (id: string) => void }) {
    if (!items.length) return <section className="collabCollection collabWorkspace--state"><p>Your inbox is clear.</p></section>;
    return <section className="collabCollection"><header className="collabCollectionHeader"><div><span className="collabEyebrow">INBOX</span><h2>Needs your attention</h2></div></header><ol className="collabActivity">{items.map((item) => <li key={item.id} className={item.read ? "" : "is-unread"}><span><strong>{item.actor?.displayName ?? "Workspace"}</strong> {item.kind.replace(/_/g, " ")} <button type="button" onClick={() => onOpen(item.target.id)}>{item.target.title}</button></span><time>{new Date(item.createdAt).toLocaleString()}</time>{!item.read && <button type="button" disabled={!onRead} onClick={() => onRead?.(item.id)}>Mark read</button>}</li>)}</ol></section>;
}

function CreateEntityDialog({ mode, parent, actions, onClose }: { mode: Exclude<CreateMode, null>; parent: EntityDetail | null; actions: CollabWorkspaceActions; onClose: () => void }) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setError(null);
        try {
            const title = String(form.get("title") ?? "").trim();
            if (mode === "task") await actions.createTask({ title, description: String(form.get("body") ?? "").trim(), parentId: parent?.id ?? null });
            if (mode === "doc") await actions.createDoc({ title, body: String(form.get("body") ?? "").trim(), format: "markdown" });
            if (mode === "file") await actions.createFile({ name: title, mimeType: String(form.get("mimeType") ?? "application/octet-stream"), sizeBytes: Number(form.get("sizeBytes") ?? 0), storagePath: String(form.get("storagePath") ?? "").trim() });
            onClose();
        } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not create ${mode}.`); }
        finally { setSaving(false); }
    };
    return <div className="collabPlacementPreview collabCreateDialog" role="dialog" aria-modal="true" aria-labelledby="collabCreateTitle"><span className="collabEyebrow">CREATE</span><h2 id="collabCreateTitle">{parent ? `Add child to ${parent.title}` : mode === "file" ? "Register file" : `New ${mode}`}</h2><form onSubmit={(event) => void submit(event)}><label>{mode === "file" ? "File name" : "Title"}<input name="title" required /></label>{mode !== "file" && <label>Description<textarea name="body" rows={4} /></label>}{mode === "file" && <><label>MIME type<input name="mimeType" defaultValue="application/octet-stream" required /></label><label>Size in bytes<input name="sizeBytes" type="number" min="0" defaultValue="0" required /></label><label>Storage path<input name="storagePath" required /></label></>}{error && <p role="alert">{error}</p>}<div className="collabPlacementPreviewActions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="collabPrimaryButton" disabled={saving}>{saving ? "Saving…" : "Create"}</button></div></form></div>;
}
