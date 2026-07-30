import React, { useEffect, useMemo, useRef, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import { maestroClient } from "../../../utils/MaestroClient";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import { SpaceDocsClient } from "../../../firebase/SpaceDocsClient";
import { pullSpaceDocToLocal } from "../../../firebase/SpaceAdapters";
import { SpaceDoc, SpaceDocKind } from "../../../firebase/spaceShareTypes";
import type { DocEntry, MaestroSession } from "../../../app/types/maestro";
import {
    useSpaceDocs,
    resolveOrigin,
    canManageEntity,
    formatRelative,
    buildDocShareInput,
    docShareBlockReason,
} from "../../../hooks/useSpaceSharing";
import "../../../styles-space-sharing.css";
import "../../../styles-space-docs.css";

/** Longest content slice rendered in the inline preview (full doc travels on pull). */
const PREVIEW_MAX_CHARS = 4000;

type Props = {
    space: CollabSpace;
};

export const DocsSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const { items: docs, loading, error, retry } = useSpaceDocs(space.id);

    const [search, setSearch] = useState("");
    const [pushOpen, setPushOpen] = useState(false);
    const [pullDoc, setPullDoc] = useState<SpaceDoc | null>(null);
    const [editDoc, setEditDoc] = useState<SpaceDoc | null>(null);
    const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<SpaceDoc | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);

    // Optimistic overlays: rows the user just pulled / deleted before the
    // subscription reconciles.
    const [optimisticPulled, setOptimisticPulled] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<Set<string>>(new Set());
    const [rowError, setRowError] = useState<Record<string, string>>({});

    useEffect(() => setErrorDismissed(false), [error]);

    const filtered = useMemo(
        () =>
            docs.filter((d) => {
                if (deleting.has(d.id)) return false;
                if (search.trim()) {
                    const q = search.toLowerCase();
                    if (!d.title.toLowerCase().includes(q)) return false;
                }
                return true;
            }),
        [docs, search, deleting],
    );

    const isPulled = (d: SpaceDoc) =>
        optimisticPulled.has(d.id) || (user ? (d.pulledByUids ?? []).includes(user.uid) : false);

    const pulledCount = (d: SpaceDoc) => {
        const base = new Set(d.pulledByUids ?? []);
        if (optimisticPulled.has(d.id) && user) base.add(user.uid);
        return base.size;
    };

    const clearRowError = (id: string) =>
        setRowError((p) => {
            const n = { ...p };
            delete n[id];
            return n;
        });

    const handleDelete = async (d: SpaceDoc) => {
        setConfirmDeleteDoc(null);
        clearRowError(d.id);
        setDeleting((p) => new Set(p).add(d.id));
        try {
            await SpaceDocsClient.delete(space.id, d.id);
        } catch (e: any) {
            setRowError((p) => ({ ...p, [d.id]: e?.message ?? "Delete failed." }));
            setDeleting((p) => {
                const n = new Set(p);
                n.delete(d.id);
                return n;
            });
        }
    };

    const showError = error && !errorDismissed;

    return (
        <section className="spaceEntityPane spaceEntityPane--docs" aria-label="Shared docs">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Docs</span>
                    <span className="spaceEntityCount">{docs.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <input
                        type="text"
                        className="spaceEntitySearchInput pn-input"
                        placeholder="Search docs…"
                        aria-label="Search shared docs"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn pn-btn pn-btn--primary"
                        onClick={() => setPushOpen(true)}
                        disabled={!user}
                        title={user ? undefined : "Sign in to push docs"}
                    >
                        + Push from local
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
                        aria-label="Dismiss error"
                        onClick={() => setErrorDismissed(true)}
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="spaceEntityBody">
                {loading && docs.length === 0 ? (
                    <div className="spaceSharingSkeletonList" aria-busy="true" aria-label="Loading shared docs">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="spaceSharingSkeletonRow" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    docs.length === 0 ? (
                        <EmptySectionState
                            icon="📄"
                            title="No docs shared yet"
                            body="Share a project doc to give every member a copy they can pull locally."
                            action={
                                user
                                    ? { label: "Push from local", onClick: () => setPushOpen(true) }
                                    : undefined
                            }
                        />
                    ) : (
                        <div className="spaceEntityNoResults">
                            No docs match the current search.
                        </div>
                    )
                ) : (
                    <div className="spaceEntityList">
                        {filtered.map((d) => {
                            const expanded = expandedId === d.id;
                            const origin = resolveOrigin(space, d.sourceUserId ?? d.createdBy);
                            const canManage = canManageEntity(space, user?.uid, d.createdBy);
                            const pulled = isPulled(d);
                            return (
                                <article key={d.id} className={`spaceDocItem ${expanded ? "spaceDocItem--expanded" : ""}`}>
                                    <button
                                        type="button"
                                        className="spaceDocItemHeader"
                                        onClick={() => setExpandedId(expanded ? null : d.id)}
                                        aria-expanded={expanded}
                                        aria-label={`${expanded ? "Collapse" : "Expand"} doc ${d.title}`}
                                    >
                                        <div className="spaceDocItemTitleWrap">
                                            <KindBadge kind={d.kind} />
                                            <span className="spaceDocItemTitle">{d.title}</span>
                                        </div>
                                        <div className="spaceDocItemMeta">
                                            <span
                                                className="spaceDocItemAuthor"
                                                style={{ color: origin.color }}
                                            >
                                                @{origin.displayName}
                                            </span>
                                            <span className="spaceDocItemAt">
                                                {formatRelative(d.createdAt)}
                                            </span>
                                        </div>
                                    </button>

                                    {expanded && (
                                        <div className="spaceDocItemDetail">
                                            <DocPreview doc={d} />
                                            <div className="spaceDocItemDetailMeta">
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Pulled by</span>{" "}
                                                    {pulledCount(d)}{" "}
                                                    {pulledCount(d) === 1 ? "member" : "members"}
                                                </span>
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Kind</span>{" "}
                                                    {d.kind}
                                                </span>
                                                <span>
                                                    <span className="spaceEntityMetaLabel">Size</span>{" "}
                                                    {d.content.length.toLocaleString()} chars
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="spaceDocItemActions">
                                        {pulled ? (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--success pn-btn pn-btn--ghost"
                                                disabled
                                            >
                                                ✓ Pulled
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="spaceEntityPrimaryBtn pn-btn pn-btn--primary"
                                                onClick={() => {
                                                    clearRowError(d.id);
                                                    setPullDoc(d);
                                                }}
                                                disabled={!user}
                                                title={user ? undefined : "Sign in to pull"}
                                            >
                                                ⤓ Pull to local
                                            </button>
                                        )}
                                        {canManage && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="spaceEntityGhostBtn pn-btn pn-btn--ghost"
                                                    onClick={() => setEditDoc(d)}
                                                    aria-label={`Edit title of ${d.title}`}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="spaceEntityGhostBtn spaceEntityGhostBtn--danger pn-btn pn-btn--ghost pn-btn--danger"
                                                    onClick={() => setConfirmDeleteDoc(d)}
                                                    aria-label={`Delete ${d.title}`}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {rowError[d.id] && (
                                        <div className="spaceSharingRowError">{rowError[d.id]}</div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {pushOpen && user && (
                <PushDocsModal
                    space={space}
                    projectId={activeProjectId}
                    onClose={() => setPushOpen(false)}
                />
            )}
            {pullDoc && user && (
                <PullDocModal
                    doc={pullDoc}
                    projectId={activeProjectId}
                    onClose={() => setPullDoc(null)}
                    onPulled={(docId) => {
                        setOptimisticPulled((p) => new Set(p).add(docId));
                        setPullDoc(null);
                    }}
                />
            )}
            {editDoc && (
                <EditDocModal
                    space={space}
                    doc={editDoc}
                    onClose={() => setEditDoc(null)}
                />
            )}
            {confirmDeleteDoc && (
                <ConfirmDeleteModal
                    doc={confirmDeleteDoc}
                    onCancel={() => setConfirmDeleteDoc(null)}
                    onConfirm={() => handleDelete(confirmDeleteDoc)}
                />
            )}
        </section>
    );
};

function KindBadge({ kind }: { kind: SpaceDocKind }) {
    return (
        <span className={`spaceDocKindBadge spaceDocKindBadge--${kind}`}>
            {kind === "diagram" ? "Diagram" : "Markdown"}
        </span>
    );
}

function DocPreview({ doc }: { doc: SpaceDoc }) {
    const truncated = doc.content.length > PREVIEW_MAX_CHARS;
    const slice = truncated ? doc.content.slice(0, PREVIEW_MAX_CHARS) : doc.content;
    if (!doc.content) {
        return <div className="spaceDocPreviewEmpty">This doc has no content.</div>;
    }
    return (
        <div className="spaceDocPreviewWrap">
            <pre className="spaceDocPreview" tabIndex={0} aria-label={`Preview of ${doc.title}`}>
                {slice}
            </pre>
            {truncated && (
                <div className="spaceDocPreviewTruncated">
                    Preview truncated — the full doc travels when you pull it.
                </div>
            )}
        </div>
    );
}

/**
 * Shared dialog plumbing: Esc to close, focus moves into the dialog on open
 * and the overlay click dismisses (clicks inside are stopped by the caller).
 */
function useDialog(onClose: () => void) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        ref.current?.focus();
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return ref;
}

/* ------------------------------------------------------------------ */
/*  Push modal — pick local project docs and share them into the space */
/* ------------------------------------------------------------------ */

function PushDocsModal({
    space,
    projectId,
    onClose,
}: {
    space: CollabSpace;
    projectId: string;
    onClose: () => void;
}) {
    const user = useFirebaseAuthStore((s) => s.user);
    const projects = useProjectStore((s) => s.projects);
    const projectName = projects.find((p) => p.id === projectId)?.name ?? "local project";
    const dialogRef = useDialog(onClose);

    const [localDocs, setLocalDocs] = useState<DocEntry[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        if (!projectId) {
            setLocalDocs([]);
            return;
        }
        maestroClient
            .getProjectDocs(projectId)
            .then((entries) => alive && setLocalDocs(entries))
            .catch((e) => alive && setLoadError(e?.message ?? "Failed to load local docs."));
        return () => {
            alive = false;
        };
    }, [projectId]);

    const toggle = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handlePush = async () => {
        if (!user || selectedIds.size === 0 || !localDocs) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const chosen = localDocs.filter((d) => selectedIds.has(d.id));
            for (const d of chosen) {
                await SpaceShareClient.shareDoc(user, space.id, buildDocShareInput(d, projectId));
            }
            onClose();
        } catch (e: any) {
            setSubmitError(e?.message ?? "Push failed. Try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="spaceModal pn-mdl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="spacePushDocsTitle"
            >
                <div className="spaceModalTitle pn-mdl__titleinput" id="spacePushDocsTitle">
                    Push docs to space
                </div>
                <p className="spaceModalBody">
                    Pick docs from <strong>{projectName}</strong> to share with everyone in this
                    space. Everyone gets their own copy — it won't live-sync.
                </p>

                {!projectId ? (
                    <div className="spaceSharingPickerEmpty">
                        No active local project. Open a project first, then push its docs.
                    </div>
                ) : loadError ? (
                    <div className="spaceSharingPickerEmpty">{loadError}</div>
                ) : localDocs === null ? (
                    <div className="spaceSharingPickerLoading">
                        <span className="spaceSharingSpinner" />
                        Loading local docs…
                    </div>
                ) : localDocs.length === 0 ? (
                    <div className="spaceSharingPickerEmpty">
                        This project has no docs to push yet. Docs written by sessions show up
                        here.
                    </div>
                ) : (
                    <div className="spacePushPickerList">
                        {localDocs.map((ld) => {
                            const blocked = docShareBlockReason(ld);
                            const checked = selectedIds.has(ld.id);
                            return (
                                <label
                                    key={ld.id}
                                    className={`spacePushPickerRow ${checked ? "spacePushPickerRow--checked" : ""} ${blocked ? "spaceDocPickerRow--blocked" : ""}`}
                                    title={blocked ?? undefined}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!!blocked}
                                        onChange={() => toggle(ld.id)}
                                        aria-label={
                                            blocked
                                                ? `${ld.title} (${blocked})`
                                                : `Select doc ${ld.title}`
                                        }
                                    />
                                    <div className="spacePushPickerBody">
                                        <div className="spacePushPickerTitle">{ld.title}</div>
                                        <div className="spacePushPickerProject">
                                            {ld.kind === "diagram" ? "diagram" : "markdown"}
                                            {blocked && (
                                                <span className="spaceDocPickerHint"> · {blocked}</span>
                                            )}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}

                {submitError && <div className="spaceShareError">{submitError}</div>}

                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn pn-btn pn-btn--ghost"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn pn-btn pn-btn--primary"
                        disabled={selectedIds.size === 0 || submitting}
                        onClick={handlePush}
                    >
                        {submitting
                            ? "Pushing…"
                            : `Push ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Pull modal — choose the target session for the local copy          */
/* ------------------------------------------------------------------ */

function PullDocModal({
    doc,
    projectId,
    onClose,
    onPulled,
}: {
    doc: SpaceDoc;
    projectId: string;
    onClose: () => void;
    onPulled: (spaceDocId: string) => void;
}) {
    const user = useFirebaseAuthStore((s) => s.user);
    const projects = useProjectStore((s) => s.projects);
    const projectName = projects.find((p) => p.id === projectId)?.name ?? "your project";
    const dialogRef = useDialog(onClose);

    const [sessions, setSessions] = useState<MaestroSession[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [pulling, setPulling] = useState(false);
    const [pullError, setPullError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        if (!projectId) {
            setSessions([]);
            return;
        }
        maestroClient
            .getSessions()
            .then((all) => {
                if (!alive) return;
                const forProject = all
                    .filter((s) => s.projectId === projectId && !s.archivedAt)
                    .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0));
                setSessions(forProject);
                // Default target: the most recently active session.
                setSelectedSessionId(forProject[0]?.id ?? null);
            })
            .catch((e) => alive && setLoadError(e?.message ?? "Failed to load sessions."));
        return () => {
            alive = false;
        };
    }, [projectId]);

    const handlePull = async () => {
        if (!user || !selectedSessionId || pulling) return;
        setPulling(true);
        setPullError(null);
        try {
            await pullSpaceDocToLocal(user, doc, selectedSessionId);
            onPulled(doc.id);
        } catch (e: any) {
            setPullError(e?.message ?? "Pull failed. Try again.");
            setPulling(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="spaceModal pn-mdl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="spacePullDocTitle"
            >
                <div className="spaceModalTitle pn-mdl__titleinput" id="spacePullDocTitle">
                    Pull “{doc.title}” to local
                </div>
                <p className="spaceModalBody">
                    Local docs live on a session. Choose which session of{" "}
                    <strong>{projectName}</strong> should receive the copy.
                </p>

                {!projectId ? (
                    <div className="spaceSharingPickerEmpty">
                        No active local project. Open a project first, then pull this doc into
                        one of its sessions.
                    </div>
                ) : loadError ? (
                    <div className="spaceSharingPickerEmpty">{loadError}</div>
                ) : sessions === null ? (
                    <div className="spaceSharingPickerLoading">
                        <span className="spaceSharingSpinner" />
                        Loading sessions…
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="spaceSharingPickerEmpty">
                        This project has no sessions yet. Docs attach to a session — spawn or
                        start a session first, then pull this doc into it.
                    </div>
                ) : (
                    <div
                        className="spaceDocPullTargetList"
                        role="radiogroup"
                        aria-label="Target session"
                    >
                        {sessions.map((s) => {
                            const selected = s.id === selectedSessionId;
                            return (
                                <button
                                    type="button"
                                    key={s.id}
                                    role="radio"
                                    aria-checked={selected}
                                    className={`spaceDocPullTargetRow ${selected ? "spaceDocPullTargetRow--selected" : ""}`}
                                    onClick={() => setSelectedSessionId(s.id)}
                                >
                                    <span className="spaceDocPullTargetName">{s.name}</span>
                                    <span className="spaceDocPullTargetMeta">
                                        {s.status}
                                        {s.lastActivity
                                            ? ` · active ${relativeMs(s.lastActivity)}`
                                            : ""}
                                    </span>
                                    {selected && (
                                        <span className="spaceDocPullTargetCheck" aria-hidden="true">
                                            ✓
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {pullError && <div className="spaceShareError">{pullError}</div>}

                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn pn-btn pn-btn--ghost"
                        onClick={onClose}
                        disabled={pulling}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn pn-btn pn-btn--primary"
                        disabled={!user || !selectedSessionId || pulling}
                        onClick={handlePull}
                    >
                        {pulling ? (
                            <>
                                <span className="spaceSharingBtnSpinner" />
                                Pulling…
                            </>
                        ) : (
                            "Pull doc"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Relative time for local epoch-ms timestamps (sessions use ms, not Firestore Timestamps). */
function relativeMs(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    const min = Math.floor(diff / 60_000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Edit modal — creator/owner can rename the shared doc               */
/* ------------------------------------------------------------------ */

function EditDocModal({
    space,
    doc,
    onClose,
}: {
    space: CollabSpace;
    doc: SpaceDoc;
    onClose: () => void;
}) {
    const dialogRef = useDialog(onClose);
    const [title, setTitle] = useState(doc.title);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        setSaveError(null);
        try {
            await SpaceDocsClient.update(space.id, doc.id, { title: title.trim() });
            onClose();
        } catch (e: any) {
            setSaveError(e?.message ?? "Save failed. Try again.");
            setSaving(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="spaceModal pn-mdl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="spaceEditDocTitle"
            >
                <div className="spaceModalTitle pn-mdl__titleinput" id="spaceEditDocTitle">
                    Edit shared doc
                </div>
                <input
                    type="text"
                    className="spaceEntitySearchInput spaceDocEditTitleInput pn-input"
                    value={title}
                    placeholder="Title"
                    aria-label="Doc title"
                    maxLength={200}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />

                {saveError && <div className="spaceShareError">{saveError}</div>}

                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn pn-btn pn-btn--ghost"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn pn-btn pn-btn--primary"
                        disabled={!title.trim() || saving}
                        onClick={handleSave}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Delete confirmation                                                 */
/* ------------------------------------------------------------------ */

function ConfirmDeleteModal({
    doc,
    onCancel,
    onConfirm,
}: {
    doc: SpaceDoc;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const dialogRef = useDialog(onCancel);
    return (
        <div className="spaceModalOverlay" onClick={onCancel}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="spaceModal pn-mdl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="spaceDeleteDocTitle"
            >
                <div className="spaceModalTitle pn-mdl__titleinput" id="spaceDeleteDocTitle">
                    Delete shared doc?
                </div>
                <p className="spaceModalBody">
                    “{doc.title}” will be removed for everyone in this space. Copies members
                    already pulled stay in their local projects.
                </p>
                <div className="spaceModalActions">
                    <button type="button" className="spaceEntityGhostBtn pn-btn pn-btn--ghost" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn spaceDocDeleteConfirmBtn pn-btn pn-btn--danger"
                        onClick={onConfirm}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
