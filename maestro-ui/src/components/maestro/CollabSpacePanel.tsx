import React, { useEffect, useMemo, useState } from "react";
import { useFirebaseAuthStore } from "../../stores/useFirebaseAuthStore";
import { useCollabSpaceStore } from "../../stores/useCollabSpaceStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { CollabSpace, CollabSpaceVisibility } from "../../firebase/collabSpaceTypes";
import { ParsedGitRemote, parseManualGithubRemote } from "../../utils/parseGitRemote";
import { makeCollabActiveId } from "../../app/types/space";

/**
 * Classifies a failed `setProjectGithubUrl` PUT so the UI can tell a
 * rejected repository URL (a 4xx from the server's validation contract)
 * apart from an actual network/connectivity failure. Exported for direct
 * unit coverage — mounting the full signed-in Collab tree (Firebase auth +
 * three stores) just to exercise this branch would be brittle for no extra
 * signal; `MaestroClient`'s fetch wrapper already throws
 * `Error("HTTP <status>: ...")` for non-2xx responses (see
 * `MaestroClient.ts#fetch`) and lets a raw fetch rejection (e.g. a dropped
 * connection) propagate as-is, so that existing shape is all this needs.
 */
export function classifyGithubUrlSaveError(err: unknown): 'invalid-url' | 'network' {
  const status = err instanceof Error ? err.message.match(/^HTTP (\d\d\d):/)?.[1] : undefined;
  return status && status.startsWith('4') ? 'invalid-url' : 'network';
}

type CollabSpacePanelProps = {
  projectId: string;
  workingDir: string;
  projectName: string;
  /** Persisted canonical GitHub URL for this project; hydrated before git detection. */
  savedGithubUrl?: string;
};

export function CollabSpacePanel({ projectId, workingDir, projectName, savedGithubUrl }: CollabSpacePanelProps) {
  const configured = useFirebaseAuthStore((s) => s.configured);
  const initAuth = useFirebaseAuthStore((s) => s.initAuth);
  const initialized = useFirebaseAuthStore((s) => s.initialized);
  const user = useFirebaseAuthStore((s) => s.user);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  if (!configured) {
    return <NotConfiguredState />;
  }
  if (!initialized) {
    return <LoadingState message="Loading…" />;
  }
  if (!user) {
    return <SignInView />;
  }
  return (
    <SignedInView
      projectId={projectId}
      workingDir={workingDir}
      projectName={projectName}
      savedGithubUrl={savedGithubUrl}
    />
  );
}

// ============================================================================
// Signed-in: detect remote, list spaces, create / join
// ============================================================================

