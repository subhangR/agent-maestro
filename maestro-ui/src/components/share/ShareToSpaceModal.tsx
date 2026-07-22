import React, { useEffect, useMemo, useState } from "react";
import { useFirebaseAuthStore } from "../../stores/useFirebaseAuthStore";
import { useJoinedSpacesStore } from "../../stores/useJoinedSpacesStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { maestroClient } from "../../utils/MaestroClient";
import { parseManualGithubRemote } from "../../utils/parseGitRemote";
import { CollabSpace } from "../../firebase/collabSpaceTypes";
import {
  SpaceShareClient,
  SharedTaskInput,
  SharedTeamMemberInput,
  SharedSpellInput,
  SharedDocInput,
} from "../../firebase/SpaceShareClient";
import { buildDocShareInput, docShareBlockReason } from "../../hooks/useSpaceSharing";
import type { DocEntry } from "../../app/types/maestro";
import "../../styles-space-docs.css";

export type ShareKind = "task" | "team-member" | "spell" | "doc";

export type SharePayload =
  | { kind: "task"; data: SharedTaskInput; entityLabel: string }
  | { kind: "team-member"; data: SharedTeamMemberInput; entityLabel: string }
  | { kind: "spell"; data: SharedSpellInput; entityLabel: string }
  /** A caller may provide a concrete document, otherwise the modal presents a picker. */
  | { kind: "doc"; data?: SharedDocInput; entityLabel?: string };

type Props = {
  payload: SharePayload;
  onClose: () => void;
};

const KIND_LABELS: Record<ShareKind, { title: string; verb: string; previewLabel: string }> = {
  task: {
    title: "Share task to a Collab Space",
    verb: "Share task",
    previewLabel: "Task",
  },
  "team-member": {
    title: "Publish team member to a Collab Space",
    verb: "Publish",
    previewLabel: "Team member",
  },
  spell: {
    title: "Publish spell to a Collab Space",
    verb: "Publish",
    previewLabel: "Spell",
  },
  doc: {
    title: "Share doc to a Collab Space",
    verb: "Share doc",
    previewLabel: "Doc",
  },
};

/**
 * Both project bindings and Collab Space records use GitHub's canonical
 * owner/repository identity, but project records keep the https form while
 * Firestore space records use the bare form. Parse both through the strict
 * GitHub contract before comparing them so malformed records fail closed.
 */
function canonicalGithubRepo(value: string | undefined): string | null {
  return value ? (parseManualGithubRemote(value)?.canonical ?? null) : null;
}

