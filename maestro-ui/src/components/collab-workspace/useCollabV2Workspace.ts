import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFirebaseAuthStore } from "../../stores/useFirebaseAuthStore";
import { CollabV2ApiError, CollabV2Client } from "./CollabV2Client";
import type { CollabWorkspaceData, EntityKind } from "./types";
import { useCollabV2Presence } from "./useCollabV2Presence";

export type CollabV2WorkspaceState = { data: CollabWorkspaceData | null; loading: boolean; error: CollabV2ApiError | Error | null; actorId: string | null; reload: () => Promise<void> };

const navigation = [
    { id: "home", label: "Home", icon: "home" }, { id: "inbox", label: "Inbox", icon: "message" }, { id: "channels", label: "Channels", icon: "channel" }, { id: "tasks", label: "Tasks", icon: "task" }, { id: "docs", label: "Docs & files", icon: "doc" }, { id: "team", label: "Team", icon: "member" }, { id: "tracking", label: "Tracking", icon: "pr" }, { id: "graph", label: "Graph", icon: "graph" },
];

/** Read-side wiring for supported `/api/collab/v2` endpoints. V1 Firestore IDs
 * are never assumed to equal V2 space IDs; callers supply an explicit V2 ID. */
export function useCollabV2Workspace(spaceId: string | null): CollabV2WorkspaceState {
    const user = useFirebaseAuthStore((state) => state.user);
    const client = useMemo(() => user ? new CollabV2Client(() => user.getIdToken(), undefined, user.uid) : null, [user]);
    const [data, setData] = useState<CollabWorkspaceData | null>(null);
    const [error, setError] = useState<CollabV2ApiError | Error | null>(null);
    const [loading, setLoading] = useState(Boolean(spaceId && client));
    const [actorId, setActorId] = useState<string | null>(null);
    const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);
    const livePresence = useCollabV2Presence(spaceId, user, defaultChannelId);
    const eventCursor = useRef<string | undefined>();
    const seenEvents = useRef(new Set<string>());
    const reload = useCallback(async () => {
        if (!client || !spaceId) { setData(null); setActorId(null); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const [identity, navigationData, collection, inbox] = await Promise.all([
                client.spaceIdentity(spaceId),
                client.getNavigation(spaceId),
                client.queryCollection({ spaceId, kinds: ["task", "channel", "doc", "file", "member", "team_member", "pull_request", "commit"] as EntityKind[], layout: "board", groupBy: "workStatus", limit: 100, title: "My work" }),
                client.listInbox(spaceId),
            ]);
            const contexts = await Promise.all(collection.page.items.map((item) => client.getEntityContext(item.id)));
            const entities = Object.fromEntries(contexts.map((context) => [context.detail.id, context.detail]));
            const threads = Object.fromEntries(contexts.map((context) => [context.detail.id, context.thread]));
            const activity = Object.fromEntries(contexts.map((context) => [context.detail.id, context.activity]));
            setActorId(typeof identity.memberId === "string" ? identity.memberId : typeof identity.id === "string" ? identity.id : null);
            const nav = navigationData as { space?: { name?: string; description?: string }; unreadTotal?: number; channels?: unknown[] };
            const projectedChannels = (nav.channels ?? []) as Array<{ id?: string; title?: string; name?: string }>;
            const general = projectedChannels.find((channel) => (channel.title ?? channel.name)?.toLowerCase() === "general") ?? projectedChannels[0];
            setDefaultChannelId(typeof general?.id === "string" ? general.id : null);
            const workingAgentCount = collection.page.items.filter((item) => item.state.kind === "team_member" && item.state.liveWork).length;
            setData({ space: { id: spaceId, name: nav.space?.name ?? "Collab workspace", description: nav.space?.description ?? "" }, navigation: navigation.map((item) => item.id === "channels" ? { ...item, count: nav.channels?.length ?? 0 } : item.id === "inbox" ? { ...item, count: nav.unreadTotal ?? 0 } : item), collection, entities, threads, presence: {}, activity, inbox: inbox.items, unreadTotal: nav.unreadTotal ?? 0, workingAgentCount, defaultEntityId: typeof general?.id === "string" ? general.id : null });
        } catch (cause) {
            setError(cause instanceof Error ? cause : new Error("Could not load Collab V2 workspace.")); setData(null);
        } finally { setLoading(false); }
    }, [client, spaceId]);
    useEffect(() => { void reload(); }, [reload]);
    useEffect(() => { setData((current) => current ? { ...current, presence: livePresence } : current); }, [livePresence]);
    useEffect(() => {
        if (!client || !spaceId) return;
        eventCursor.current = undefined; seenEvents.current.clear();
        let stopped = false;
        const poll = async () => {
            try {
                const page = await client.getEvents(spaceId, eventCursor.current);
                const fresh = page.items.filter((event) => !seenEvents.current.has(event.eventId));
                fresh.forEach((event) => seenEvents.current.add(event.eventId));
                eventCursor.current = page.nextCursor ?? eventCursor.current;
                if (fresh.length && !stopped) await reload();
            } catch { /* polling is best-effort; primary reads retain their last good state */ }
        };
        void poll();
        const interval = window.setInterval(() => void poll(), 5_000);
        return () => { stopped = true; window.clearInterval(interval); };
    }, [client, reload, spaceId]);
    return { data, loading, error, actorId, reload };
}
