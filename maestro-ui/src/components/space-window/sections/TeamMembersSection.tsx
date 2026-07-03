import React, { useEffect, useMemo, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import { maestroClient } from "../../../utils/MaestroClient";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import { SpaceTeamMembersClient } from "../../../firebase/SpaceTeamMembersClient";
import { adoptSpaceTeamMember } from "../../../firebase/SpaceAdapters";
import { SpaceTeamMember } from "../../../firebase/spaceShareTypes";
import type { TeamMember } from "../../../app/types/maestro";
import {
    useSpaceTeamMembers,
    resolveOrigin,
    canManageEntity,
    formatRelative,
    buildTeamMemberShareInput,
} from "../../../hooks/useSpaceSharing";
import "../../../styles-space-sharing.css";

type Props = {
    space: CollabSpace;
};

function permissionPills(cp: SpaceTeamMember["commandPermissions"]): string[] {
    const pills: string[] = [];
    for (const [k, v] of Object.entries(cp?.groups ?? {})) if (v) pills.push(k);
    for (const [k, v] of Object.entries(cp?.commands ?? {})) if (v) pills.push(k);
    return pills;
}

export const TeamMembersSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const { items: team, loading, error, retry } = useSpaceTeamMembers(space.id);

    const [search, setSearch] = useState("");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [publishOpen, setPublishOpen] = useState(false);
    const [errorDismissed, setErrorDismissed] = useState(false);

    const [adopting, setAdopting] = useState<Set<string>>(new Set());
    const [optimisticAdopted, setOptimisticAdopted] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<Set<string>>(new Set());
    const [rowError, setRowError] = useState<Record<string, string>>({});

    useEffect(() => setErrorDismissed(false), [error]);

    const filtered = useMemo(
        () =>
            team.filter((m) => {
                if (deleting.has(m.id)) return false;
                return search.trim()
                    ? `${m.name} ${m.identity} ${m.role}`.toLowerCase().includes(search.toLowerCase())
                    : true;
            }),
        [team, search, deleting],
    );

    const isAdopted = (m: SpaceTeamMember) =>
        optimisticAdopted.has(m.id) || (user ? (m.adoptedByUids ?? []).includes(user.uid) : false);

    const adoptionCount = (m: SpaceTeamMember) => {
        const base = m.adoptionCount ?? (m.adoptedByUids ?? []).length;
        const alreadyCounted = user ? (m.adoptedByUids ?? []).includes(user.uid) : false;
        return optimisticAdopted.has(m.id) && !alreadyCounted ? base + 1 : base;
    };

    const handleAdopt = async (m: SpaceTeamMember) => {
        if (!user) return;
        if (!activeProjectId) {
            setRowError((p) => ({ ...p, [m.id]: "Open a local project to adopt into it." }));
            return;
        }
        setRowError((p) => {
            const n = { ...p };
            delete n[m.id];
            return n;
        });
        setAdopting((p) => new Set(p).add(m.id));
        try {
            await adoptSpaceTeamMember(user, m, activeProjectId);
            setOptimisticAdopted((p) => new Set(p).add(m.id));
        } catch (e: any) {
            setRowError((p) => ({ ...p, [m.id]: e?.message ?? "Adopt failed. Try again." }));
        } finally {
            setAdopting((p) => {
                const n = new Set(p);
                n.delete(m.id);
                return n;
            });
        }
    };

    const handleDelete = async (m: SpaceTeamMember) => {
        setDeleting((p) => new Set(p).add(m.id));
        try {
            await SpaceTeamMembersClient.delete(space.id, m.id);
        } catch (e: any) {
            setRowError((p) => ({ ...p, [m.id]: e?.message ?? "Delete failed." }));
            setDeleting((p) => {
                const n = new Set(p);
                n.delete(m.id);
                return n;
            });
        }
    };

    const showError = error && !errorDismissed;

    return (
        <section className="spaceEntityPane spaceEntityPane--team">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Team Members</span>
                    <span className="spaceEntityCount">{team.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <input
                        type="text"
                        className="spaceEntitySearchInput"
                        placeholder="Search agents…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn"
                        onClick={() => setPublishOpen(true)}
                        disabled={!user}
                        title={user ? undefined : "Sign in to publish"}
                    >
                        + Publish from local
                    </button>
                </div>
            </header>

            {showError && (
                <div className="spaceSharingError" role="alert">
                    <span className="spaceSharingErrorMsg">{error}</span>
                    <button type="button" className="spaceSharingErrorRetry" onClick={retry}>
                        Retry
                    </button>
                    <button
                        type="button"
                        className="spaceSharingErrorDismiss"
                        aria-label="Dismiss"
                        onClick={() => setErrorDismissed(true)}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="spaceEntityBody">
                {loading && team.length === 0 ? (
                    <div className="spaceSharingSkeletonList" aria-busy="true">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="spaceSharingSkeletonRow spaceSharingSkeletonRow--tall" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    team.length === 0 ? (
                        <EmptySectionState
                            title="No shared team members yet"
                            body="Publish your most-used agents so the rest of the space can adopt them with one click."
                            action={
                                user
                                    ? { label: "Publish from local", onClick: () => setPublishOpen(true) }
                                    : undefined
                            }
                        />
                    ) : (
                        <div className="spaceEntityNoResults">No agents match this search.</div>
                    )
                ) : (
                    <div className="spaceEntityList">
                        {filtered.map((m) => {
                            const expanded = expandedId === m.id;
                            const origin = resolveOrigin(space, m.sourceUserId ?? m.createdBy);
                            const canManage = canManageEntity(space, user?.uid, m.createdBy);
                            const adopted = isAdopted(m);
                            const isAdopting = adopting.has(m.id);
                            const pills = permissionPills(m.commandPermissions);
                            return (
                                <article
                                    key={m.id}
                                    className={`spaceTeamItem ${expanded ? "spaceTeamItem--expanded" : ""} ${isAdopting ? "spaceTeamItem--pending" : ""}`}
                                >
                                    <button
                                        type="button"
                                        className="spaceTeamItemHeader"
                                        onClick={() => setExpandedId(expanded ? null : m.id)}
                                        aria-expanded={expanded}
                                    >
                                        <div className="spaceTeamItemAvatar">
                                            {m.name[0]?.toUpperCase() ?? "?"}
                                        </div>
                                        <div className="spaceTeamItemTitleWrap">
                                            <div className="spaceTeamItemName">{m.name}</div>
                                            <div className="spaceTeamItemSubtitle">
                                                {m.mode && <span className="spaceModeBadge">{m.mode}</span>}
                                                {m.model && (
                                                    <span className="spaceTeamItemModel">{m.model}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="spaceTeamItemMeta">
                                            <span style={{ color: origin.color }}>
                                                @{origin.displayName}
                                            </span>
                                            <span className="spaceTeamItemAdoptions">
                                                ↑ {adoptionCount(m)}
                                            </span>
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="spaceTeamItemDetail">
                                            {m.identity && (
                                                <div className="spaceTeamItemSection">
                                                    <span className="spaceEntityMetaLabel">
                                                        Identity prompt
                                                    </span>
                                                    <pre className="spaceTeamItemIdentity">
                                                        {m.identity}
                                                    </pre>
                                                </div>
                                            )}
                                            {m.agentTool && (
                                                <div className="spaceTeamItemRow">
                                                    <span className="spaceEntityMetaLabel">Agent tool</span>
                                                    <span className="spaceTeamItemMono">{m.agentTool}</span>
                                                </div>
                                            )}
                                            {pills.length > 0 && (
                                                <div className="spaceTeamItemRow">
                                                    <span className="spaceEntityMetaLabel">Permissions</span>
                                                    <span className="spaceTeamItemPermsWrap">
                                                        {pills.map((p) => (
                                                            <span key={p} className="spaceTeamPermPill">
                                                                {p}
                                                            </span>
                                                        ))}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="spaceTeamItemRow">
                                                <span className="spaceEntityMetaLabel">
                                                    published {formatRelative(m.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="spaceTeamItemActions">
                                        {adopted ? (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--success"
                                                disabled
                                            >
                                                ✓ Adopted
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={`spaceEntityPrimaryBtn ${isAdopting ? "spaceSharingBtn--pending" : ""}`}
                                                onClick={() => handleAdopt(m)}
                                                disabled={!user || isAdopting}
                                                title={user ? undefined : "Sign in to adopt"}
                                            >
                                                {isAdopting ? (
                                                    <>
                                                        <span className="spaceSharingBtnSpinner" />
                                                        Adopting…
                                                    </>
                                                ) : (
                                                    "Adopt locally"
                                                )}
                                            </button>
                                        )}
                                        {canManage && (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--danger"
                                                onClick={() => handleDelete(m)}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                    {rowError[m.id] && (
                                        <div className="spaceSharingRowError">{rowError[m.id]}</div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {publishOpen && user && (
                <PublishTeamMemberModal
                    space={space}
                    projectId={activeProjectId}
                    onClose={() => setPublishOpen(false)}
                />
            )}
        </section>
    );
};

function PublishTeamMemberModal({
    space,
    projectId,
    onClose,
}: {
    space: CollabSpace;
    projectId: string;
    onClose: () => void;
}) {
    const user = useFirebaseAuthStore((s) => s.user);
    const [localTeam, setLocalTeam] = useState<TeamMember[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        if (!projectId) {
            setLocalTeam([]);
            return;
        }
        maestroClient
            .getTeamMembers(projectId)
            .then((tms) => alive && setLocalTeam(tms.filter((t) => t.status !== "archived")))
            .catch((e) => alive && setLoadError(e?.message ?? "Failed to load team members."));
        return () => {
            alive = false;
        };
    }, [projectId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handlePublish = async () => {
        if (!user || !selectedId || !localTeam) return;
        const tm = localTeam.find((t) => t.id === selectedId);
        if (!tm) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            await SpaceShareClient.shareTeamMember(user, space.id, buildTeamMemberShareInput(tm));
            onClose();
        } catch (e: any) {
            setSubmitError(e?.message ?? "Publish failed. Try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="spaceModalTitle">Publish team member</div>
                <p className="spaceModalBody">
                    Pick a team member from your active project. Its identity prompt and command
                    permissions will be visible to everyone in this space.
                </p>

                {!projectId ? (
                    <div className="spaceSharingPickerEmpty">
                        No active local project. Open a project first.
                    </div>
                ) : loadError ? (
                    <div className="spaceSharingPickerEmpty">{loadError}</div>
                ) : localTeam === null ? (
                    <div className="spaceSharingPickerLoading">
                        <span className="spaceSharingSpinner" />
                        Loading team members…
                    </div>
                ) : localTeam.length === 0 ? (
                    <div className="spaceSharingPickerEmpty">
                        This project has no team members to publish yet.
                    </div>
                ) : (
                    <div className="spacePushPickerList">
                        {localTeam.map((lm) => {
                            const checked = selectedId === lm.id;
                            return (
                                <label
                                    key={lm.id}
                                    className={`spacePushPickerRow ${checked ? "spacePushPickerRow--checked" : ""}`}
                                >
                                    <input
                                        type="radio"
                                        name="local-team"
                                        checked={checked}
                                        onChange={() => setSelectedId(lm.id)}
                                    />
                                    <div className="spacePushPickerBody">
                                        <div className="spacePushPickerTitle">{lm.name}</div>
                                        <div className="spacePushPickerProject">
                                            {lm.mode && <span className="spaceModeBadge">{lm.mode}</span>}{" "}
                                            {lm.model && (
                                                <span className="spaceTeamItemMono">{lm.model}</span>
                                            )}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}

                <p className="spaceModalHint">Be sure the identity prompt has no secrets.</p>
                {submitError && <div className="spaceShareError">{submitError}</div>}

                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        disabled={!selectedId || submitting}
                        onClick={handlePublish}
                    >
                        {submitting ? "Publishing…" : "Publish"}
                    </button>
                </div>
            </div>
        </div>
    );
}
