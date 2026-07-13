import { useEffect, useMemo } from "react";
import { useCollabSpaceStore } from "../stores/useCollabSpaceStore";
import { useJoinedSpacesStore } from "../stores/useJoinedSpacesStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useFirebaseAuthStore } from "../stores/useFirebaseAuthStore";
import { CollabSpace } from "../firebase/collabSpaceTypes";

/**
 * Returns the user's joined Collab Spaces filtered to those whose `githubUrl`
 * matches the active local project's detected git remote. Triggers remote
 * detection on demand so the right rail can list spaces without the user
 * having to open the Collab tab first.
 *
 * Sorted by the user's `members[uid].joinedAt` descending (most-recent first).
 */
export function useProjectCollabSpaces(): {
    spaces: CollabSpace[];
    detectedCanonical: string | null;
    detecting: boolean;
} {
    const user = useFirebaseAuthStore((s) => s.user);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const projects = useProjectStore((s) => s.projects);
    const activeProject = useMemo(
        () => projects.find((p) => p.id === activeProjectId) ?? null,
        [projects, activeProjectId],
    );

    const detectedRemote = useCollabSpaceStore(
        (s) => s.detectedRemoteByProject[activeProjectId],
    );
    const detecting = useCollabSpaceStore(
        (s) => Boolean(s.detectionLoading[activeProjectId]),
    );
    const detectRemote = useCollabSpaceStore((s) => s.detectRemote);

    const joinedSpaces = useJoinedSpacesStore((s) => s.spaces);

    // Auto-trigger remote detection once per project.
    useEffect(() => {
        if (!activeProject) return;
        if (detectedRemote !== undefined) return;
        // Prefer workingDir (source of truth on MaestroProject); fall back to basePath.
        const workingDir = activeProject.workingDir || activeProject.basePath;
        if (!workingDir) return;
        void detectRemote(activeProjectId, workingDir);
    }, [activeProjectId, activeProject, detectedRemote, detectRemote]);

    const canonical = detectedRemote?.canonical ?? null;

    const spaces = useMemo(() => {
        if (!canonical || !user) return [];
        const filtered = joinedSpaces.filter((s) => s.githubUrl === canonical);
        // Missing/invalid joinedAt Timestamps sort last (never crash on them).
        const joinedMillis = (s: CollabSpace): number => {
            const ts = s.members?.[user.uid]?.joinedAt as
                | { toMillis?: unknown }
                | null
                | undefined;
            if (!ts || typeof ts.toMillis !== "function") return -1;
            try {
                const ms = (ts as { toMillis: () => number }).toMillis();
                return Number.isFinite(ms) ? ms : -1;
            } catch {
                return -1;
            }
        };
        return filtered.slice().sort((a, b) => joinedMillis(b) - joinedMillis(a));
    }, [joinedSpaces, canonical, user]);

    return { spaces, detectedCanonical: canonical, detecting };
}
