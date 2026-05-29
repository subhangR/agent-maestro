import React, { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useJoinedSpacesStore } from "../../stores/useJoinedSpacesStore";
import { CollabSpace } from "../../firebase/collabSpaceTypes";
import {
    SpaceShareClient,
    SharedTaskInput,
    SharedTeamMemberInput,
    SharedSpellInput,
} from "../../firebase/SpaceShareClient";

export type ShareKind = "task" | "team-member" | "spell";

export type SharePayload =
    | { kind: "task"; data: SharedTaskInput; entityLabel: string }
    | { kind: "team-member"; data: SharedTeamMemberInput; entityLabel: string }
    | { kind: "spell"; data: SharedSpellInput; entityLabel: string };

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
};

export const ShareToSpaceModal: React.FC<Props> = ({ payload, onClose }) => {
    const user = useAuthStore((s) => s.user);
    const start = useJoinedSpacesStore((s) => s.start);
    const spaces = useJoinedSpacesStore((s) => s.spaces);
    const loading = useJoinedSpacesStore((s) => s.loading);

    const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ spaceName: string } | null>(null);

    const meta = KIND_LABELS[payload.kind];

    useEffect(() => {
        if (user) start(user.uid);
    }, [user, start]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const sortedSpaces = useMemo(
        () => [...spaces].sort((a, b) => a.name.localeCompare(b.name)),
        [spaces],
    );

    const selectedSpace: CollabSpace | null =
        sortedSpaces.find((s) => s.id === selectedSpaceId) ?? null;

    const handleSubmit = async () => {
        if (!user || !selectedSpace || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            if (payload.kind === "task") {
                await SpaceShareClient.shareTask(user, selectedSpace.id, payload.data);
            } else if (payload.kind === "team-member") {
                await SpaceShareClient.shareTeamMember(user, selectedSpace.id, payload.data);
            } else {
                await SpaceShareClient.shareSpell(user, selectedSpace.id, payload.data);
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
                    <span className="spaceShareEntityName">{payload.entityLabel}</span>
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
                            <button
                                type="button"
                                className="spaceModalPrimaryBtn"
                                onClick={onClose}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="spaceShareSpaceListLabel">Pick a space</div>

                        <div className="spaceShareSpaceList">
                            {!user && (
                                <div className="spaceShareEmpty">
                                    Sign in to share to a Collab Space.
                                </div>
                            )}
                            {user && loading && spaces.length === 0 && (
                                <div className="spaceShareEmpty">Loading your spaces…</div>
                            )}
                            {user && !loading && sortedSpaces.length === 0 && (
                                <div className="spaceShareEmpty">
                                    You haven't joined any Collab Spaces yet. Create or join
                                    one from the Collab tab on the left rail.
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
                                                {sp.memberIds.length}{" "}
                                                {sp.memberIds.length === 1 ? "member" : "members"}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <span
                                                className="spaceShareSpaceCheck"
                                                aria-hidden="true"
                                            >
                                                ✓
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {payload.kind === "team-member" && (
                            <p className="spaceModalHint">
                                The identity prompt and command permissions become visible to
                                every member of the space.
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
                                disabled={!selectedSpace || submitting}
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
