import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LiveCollabWorkspace } from "./LiveCollabWorkspace";

/**
 * The `/spaces` read seam used by the V2 launcher.  It deliberately exposes a
 * small projection rather than a database row or an application auth store.
 */
export interface CollabV2SpaceApi {
    listSpaces(): Promise<unknown[]>;
    discoverSpaces?(githubRepo?: string): Promise<unknown[]>;
    joinSpace?(spaceId: string): Promise<{ spaceId: string; memberId: string; joined: boolean }>;
    createSpace(input: { name: string; description?: string; githubRepo?: string | null; visibility?: "public" | "private" }): Promise<{ id: string }>;
}

/** A selectable V2 space. `id` is always the server-issued opaque UUID. */
export interface CollabV2SpaceOption {
    id: string;
    name: string;
    description: string;
    githubRepo?: string;
    isMember: boolean;
}

export interface CollabV2SpaceLauncherProps {
    api: CollabV2SpaceApi;
    /** A known V2 UUID may be supplied by a route; Firestore IDs are never inferred. */
    initialSpaceId?: string | null;
    /** Injection seam for routes and focused tests. */
    renderWorkspace?: (spaceId: string) => ReactNode;
}

type LauncherState =
    | { status: "loading"; spaces: CollabV2SpaceOption[]; error: null }
    | { status: "ready"; spaces: CollabV2SpaceOption[]; error: null }
    | { status: "error"; spaces: CollabV2SpaceOption[]; error: Error };

const initialState: LauncherState = { status: "loading", spaces: [], error: null };

/**
 * Converts the public `/spaces` response to the UI's minimal selection model.
 * This is intentionally the only place in the launcher that knows response
 * field aliases.  The rest of the UI receives an explicit opaque V2 ID.
 */
export function toCollabV2SpaceOption(value: unknown): CollabV2SpaceOption | null {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) return null;
    const name = typeof row.name === "string" && row.name.trim()
        ? row.name.trim()
        : typeof row.title === "string" && row.title.trim()
            ? row.title.trim()
            : "Untitled Collab space";
    return { id, name, description: typeof row.description === "string" ? row.description : "", githubRepo: typeof row.githubRepo === "string" ? row.githubRepo : undefined, isMember: row.isMember !== false };
}

/**
 * A standalone space picker. Its consumer supplies the transport so it can be
 * used with the real V2 client, a preview façade, or a test double.
 */
