import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFirebaseAuthStore } from "../../stores/useFirebaseAuthStore";
import { useCollabSpaceStore } from "../../stores/useCollabSpaceStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { useSessionStore } from "../../stores/useSessionStore";
import { CollabSpace, CollabSpaceVisibility } from "../../firebase/collabSpaceTypes";
import {
  ParsedGitRemote,
  parseGitRemote,
  parseManualGithubRemote,
  toGithubUrlForPersistence,
} from "../../utils/parseGitRemote";
import { makeCollabActiveId } from "../../app/types/space";
import { CollabSpaceClient } from "../../firebase/CollabSpaceClient";
import { parseInviteLink } from "../../firebase/spaceInvite";
import { CollabNotificationBell } from "../collab/CollabNotificationBell";
import { SpaceAvatar } from "../space-window/SpaceAvatar";

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

/** Normalizes a legacy saved URL before comparing it to a detected remote. */
function canonicalSavedGithubUrl(githubUrl: string | undefined): string | null {
  if (!githubUrl) return null;
  const parsed = parseGitRemote(githubUrl);
  return parsed ? toGithubUrlForPersistence(parsed) : null;
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
  const repoSaveInFlight = useRef<Promise<boolean> | null>(null);
  const savedCanonicalGithubUrl = canonicalSavedGithubUrl(savedGithubUrl);

  /**
   * A Collab Space is repo-scoped, but the repo connection belongs to one
   * local Maestro project. Keep that project binding durable before we expose
   * the repo's spaces. The ref coalesces automatic detection and a quick
   * "Create Space" click into one PUT.
   */
  const ensureProjectRepoLinked = useCallback(async (parsed: ParsedGitRemote): Promise<boolean> => {
    const githubUrl = toGithubUrlForPersistence(parsed);
    // The current Collab security/data model is GitHub-repository scoped. Do
    // not expose a session-only space list for a remote that cannot be bound
    // to the Project aggregate durably.
    if (!githubUrl) {
      setSaveError('Collab Spaces currently require a canonical GitHub repository. Set one manually to continue.');
      return false;
    }
    if (savedCanonicalGithubUrl === githubUrl) return true;
    if (repoSaveInFlight.current) return repoSaveInFlight.current;

    setSaving(true);
    setSaveError(null);
    const request = setProjectGithubUrl(projectId, githubUrl)
      .then(() => true)
      .catch((err) => {
        if (classifyGithubUrlSaveError(err) === 'invalid-url') {
          setSaveError(
            "The detected repository isn't a supported canonical GitHub URL. Set it manually to continue.",
          );
        } else {
          setSaveError(
            "We found this repository but couldn't save its connection to the project. Check your connection and try again.",
          );
        }
        return false;
      })
      .finally(() => {
        repoSaveInFlight.current = null;
        setSaving(false);
      });
    repoSaveInFlight.current = request;
    return request;
  }, [projectId, savedCanonicalGithubUrl, setProjectGithubUrl]);

  // The panel stays mounted while users switch projects. Clear local UI state
  // that belongs to the previous project so a create/edit flow can never leak
  // into the newly selected project's repository context.
  useEffect(() => {
    setShowCreate(false);
    setEditingRemote(false);
    setManualRemoteInput('');
    setSaveError(null);
  }, [projectId]);

  // Resolve the repo: seed the persisted project.githubUrl first, then fall
  // back to local git detection only when the project has no saved URL. A
  // detected GitHub origin is immediately persisted so reopening the desktop
  // app never relies on this transient cache again.
  useEffect(() => {
    if (detectedRemote !== undefined) return;
    if (savedGithubUrl) {
      hydrateRemoteFromProject(projectId, savedGithubUrl);
      return;
    }
    void detectRemote(projectId, workingDir).then((parsed) => {
      if (parsed) void ensureProjectRepoLinked(parsed);
    });
  }, [
    projectId,
    workingDir,
    savedGithubUrl,
    detectedRemote,
    hydrateRemoteFromProject,
    detectRemote,
    ensureProjectRepoLinked,
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
    const githubUrl = toGithubUrlForPersistence(parsed);
    if (!githubUrl) {
      setSaveError("Only canonical GitHub repositories can be connected to a Collab Space.");
      return;
    }
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

  const detectedGithubUrl = detectedRemote
    ? toGithubUrlForPersistence(detectedRemote)
    : null;
  const projectRepoLinked = Boolean(
    detectedGithubUrl && savedCanonicalGithubUrl === detectedGithubUrl,
  );

  // Subscribe to space lists only after the repo has a durable binding on the
  // current local project. This keeps spaces from leaking across project tabs
  // through a transient remote-detection result.
  useEffect(() => {
    if (!detectedRemote || !projectRepoLinked) return;
    subscribeForRepo(detectedRemote.canonical, user.uid);
    return () => unsubscribeForRepo(detectedRemote.canonical);
  }, [detectedRemote, projectRepoLinked, user.uid, subscribeForRepo, unsubscribeForRepo]);

  const mySpaces = detectedRemote ? mineByRepo[detectedRemote.canonical] ?? [] : [];
  const publicSpaces = detectedRemote ? publicByRepo[detectedRemote.canonical] ?? [] : [];
  const loading = detectedRemote ? listLoading[detectedRemote.canonical] : false;
  const spacesError = detectedRemote ? listError[detectedRemote.canonical] : null;

  const publicNotMine = useMemo(() => {
    const mineIds = new Set(mySpaces.map((s) => s.id));
    return publicSpaces.filter((s) => !mineIds.has(s.id));
  }, [mySpaces, publicSpaces]);

  const openCreateSpace = async () => {
    if (!detectedRemote || saving) return;
    // Creating a shared space must never be the only place that remembers a
    // project's repository. For GitHub remotes, require the durable project
    // binding first; then the space can reliably reappear for this project.
    if (!(await ensureProjectRepoLinked(detectedRemote))) return;
    setShowCreate(true);
  };

  return (
    <div className="terminalContent collabSpacePanel">
      <div className="collabSpaceHeader">
        <div className="collabSpaceUser">
          <span className="collabSpaceUserLabel">Signed in as</span>
          <span className="collabSpaceUserEmail">{user.email ?? user.displayName ?? user.uid}</span>
          <CollabNotificationBell />
          <button
            type="button"
            className="collabSpaceTextButton"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>

        <div className="collabSpaceRepo">
          <span className="collabSpaceRepoLabel">GitHub repo</span>
          {!editingRemote ? (
            <>
              <span className="collabSpaceRepoValue">
                {detectionLoading
                  ? "detecting…"
                  : detectedRemote
                  ? detectedRemote.canonical
                  : "No GitHub repo linked yet"}
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
                {detectedRemote ? "Change" : "Link a GitHub repo"}
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

      <PrivateInviteJoinCard />

      {!detectedRemote && !detectionLoading && !editingRemote && (
        <EmptyRepoState projectName={projectName} />
      )}

      {detectedRemote && !projectRepoLinked && (
        <div className="collabSpaceSectionEmpty" role="status">
          {saving
            ? 'Connecting this repository to the current project…'
            : 'Connect this repository to this project before viewing its spaces.'}
        </div>
      )}

      {detectedRemote && projectRepoLinked && (
        <>
          <div className="collabSpaceActionRow">
            <button
              type="button"
              className="collabSpaceButton collabSpaceButtonPrimary"
              onClick={() => void openCreateSpace()}
              disabled={saving}
            >
              {saving ? "Saving repository…" : "+ Create Space"}
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

/**
 * Browser builds can open the generated /space/:id/join/:inviteId route directly.
 * Desktop builds retain the same recovery path: paste the link or enter the
 * code here after signing in. No repository connection is needed to redeem.
 */
function PrivateInviteJoinCard() {
  const user = useFirebaseAuthStore((s) => s.user);
  const setActiveId = useSessionStore((s) => s.setActiveId);
  const parsed = useMemo(
    () => (typeof window === "undefined" ? null : parseInviteLink(window.location.href)),
    [],
  );
  const [spaceId, setSpaceId] = useState(parsed?.spaceId ?? "");
  const [invite, setInvite] = useState(parsed?.inviteId ?? "");
  const [open, setOpen] = useState(Boolean(parsed));
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pastedLink = useMemo(() => parseInviteLink(invite.trim()), [invite]);
  const autoRedeemed = useRef(false);

  // Auto-redeem a deep-link invite as soon as the user is signed in.
  // Guard with a ref so it only fires once per component mount.
  useEffect(() => {
    if (autoRedeemed.current || !parsed || !user) return;
    autoRedeemed.current = true;
    setOpen(true);
    setJoining(true);
    setError(null);
    CollabSpaceClient.redeemInvite(user, parsed.spaceId, parsed.inviteId)
      .then(() => {
        setActiveId(makeCollabActiveId(parsed.spaceId));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Couldn't join this private space.");
      })
      .finally(() => {
        setJoining(false);
      });
  }, [parsed, user, setActiveId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetSpaceId = pastedLink?.spaceId ?? spaceId.trim();
    const targetInvite = pastedLink?.inviteId ?? invite.trim();
    if (!user || !targetSpaceId || !targetInvite) return;
    setJoining(true);
    setError(null);
    try {
      await CollabSpaceClient.redeemInvite(user, targetSpaceId, targetInvite);
      setActiveId(makeCollabActiveId(targetSpaceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join this private space.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <section className="collabInviteJoin" aria-label="Join a private space">
      <button type="button" className="collabSpaceTextButton" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "Hide private invite" : "Have a private invite or join code?"}
      </button>
      {open && (
        <form className="collabInviteJoinForm" onSubmit={submit}>
          <input className="collabSpaceInput" value={spaceId} onChange={(event) => setSpaceId(event.target.value)} placeholder="Space ID (not needed for a full link)" aria-label="Private space ID" disabled={joining || Boolean(pastedLink)} />
          <input className="collabSpaceInput" value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="Paste a full invite link or enter a join code" aria-label="Invite link or join code" required disabled={joining} />
          <button type="submit" className="collabSpaceButton" disabled={joining || !invite.trim() || (!spaceId.trim() && !pastedLink)}>{joining ? "Joining…" : "Join private space"}</button>
          {error && <div className="collabSpaceError" role="alert">{error}</div>}
        </form>
      )}
    </section>
  );
}

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
      <SpaceAvatar colorKey={space.id} name={space.name} size={36} />
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
          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="4.5" cy="4" r="1.8" />
            <circle cx="8.5" cy="4" r="1.5" />
            <path d="M1 10c0-1.7 1.6-2.8 3.5-2.8s3.5 1.1 3.5 2.8" strokeLinecap="round" />
            <path d="M8 7.5c1.4 0 2.7.8 2.7 2.3" strokeLinecap="round" />
          </svg>
          {space.memberIds.length} member{space.memberIds.length === 1 ? "" : "s"}
        </div>
      </div>
      {membership === "visitor" && user ? (
        <button
          type="button"
          className="collabSpaceButton collabSpaceButtonJoin"
          disabled={joining}
          onClick={handleJoin}
        >
          {joining ? "Joining…" : "Join"}
        </button>
      ) : (
        <span className="collabSpaceRowChevron" aria-hidden="true">
          <svg viewBox="0 0 8 12" width="6" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l5 5-5 5" />
          </svg>
        </span>
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
          <div className="collabSpaceField">
            <span className="collabSpaceFieldLabel">GitHub repo</span>
            <div className="collabSpaceInputReadOnly">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ opacity: 0.5 }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {detectedRemote.canonical}
            </div>
          </div>
          <div className="collabSpaceVisRow">
            <label className="collabSpaceVisOption">
              <input
                type="radio"
                name="space-visibility"
                checked={visibility === "public"}
                onChange={() => setVisibility("public")}
              />
              <span>
                <span className="collabSpaceVisOptionTitle">Public</span>
                <span className="collabSpaceVisOptionDesc"> — any signed-in Maestro user can find and join it</span>
              </span>
            </label>
            <label className="collabSpaceVisOption">
              <input
                type="radio"
                name="space-visibility"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
              />
              <span>
                <span className="collabSpaceVisOptionTitle">Private</span>
                <span className="collabSpaceVisOptionDesc"> — invite-only</span>
              </span>
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
          {!loading && (
            <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
          )}
          {loading ? "Signing in…" : "Continue with Google"}
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
