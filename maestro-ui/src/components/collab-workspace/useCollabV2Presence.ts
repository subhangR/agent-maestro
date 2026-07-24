import { onValue, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import { CollabPresence } from "../../firebase/collabPresence";
import { getFirebaseDatabase } from "../../firebase/config";
import type { User } from "firebase/auth";
import type { ActorSummary, PresenceSnapshot } from "./types";

type PresenceTree = Record<string, { connections?: Record<string, { focus?: string; visible?: boolean }> }>;
type TypingTree = Record<string, Record<string, Record<string, number>>>;

function actorFor(uid: string, user: User | null): ActorSummary {
    if (user?.uid === uid) return { id: uid, kind: "member", displayName: user.displayName || user.email || "You", avatar: user.photoURL, isAgent: false };
    return { id: uid, kind: "member", displayName: `Member ${uid.slice(0, 6)}`, isAgent: false };
}

export function projectCollabV2Presence(spaceId: string, presence: PresenceTree, typing: TypingTree, user: User | null): Record<string, PresenceSnapshot> {
    const result: Record<string, PresenceSnapshot> = {};
    for (const [uid, value] of Object.entries(presence)) {
        const focuses = new Set(Object.values(value.connections ?? {}).filter((connection) => connection.visible !== false && connection.focus && !connection.focus.startsWith("section:")).map((connection) => connection.focus as string));
        for (const entityId of focuses) {
            const snapshot = result[entityId] ?? { entityId, viewers: [], typing: [] };
            if (!snapshot.viewers.some((actor) => actor.id === uid)) snapshot.viewers.push(actorFor(uid, user));
            result[entityId] = snapshot;
        }
    }
    for (const [anchorId, actors] of Object.entries(typing)) {
        const snapshot = result[anchorId] ?? { entityId: anchorId, viewers: [], typing: [] };
        for (const [uid, connections] of Object.entries(actors)) {
            if (Object.keys(connections ?? {}).length && !snapshot.typing.some((actor) => actor.id === uid)) snapshot.typing.push(actorFor(uid, user));
        }
        result[anchorId] = snapshot;
    }
    return result;
}

export function useCollabV2Presence(spaceId: string | null, user: User | null, focusId?: string | null): Record<string, PresenceSnapshot> {
    const [presenceTree, setPresenceTree] = useState<PresenceTree>({});
    const [typingTree, setTypingTree] = useState<TypingTree>({});
    useEffect(() => {
        if (!spaceId || !user) { setPresenceTree({}); setTypingTree({}); return; }
        const database = getFirebaseDatabase();
        const presence = new CollabPresence("collab-v2");
        presence.start(user.uid);
        presence.setFocus(spaceId, focusId ?? null, true, focusId ? "messages" : "home");
        const stopPresence = onValue(ref(database, `spacePresence/${spaceId}`), (snapshot) => setPresenceTree(snapshot.val() ?? {}), () => setPresenceTree({}));
        const stopTyping = onValue(ref(database, `spaceTyping/${spaceId}`), (snapshot) => setTypingTree(snapshot.val() ?? {}), () => setTypingTree({}));
        return () => { stopPresence(); stopTyping(); presence.stop(); };
    }, [focusId, spaceId, user]);
    return useMemo(() => spaceId ? projectCollabV2Presence(spaceId, presenceTree, typingTree, user) : {}, [presenceTree, spaceId, typingTree, user]);
}