export function CollabV2SpaceLauncher({ api, initialSpaceId = null, renderWorkspace = (spaceId) => <LiveCollabWorkspace spaceId={spaceId} /> }: CollabV2SpaceLauncherProps) {
    const [state, setState] = useState<LauncherState>(initialState);
    const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(initialSpaceId);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [repoFilter, setRepoFilter] = useState("");
    const [discoveryRepo, setDiscoveryRepo] = useState("");
    const [joiningId, setJoiningId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setState((current) => ({ status: "loading", spaces: current.spaces, error: null }));
        try {
            const [memberRows, publicRows] = await Promise.all([api.listSpaces(), api.discoverSpaces?.(discoveryRepo) ?? Promise.resolve([])]);
            const merged = new Map<string, CollabV2SpaceOption>();
            publicRows.map(toCollabV2SpaceOption).filter((space): space is CollabV2SpaceOption => space !== null).forEach((space) => merged.set(space.id, space));
            memberRows.map(toCollabV2SpaceOption).filter((space): space is CollabV2SpaceOption => space !== null).forEach((space) => merged.set(space.id, { ...space, isMember: true }));
            const options = [...merged.values()];
            setState({ status: "ready", spaces: options, error: null });
            setSelectedSpaceId((current) => {
                if (current && options.some((space) => space.id === current)) return current;
                if (initialSpaceId && options.some((space) => space.id === initialSpaceId)) return initialSpaceId;
                return options[0]?.id ?? null;
            });
        } catch (cause) {
            setState((current) => ({ status: "error", spaces: current.spaces, error: cause instanceof Error ? cause : new Error("Could not load Collab V2 spaces.") }));
        }
    }, [api, discoveryRepo, initialSpaceId]);

    useEffect(() => { void reload(); }, [reload]);

    const createSpace = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const name = String(form.get("name") ?? "").trim();
        const description = String(form.get("description") ?? "").trim();
        const githubRepo = String(form.get("githubRepo") ?? "").trim();
        const visibility = form.get("visibility") === "private" ? "private" : "public";
        if (!name) return;
        setIsCreating(true);
        setCreateError(null);
        try {
            const created = await api.createSpace({ name, ...(description ? { description } : {}), ...(githubRepo ? { githubRepo } : {}), visibility });
            const rows = await api.listSpaces();
            const options = rows.map(toCollabV2SpaceOption).filter((space): space is CollabV2SpaceOption => space !== null);
            setState({ status: "ready", spaces: options, error: null });
            setSelectedSpaceId(created.id);
            formElement.reset();
        } catch (cause) {
            setCreateError(cause instanceof Error ? cause.message : "Could not create the Collab V2 space.");
        } finally {
            setIsCreating(false);
        }
    }, [api]);

    const joinSpace = useCallback(async (spaceId: string) => {
        if (!api.joinSpace) return;
        setJoiningId(spaceId); setCreateError(null);
        try { await api.joinSpace(spaceId); await reload(); setSelectedSpaceId(spaceId); }
        catch (cause) { setCreateError(cause instanceof Error ? cause.message : "Could not join this space."); }
        finally { setJoiningId(null); }
    }, [api, reload]);

    const createForm = <form className="collabV2Launcher__create" onSubmit={(event) => void createSpace(event)}>
        <label>Space name<input name="name" required maxLength={200} placeholder="Product launch" /></label>
        <label>Description<input name="description" maxLength={10000} placeholder="Optional" /></label>
        <label>GitHub repository<input name="githubRepo" placeholder="owner/repository (optional)" /></label>
        <label>Visibility<select name="visibility" defaultValue="public"><option value="public">Public</option><option value="private">Private</option></select></label>
        <p className="collabV2Launcher__visibilityHelp">Public spaces can be discovered and joined. Without invites, private spaces are available only to current members or members added by an administrator.</p>
        <button type="submit" disabled={isCreating}>{isCreating ? "Creating…" : "Create space"}</button>
        {createError && <p role="alert">{createError}</p>}
    </form>;

    if (state.status === "loading" && state.spaces.length === 0) {
        return <main className="collabWorkspace collabWorkspace--state" aria-busy="true"><p>Loading Collab V2 spaces…</p></main>;
    }

    if (state.status === "error" && state.spaces.length === 0) {
        return <main className="collabWorkspace collabWorkspace--state"><div role="alert"><strong>Couldn’t load Collab V2 spaces.</strong><p>{state.error.message}</p><button type="button" onClick={() => void reload()}>Retry</button></div></main>;
    }

    if (state.spaces.length === 0) {
        return <main className="collabWorkspace collabWorkspace--state"><div><h1>No Collab V2 spaces yet</h1><p>Create a V2 space to open its workspace.</p>{createForm}</div></main>;
    }

    const selected = state.spaces.find((space) => space.id === selectedSpaceId) ?? state.spaces[0];
    return <main className="collabV2Launcher">
        <header className="collabV2Launcher__header">
            <div><p className="collabV2Launcher__eyebrow">Collab V2</p><h1>Choose a workspace</h1></div>
            <button type="button" onClick={() => void reload()} disabled={state.status === "loading"}>{state.status === "loading" ? "Refreshing…" : "Refresh"}</button>
        </header>
        {api.discoverSpaces && <form className="collabV2Launcher__discover" onSubmit={(event) => { event.preventDefault(); setDiscoveryRepo(repoFilter.trim()); }}><label>Discover public spaces by repository<input aria-label="Repository discovery" value={repoFilter} onChange={(event) => setRepoFilter(event.target.value)} placeholder="owner/repository" /></label><button type="submit">Discover</button></form>}
        {createForm}
        {state.status === "error" && <div role="alert" className="collabV2Launcher__warning">Couldn’t refresh spaces. Showing the last available list. <button type="button" onClick={() => void reload()}>Retry</button></div>}
        <div className="collabV2Launcher__body">
            <nav aria-label="Collab V2 spaces" className="collabV2Launcher__spaces">
                {state.spaces.map((space) => <div key={space.id} className={space.id === selected.id ? "is-selected collabV2Launcher__spaceOption" : "collabV2Launcher__spaceOption"}><button type="button" aria-pressed={space.id === selected.id} onClick={() => setSelectedSpaceId(space.id)}>
                    <span>{space.name}</span>
                    {space.description && <small>{space.description}</small>}
                    {space.githubRepo && <small>{space.githubRepo}</small>}
                    <code aria-label={`V2 space ID: ${space.id}`}>{space.id}</code>
                </button>{!space.isMember && <button type="button" className="collabPrimaryButton" onClick={() => void joinSpace(space.id)} disabled={joiningId === space.id}>{joiningId === space.id ? "Joining…" : "Join public space"}</button>}</div>)}
            </nav>
            <section aria-label={`${selected.name} workspace`} className="collabV2Launcher__workspace">
                {selected.isMember ? renderWorkspace(selected.id) : <div className="collabWorkspace collabWorkspace--state"><div><h2>{selected.name}</h2><p>Join this public space to open its channels and work.</p><button type="button" className="collabPrimaryButton" onClick={() => void joinSpace(selected.id)} disabled={joiningId === selected.id}>{joiningId === selected.id ? "Joining…" : "Join and open"}</button></div></div>}
            </section>
        </div>
    </main>;
}
