import { useEffect, useMemo } from "react";
import { useCollabSpaceStore } from "../stores/useCollabSpaceStore";
import { useJoinedSpacesStore } from "../stores/useJoinedSpacesStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useAuthStore } from "../stores/useAuthStore";
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
    const user = useAuthStore((s) => s.user);
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
        return filtered.slice().sort((a, b) => {
            const aJoined = (a.members?.[user.uid]?.joinedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            const bJoined = (b.members?.[user.uid]?.joinedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            return bJoined - aJoined;
        });
    }, [joinedSpaces, canonical, user]);

    return { spaces, detectedCanonical: canonical, detecting };
}