function SignedInView({
  projectId,
  workingDir,
  projectName,
  savedGithubUrl,
}: {
  projectId: string;
  workingDir: string;
  projectName: string;
  savedGithubUrl?: string;
}) {
  const user = useFirebaseAuthStore((s) => s.user)!;
  const signOut = useFirebaseAuthStore((s) => s.signOut);

  const detectedRemote = useCollabSpaceStore((s) => s.detectedRemoteByProject[projectId]);
  const detectionLoading = useCollabSpaceStore((s) => s.detectionLoading[projectId]);
  const detectRemote = useCollabSpaceStore((s) => s.detectRemote);
  const setDetectedRemote = useCollabSpaceStore((s) => s.setDetectedRemote);
  const hydrateRemoteFromProject = useCollabSpaceStore((s) => s.hydrateRemoteFromProject);
  const setProjectGithubUrl = useProjectStore((s) => s.setProjectGithubUrl);

  const subscribeForRepo = useCollabSpaceStore((s) => s.subscribeForRepo);
  const unsubscribeForRepo = useCollabSpaceStore((s) => s.unsubscribeForRepo);

  const mineByRepo = useCollabSpaceStore((s) => s.mineByRepo);
  const publicByRepo = useCollabSpaceStore((s) => s.publicByRepo);
  const listLoading = useCollabSpaceStore((s) => s.listLoading);
  const listError = useCollabSpaceStore((s) => s.listError);

  const [showCreate, setShowCreate] = useState(false);
  const [editingRemote, setEditingRemote] = useState(false);
  const [manualRemote, setManualRemoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Resolve the repo: seed the persisted project.githubUrl first, then fall
  // back to local git detection only when the project has no saved URL.
  useEffect(() => {
    if (detectedRemote !== undefined) return;
    if (savedGithubUrl) {
      hydrateRemoteFromProject(projectId, savedGithubUrl);
      return;
    }
    void detectRemote(projectId, workingDir);
  }, [
    projectId,
    workingDir,
    savedGithubUrl,
    detectedRemote,
    hydrateRemoteFromProject,
    detectRemote,
  ]);

  const handleSaveRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = manualRemote.trim();
    if (!raw) {
      setEditingRemote(false);
      return;
    }
    const parsed = parseManualGithubRemote(raw);
    if (!parsed) {
      setSaveError(
        "Enter a canonical GitHub repository URL (e.g. github.com/owner/repo or https://github.com/owner/repo)."
      );
      return;
    }
    const githubUrl = `https://${parsed.canonical}`;
    setSaving(true);
    setSaveError(null);
    try {
      // Persist through the Project API first; only update the parsed cache on
      // success so a failed save never silently "sticks" in the UI.
      await setProjectGithubUrl(projectId, githubUrl);
      setDetectedRemote(projectId, parsed);
      setEditingRemote(false);
    } catch (err) {
      // Tell a rejected repository URL apart from a real connectivity problem;
      // either way the parsed remote cache is left untouched (see comment above).
      if (classifyGithubUrlSaveError(err) === 'invalid-url') {
        setSaveError(
          "That repository URL was rejected by the server. Use the canonical form https://github.com/owner/repo."
        );
      } else {
        setSaveError("Couldn't save the repository. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  // Subscribe to space lists for the current repo
  useEffect(() => {
    if (!detectedRemote) return;
    subscribeForRepo(detectedRemote.canonical, user.uid);
    return () => unsubscribeForRepo(detectedRemote.canonical);
  }, [detectedRemote, user.uid, subscribeForRepo, unsubscribeForRepo]);

  const mySpaces = detectedRemote ? mineByRepo[detectedRemote.canonical] ?? [] : [];
  const publicSpaces = detectedRemote ? publicByRepo[detectedRemote.canonical] ?? [] : [];
  const loading = detectedRemote ? listLoading[detectedRemote.canonical] : false;
  const spacesError = detectedRemote ? listError[detectedRemote.canonical] : null;

  const publicNotMine = useMemo(() => {
    const mineIds = new Set(mySpaces.map((s) => s.id));
    return publicSpaces.filter((s) => !mineIds.has(s.id));
  }, [mySpaces, publicSpaces]);

  return (
    <div className="terminalContent collabSpacePanel">
      <div className="collabSpaceHeader">
        <div className="collabSpaceUser">
          <span className="collabSpaceUserLabel">Signed in as</span>
          <span className="collabSpaceUserEmail">{user.email ?? user.displayName ?? user.uid}</span>
          <button
            type="button"
            className="collabSpaceTextButton"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>

        <div className="collabSpaceRepo">
          <span className="collabSpaceRepoLabel">Repo</span>
          {!editingRemote ? (
            <>
              <span className="collabSpaceRepoValue">
                {detectionLoading
                  ? "detecting…"
                  : detectedRemote
                  ? detectedRemote.canonical
                  : "no remote detected"}
              </span>
              <button
                type="button"
                className="collabSpaceTextButton"
                onClick={() => {
                  setManualRemoteInput(detectedRemote?.canonical ?? "");
                  setSaveError(null);
                  setEditingRemote(true);
                }}
              >
                {detectedRemote ? "change" : "set manually"}
              </button>
            </>
          ) : (
            <form className="collabSpaceRepoEdit" onSubmit={handleSaveRemote}>
              <input
                type="text"
                className="collabSpaceInput"
                placeholder="github.com/owner/repo or https://github.com/owner/repo"
                value={manualRemote}
                onChange={(e) => setManualRemoteInput(e.target.value)}
                disabled={saving}
                autoFocus
              />
              <button type="submit" className="collabSpaceButton" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="collabSpaceTextButton"
                onClick={() => {
                  setSaveError(null);
                  setEditingRemote(false);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
        {saveError && (
          <div className="collabSpaceError" role="alert">
            {saveError}
          </div>
        )}
      </div>

      {!detectedRemote && !detectionLoading && !editingRemote && (
        <EmptyRepoState projectName={projectName} />
      )}

      {detectedRemote && (
        <>
          <div className="collabSpaceActionRow">
            <button
              type="button"
              className="collabSpaceButton collabSpaceButtonPrimary"
              onClick={() => setShowCreate(true)}
            >
              + Create Space
            </button>
          </div>

          {spacesError && (
            <div className="collabSpaceError" role="alert">
              {spacesError}
            </div>
          )}

          {loading && mySpaces.length === 0 && publicSpaces.length === 0 ? (
            <LoadingState message="Loading spaces…" />
          ) : (
            <>
              <Section title="Your Spaces" empty="You haven't joined any spaces for this repo yet.">
                {mySpaces.map((s) => (
                  <SpaceRow key={s.id} space={s} membership="member" />
                ))}
              </Section>

              <Section title="Public Spaces" empty="No public spaces for this repo yet.">
                {publicNotMine.map((s) => (
                  <SpaceRow key={s.id} space={s} membership="visitor" />
                ))}
              </Section>
            </>
          )}

          {showCreate && (
            <CreateSpaceModal
              detectedRemote={detectedRemote}
              onClose={() => setShowCreate(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <div className="collabSpaceSection">
      <div className="collabSpaceSectionTitle">{title}</div>
      {items.length === 0 ? (
        <div className="collabSpaceSectionEmpty">{empty}</div>
      ) : (
        <div className="collabSpaceList">{items}</div>
      )}
    </div>
  );
}

function SpaceRow({
  space,
  membership,
}: {
  space: CollabSpace;
  membership: "member" | "visitor";
}) {
  const user = useFirebaseAuthStore((s) => s.user);
  const joining = useCollabSpaceStore((s) => s.joining);
  const joinSpace = useCollabSpaceStore((s) => s.joinSpace);
  const setActiveId = useSessionStore((s) => s.setActiveId);

  const handleJoin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await joinSpace(user, space.id);
    setActiveId(makeCollabActiveId(space.id));
  };

  const handleOpen = () => {
    setActiveId(makeCollabActiveId(space.id));
  };

  return (
    <div
      className="collabSpaceRow collabSpaceRowClickable"
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      aria-label={`Open space ${space.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
    >
      <div className="collabSpaceRowMain">
        <div className="collabSpaceRowName">
          {space.name}
          {space.visibility === "private" && (
            <span className="collabSpaceVisBadge">private</span>
          )}
        </div>
        {space.description && (
          <div className="collabSpaceRowDescription">{space.description}</div>
        )}
        <div className="collabSpaceRowMeta">
          {space.memberIds.length} member{space.memberIds.length === 1 ? "" : "s"}
        </div>
      </div>
      {membership === "visitor" && user ? (
        <button
          type="button"
          className="collabSpaceButton"
          disabled={joining}
          onClick={handleJoin}
        >
          {joining ? "…" : "Join"}
        </button>
      ) : (
        <span className="collabSpaceRowChevron" aria-hidden="true">›</span>
      )}
    </div>
  );
}

function CreateSpaceModal({
  detectedRemote,
  onClose,
}: {
  detectedRemote: ParsedGitRemote;
  onClose: () => void;
}) {
  const user = useFirebaseAuthStore((s) => s.user)!;
  const creating = useCollabSpaceStore((s) => s.creating);
  const actionError = useCollabSpaceStore((s) => s.actionError);
  const clearActionError = useCollabSpaceStore((s) => s.clearActionError);
  const createSpace = useCollabSpaceStore((s) => s.createSpace);
  const setActiveId = useSessionStore((s) => s.setActiveId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CollabSpaceVisibility>("public");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const created = await createSpace(user, {
        name: name.trim(),
        description: description.trim(),
        githubUrl: detectedRemote.canonical,
        githubHost: detectedRemote.host,
        githubOwner: detectedRemote.owner,
        githubRepo: detectedRemote.repo,
        visibility,
      });
      onClose();
      setActiveId(makeCollabActiveId(created.id));
    } catch {
      // error surfaced via actionError
    }
  };

  return (
    <div className="collabSpaceModalOverlay" onClick={onClose}>
      <div className="collabSpaceModal" onClick={(e) => e.stopPropagation()}>
        <div className="collabSpaceModalTitle">Create a Space</div>
        <form onSubmit={submit} className="collabSpaceForm">
          <label className="collabSpaceField">
            <span className="collabSpaceFieldLabel">Name</span>
            <input
              type="text"
              className="collabSpaceInput"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend Squad"
              autoFocus
              required
            />
          </label>
          <label className="collabSpaceField">
            <span className="collabSpaceFieldLabel">Description</span>
            <textarea
              className="collabSpaceInput"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="optional"
              rows={2}
            />
          </label>
          <label className="collabSpaceField">
            <span className="collabSpaceFieldLabel">GitHub repo</span>
            <input
              type="text"
              className="collabSpaceInput"
              value={detectedRemote.canonical}
              disabled
            />
          </label>
          <div className="collabSpaceVisRow">
            <label className="collabSpaceVisOption">
              <input
                type="radio"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
              />
              Public — anyone with this repo can find it
            </label>
            <label className="collabSpaceVisOption">
              <input
                type="radio"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              Private — invite-only
            </label>
          </div>
          {actionError && (
            <div className="collabSpaceError" onClick={clearActionError}>
              {actionError}
            </div>
          )}
          <div className="collabSpaceFormActions">
            <button type="button" className="collabSpaceTextButton" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="collabSpaceButton collabSpaceButtonPrimary"
              disabled={creating || !name.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Sign-in
// ============================================================================

function SignInView() {
  const error = useFirebaseAuthStore((s) => s.error);
  const loading = useFirebaseAuthStore((s) => s.loading);
  const signInGoogle = useFirebaseAuthStore((s) => s.signInGoogle);
  const signInEmail = useFirebaseAuthStore((s) => s.signInEmail);
  const signUpEmail = useFirebaseAuthStore((s) => s.signUpEmail);
  const clearError = useFirebaseAuthStore((s) => s.clearError);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (mode === "signin") await signInEmail(email, password);
    else await signUpEmail(email, password);
  };

  return (
    <div className="terminalContent collabSpaceSignInContainer">
      <div className="collabSpaceSignInCard">
        <div className="collabSpaceSignInTitle">Sign in to Maestro Collab</div>
        <div className="collabSpaceSignInSubtitle">
          Connect with collaborators on GitHub repos
        </div>

        <button
          type="button"
          className="collabSpaceButton collabSpaceGoogleButton"
          disabled={loading}
          onClick={() => void signInGoogle()}
        >
          {loading ? "…" : "Continue with Google"}
        </button>

        <div className="collabSpaceDivider">
          <span>or</span>
        </div>

        <form onSubmit={submit} className="collabSpaceForm">
          <input
            type="email"
            className="collabSpaceInput"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="collabSpaceInput"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button
            type="submit"
            className="collabSpaceButton collabSpaceButtonPrimary"
            disabled={loading || !email || !password}
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="collabSpaceTextButton collabSpaceSignInToggle"
          onClick={() => {
            clearError();
            setMode(mode === "signin" ? "signup" : "signin");
          }}
        >
          {mode === "signin"
            ? "Don't have an account? Create one"
            : "Already have an account? Sign in"}
        </button>

        {error && (
          <div className="collabSpaceError" onClick={clearError}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty / loading / not configured
// ============================================================================

function NotConfiguredState() {
  return (
    <div className="terminalContent collabSpaceEmptyState">
      <div className="collabSpaceEmptyTitle">Firebase not configured</div>
      <div className="collabSpaceEmptyText">
        Set <code>VITE_FIREBASE_*</code> env vars in <code>maestro-ui/.env.local</code> and
        restart the dev server. See <code>maestro-ui/.env.example</code>.
      </div>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="terminalContent terminalLoadingState">
      <div className="terminalSpinner">
        <span className="terminalSpinnerDot">●</span>
        <span className="terminalSpinnerDot">●</span>
        <span className="terminalSpinnerDot">●</span>
      </div>
      <p className="terminalLoadingText">
        <span className="terminalCursor">█</span> {message}
      </p>
    </div>
  );
}

function EmptyRepoState({ projectName }: { projectName: string }) {
  return (
    <div className="collabSpaceEmptyState">
      <div className="collabSpaceEmptyTitle">No GitHub remote detected</div>
      <div className="collabSpaceEmptyText">
        <code>{projectName}</code> isn't a git repo with an <code>origin</code> remote, or the
        remote isn't a recognized host. Click <em>set manually</em> above to enter one.
      </div>
    </div>
  );
}
