import { useMemo } from "react";
import { useFirebaseAuthStore } from "../../stores/useFirebaseAuthStore";
import { CollabV2Client } from "./CollabV2Client";
import { CollabV2SpaceLauncher } from "./CollabV2SpaceLauncher";

/**
 * Authenticated entry point for the live V2 picker. It does not touch the
 * Firebase `SpaceWindow`: a selected id is passed straight to the V2 workspace.
 */
export function LiveCollabV2SpaceLauncher({ initialSpaceId }: { initialSpaceId?: string | null }) {
    const user = useFirebaseAuthStore((state) => state.user);
    const signInGoogle = useFirebaseAuthStore((state) => state.signInGoogle);
    const authLoading = useFirebaseAuthStore((state) => state.loading);
    const authError = useFirebaseAuthStore((state) => state.error);
    const client = useMemo(() => {
        if (!user) return null;
        // Firebase custom claims (including Supabase's required authenticated
        // role) are only reflected in a newly minted ID token. Refresh once
        // when V2 opens, then use Firebase's normal cached-token behavior.
        let refreshFirstToken = true;
        return new CollabV2Client(async () => {
            const token = await user.getIdToken(refreshFirstToken);
            refreshFirstToken = false;
            return token;
        }, undefined, user.uid);
    }, [user]);

    if (!client) {
        return <main className="collabWorkspace collabWorkspace--state"><div><h1>Collab V2</h1><p>Sign in to open a Collab V2 workspace.</p><button type="button" onClick={() => void signInGoogle()} disabled={authLoading}>{authLoading ? "Signing in…" : "Sign in with Google"}</button>{authError && <p role="alert">{authError}</p>}</div></main>;
    }

    return <CollabV2SpaceLauncher api={client} initialSpaceId={initialSpaceId} />;
}