export const ShareToSpaceModal: React.FC<Props> = ({ payload, onClose }) => {
  const user = useFirebaseAuthStore((s) => s.user);
  const start = useJoinedSpacesStore((s) => s.start);
  const spaces = useJoinedSpacesStore((s) => s.spaces);
  const loading = useJoinedSpacesStore((s) => s.loading);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProjectGithubUrl = useProjectStore(
    (s) => s.projects.find((project) => project.id === s.activeProjectId)?.githubUrl,
  );

  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ spaceName: string } | null>(null);

  // Doc picker state — only used when payload.kind === "doc".
  const [localDocs, setLocalDocs] = useState<DocEntry[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const meta = KIND_LABELS[payload.kind];

  useEffect(() => {
    if (user) start(user.uid);
  }, [user, start]);

  useEffect(() => {
    if (payload.kind !== "doc") return;
    let alive = true;
    if (!activeProjectId) {
      setLocalDocs([]);
      return;
    }
    maestroClient
      .getProjectDocs(activeProjectId)
      .then((entries) => alive && setLocalDocs(entries))
      .catch((e) => alive && setDocsError(e?.message ?? "Failed to load project docs."));
    return () => {
      alive = false;
    };
  }, [payload.kind, activeProjectId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Sharing is repository-scoped. Deliberately rely only on the active
  // project's persisted binding, never a transient locally detected remote.
  const activeProjectRepo = useMemo(
    () => canonicalGithubRepo(activeProjectGithubUrl),
    [activeProjectGithubUrl],
  );
  const sortedSpaces = useMemo(() => {
    if (!activeProjectRepo) return [];
    return spaces
      .filter((space) => canonicalGithubRepo(space.githubUrl) === activeProjectRepo)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [spaces, activeProjectRepo]);

  const selectedSpace: CollabSpace | null =
    sortedSpaces.find((s) => s.id === selectedSpaceId) ?? null;

  const selectedDoc: DocEntry | null =
    payload.kind === "doc" && !payload.data
      ? ((localDocs ?? []).find((d) => d.id === selectedDocId) ?? null)
      : null;

  const entityLabel =
    payload.kind === "doc"
      ? (payload.data?.title ?? selectedDoc?.title ?? payload.entityLabel ?? "Pick a doc below")
      : payload.entityLabel;

  const canSubmit =
    !!selectedSpace &&
    (payload.kind !== "doc" || !!payload.data || (!!selectedDoc && !!activeProjectId));

  const handleSubmit = async () => {
    if (!user || !selectedSpace || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (payload.kind === "task") {
        await SpaceShareClient.shareTask(user, selectedSpace.id, payload.data);
      } else if (payload.kind === "team-member") {
        await SpaceShareClient.shareTeamMember(user, selectedSpace.id, payload.data);
      } else if (payload.kind === "spell") {
        await SpaceShareClient.shareSpell(user, selectedSpace.id, payload.data);
      } else {
        if (payload.data) {
          await SpaceShareClient.shareDoc(user, selectedSpace.id, payload.data);
        } else if (!selectedDoc || !activeProjectId) {
          setError("Pick a doc to share first.");
          return;
        } else {
          // buildDocShareInput throws a clear error on empty/oversized content.
          await SpaceShareClient.shareDoc(
            user,
            selectedSpace.id,
            buildDocShareInput(selectedDoc, activeProjectId),
          );
        }
      }
      setResult({ spaceName: selectedSpace.name });
    } catch (e: any) {
      setError(e?.message ?? "Failed to share. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="spaceModalOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="spaceModal spaceModal--share" onClick={(e) => e.stopPropagation()}>
        <div className="spaceModalTitle">{meta.title}</div>

        <div className="spaceShareEntityPreview">
          <span className="spaceShareEntityKindLabel">{meta.previewLabel}</span>
          <span className="spaceShareEntityName">{entityLabel}</span>
        </div>

        {result ? (
          <div className="spaceShareSuccess">
            <div className="spaceShareSuccessTitle">
              Shared to <strong>{result.spaceName}</strong>
            </div>
            <div className="spaceShareSuccessBody">
              Members of this space can now pull it into their local projects.
            </div>
            <div className="spaceModalActions">
              <button type="button" className="spaceModalPrimaryBtn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {payload.kind === "doc" && !payload.data && (
              <>
                <div className="spaceShareSpaceListLabel">Pick a doc</div>
                <div className="spaceShareSpaceList spaceShareDocList">
                  {!activeProjectId ? (
                    <div className="spaceShareEmpty">
                      No active local project. Open a project first, then share one of its docs.
                    </div>
                  ) : docsError ? (
                    <div className="spaceShareEmpty">{docsError}</div>
                  ) : localDocs === null ? (
                    <div className="spaceShareEmpty">Loading project docs…</div>
                  ) : localDocs.length === 0 ? (
                    <div className="spaceShareEmpty">
                      This project has no docs yet. Docs written by sessions show up here.
                    </div>
                  ) : (
                    localDocs.map((d) => {
                      const blocked = docShareBlockReason(d);
                      const isSelected = d.id === selectedDocId;
                      return (
                        <button
                          type="button"
                          key={d.id}
                          className={`spaceShareSpaceRow ${
                            isSelected ? "spaceShareSpaceRow--selected" : ""
                          } ${blocked ? "spaceDocPickerRow--blocked" : ""}`}
                          onClick={() => !blocked && setSelectedDocId(d.id)}
                          disabled={!!blocked}
                          title={blocked ?? undefined}
                          aria-label={blocked ? `${d.title} (${blocked})` : `Share doc ${d.title}`}
                        >
                          <span className="spaceShareSpaceAvatar" aria-hidden="true">
                            {d.kind === "diagram" ? "◇" : "📄"}
                          </span>
                          <div className="spaceShareSpaceMain">
                            <div className="spaceShareSpaceName">{d.title}</div>
                            <div className="spaceShareSpaceSubtitle">
                              {d.kind === "diagram" ? "Diagram" : "Markdown"}
                              {blocked && <span className="spaceDocPickerHint"> · {blocked}</span>}
                            </div>
                          </div>
                          {isSelected && (
                            <span className="spaceShareSpaceCheck" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}

            <div className="spaceShareSpaceListLabel">Pick a space</div>

            <div className="spaceShareSpaceList">
              {!user && <div className="spaceShareEmpty">Sign in to share to a Collab Space.</div>}
              {user && loading && spaces.length === 0 && (
                <div className="spaceShareEmpty">Loading your spaces…</div>
              )}
              {user && !loading && !activeProjectRepo && (
                <div className="spaceShareEmpty">
                  Connect a canonical GitHub repository to the active project before sharing to a
                  Collab Space.
                </div>
              )}
              {user && !loading && activeProjectRepo && sortedSpaces.length === 0 && (
                <div className="spaceShareEmpty">
                  You haven't joined any Collab Spaces yet. Create or join one from the Collab tab
                  on the left rail.
                </div>
              )}
              {sortedSpaces.map((sp) => {
                const isSelected = sp.id === selectedSpaceId;
                return (
                  <button
                    type="button"
                    key={sp.id}
                    className={`spaceShareSpaceRow ${
                      isSelected ? "spaceShareSpaceRow--selected" : ""
                    }`}
                    onClick={() => setSelectedSpaceId(sp.id)}
                  >
                    <span className="spaceShareSpaceAvatar" aria-hidden="true">
                      {(sp.name?.[0] ?? "?").toUpperCase()}
                    </span>
                    <div className="spaceShareSpaceMain">
                      <div className="spaceShareSpaceName">{sp.name}</div>
                      <div className="spaceShareSpaceSubtitle">
                        {sp.visibility === "private" ? "Private" : "Public"}
                        {" · "}
                        {sp.memberIds.length} {sp.memberIds.length === 1 ? "member" : "members"}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="spaceShareSpaceCheck" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {payload.kind === "team-member" && (
              <p className="spaceModalHint">
                The identity prompt and command permissions become visible to every member of the
                space.
              </p>
            )}

            {error && <div className="spaceShareError">{error}</div>}

            <div className="spaceModalActions">
              <button
                type="button"
                className="spaceSectionDetailGhostBtn"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="spaceModalPrimaryBtn"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                {submitting ? "Sharing…" : meta.verb}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
