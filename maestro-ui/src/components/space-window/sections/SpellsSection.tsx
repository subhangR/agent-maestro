import React, { useEffect, useId, useMemo, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { maestroClient } from "../../../utils/MaestroClient";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import { SpaceSpellsClient } from "../../../firebase/SpaceSpellsClient";
import { installSpaceSpell, SpellInstallResult } from "../../../firebase/SpaceAdapters";
import { SpaceSpell } from "../../../firebase/spaceShareTypes";
import type { Spell } from "../../../app/types/maestro";
import {
    useSpaceSpells,
    resolveOrigin,
    canManageEntity,
    formatRelative,
    buildSpellShareInput,
} from "../../../hooks/useSpaceSharing";
import { useModalA11y } from "../shared/useModalA11y";
import "../../../styles-space-sharing.css";

type Props = {
    space: CollabSpace;
};

type ConflictState = {
    spell: SpaceSpell;
    conflictingName: string;
};

export const SpellsSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const { items: spells, loading, error, retry } = useSpaceSpells(space.id);

    const [search, setSearch] = useState("");
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [publishOpen, setPublishOpen] = useState(false);
    const [editSpell, setEditSpell] = useState<SpaceSpell | null>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);

    const [installing, setInstalling] = useState<Set<string>>(new Set());
    const [optimisticInstalled, setOptimisticInstalled] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<Set<string>>(new Set());
    const [rowError, setRowError] = useState<Record<string, string>>({});
    const [conflict, setConflict] = useState<ConflictState | null>(null);

    // Error dismissal is per-error: a new error re-shows the banner.
    useEffect(() => setErrorDismissed(false), [error]);

    // Per-space optimistic overlays must not leak into another space.
    useEffect(() => {
        setInstalling(new Set());
        setOptimisticInstalled(new Set());
        setDeleting(new Set());
        setRowError({});
        setPreviewId(null);
        setEditSpell(null);
        setConflict(null);
        setErrorDismissed(false);
    }, [space.id]);

    const filtered = useMemo(
        () =>
            spells.filter((sp) => {
                if (deleting.has(sp.id)) return false;
                return search.trim()
                    ? `${sp.name} ${sp.description}`.toLowerCase().includes(search.toLowerCase())
                    : true;
            }),
        [spells, search, deleting],
    );

    const isInstalled = (sp: SpaceSpell) =>
        optimisticInstalled.has(sp.id) ||
        (user ? (sp.installedByUids ?? []).includes(user.uid) : false);

    const installCount = (sp: SpaceSpell) => {
        const base = sp.installCount ?? (sp.installedByUids ?? []).length;
        const alreadyCounted = user ? (sp.installedByUids ?? []).includes(user.uid) : false;
        return optimisticInstalled.has(sp.id) && !alreadyCounted ? base + 1 : base;
    };

    const applyResult = (sp: SpaceSpell, result: SpellInstallResult) => {
        if (result.status === "installed" || result.status === "replaced") {
            setOptimisticInstalled((p) => new Set(p).add(sp.id));
        } else if (result.status === "conflict") {
            setConflict({ spell: sp, conflictingName: result.conflictingName ?? sp.name });
        }
    };

    const runInstall = async (
        sp: SpaceSpell,
        options?: Parameters<typeof installSpaceSpell>[2],
    ) => {
        if (!user) return;
        setRowError((p) => {
            const n = { ...p };
            delete n[sp.id];
            return n;
        });
        setInstalling((p) => new Set(p).add(sp.id));
        try {
            const result = await installSpaceSpell(user, sp, options);
            applyResult(sp, result);
        } catch (e: any) {
            setRowError((p) => ({
                ...p,
                [sp.id]: e?.message ?? "Couldn't install. Check your connection and try again.",
            }));
        } finally {
            setInstalling((p) => {
                const n = new Set(p);
                n.delete(sp.id);
                return n;
            });
        }
    };

    const handleDelete = async (sp: SpaceSpell) => {
        // Permission guard at the action, not just the hidden button.
        if (!canManageEntity(space, user?.uid, sp.createdBy)) return;
        setDeleting((p) => new Set(p).add(sp.id));
        try {
            await SpaceSpellsClient.delete(space.id, sp.id);
        } catch (e: any) {
            setRowError((p) => ({
                ...p,
                [sp.id]: e?.message ?? "Couldn't delete. Check your connection and try again.",
            }));
            setDeleting((p) => {
                const n = new Set(p);
                n.delete(sp.id);
                return n;
            });
        }
    };

    const showError = error && !errorDismissed;

    return (
        <section className="spaceEntityPane spaceEntityPane--spells">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Spells</span>
                    <span className="spaceEntityCount">{spells.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <input
                        type="text"
                        className="spaceEntitySearchInput"
                        placeholder="Search spells…"
                        aria-label="Search spells"
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
                    <span className="spaceSharingErrorIcon" aria-hidden="true">⚠</span>
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
                {loading && spells.length === 0 ? (
                    <div className="spaceSharingSkeletonList" aria-busy="true">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="spaceSharingSkeletonRow spaceSharingSkeletonRow--tall" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    spells.length === 0 ? (
                        <EmptySectionState
                            title="No shared spells yet"
                            body="Publish a spell to give every member a one-click shortcut to your favorite prompts."
                            action={
                                user
                                    ? { label: "Publish from local", onClick: () => setPublishOpen(true) }
                                    : undefined
                            }
                        />
                    ) : (
                        <div className="spaceEntityNoResults">No spells match this search.</div>
                    )
                ) : (
                    <div className="spaceEntityList spaceEntityList--spells">
                        {filtered.map((sp) => {
                            const open = previewId === sp.id;
                            const origin = resolveOrigin(space, sp.sourceUserId ?? sp.createdBy);
                            const canManage = canManageEntity(space, user?.uid, sp.createdBy);
                            const installed = isInstalled(sp);
                            const isInstalling = installing.has(sp.id);
                            return (
                                <article
                                    key={sp.id}
                                    className={`spaceSpellItem ${open ? "spaceSpellItem--expanded" : ""} ${isInstalling ? "spaceSpellItem--pending" : ""}`}
                                >
                                    <div className="spaceSpellItemHeader">
                                        <div className="spaceSpellItemTitleWrap">
                                            <span className="spaceSpellItemName">/{sp.name}</span>
                                            <span className="spaceSpellItemTargetWrap">
                                                {sp.rules && sp.rules.length > 0 ? (
                                                    <span className="spaceSpellTargetPill">
                                                        {sp.rules.length} rule{sp.rules.length === 1 ? "" : "s"}
                                                    </span>
                                                ) : sp.entityType ? (
                                                    <span className="spaceSpellTargetPill">
                                                        {sp.entityType}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                        <div className="spaceSpellItemMeta">
                                            <span style={{ color: origin.color }}>
                                                @{origin.displayName}
                                            </span>
                                            <span className="spaceSpellItemAt">
                                                {formatRelative(sp.createdAt)}
                                            </span>
                                            <span className="spaceSpellItemInstalls">
                                                ↑ {installCount(sp)}
                                            </span>
                                        </div>
                                    </div>

                                    {sp.description && (
                                        <p className="spaceSpellItemDesc">{sp.description}</p>
                                    )}

                                    {open && (
                                        <pre className="spaceSpellItemBody">
                                            {sp.body || sp.description || "No preview available."}
                                        </pre>
                                    )}

                                    <div className="spaceSpellItemActions">
                                        {installed ? (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--success"
                                                disabled
                                            >
                                                ✓ Installed
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={`spaceEntityPrimaryBtn ${isInstalling ? "spaceSharingBtn--pending" : ""}`}
                                                onClick={() => runInstall(sp)}
                                                disabled={!user || isInstalling}
                                                title={user ? undefined : "Sign in to install"}
                                            >
                                                {isInstalling ? (
                                                    <>
                                                        <span className="spaceSharingBtnSpinner" />
                                                        Installing…
                                                    </>
                                                ) : (
                                                    "Install"
                                                )}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="spaceEntityGhostBtn"
                                            onClick={() => setPreviewId(open ? null : sp.id)}
                                        >
                                            {open ? "Hide" : "Preview"}
                                        </button>
                                        {canManage && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="spaceEntityGhostBtn"
                                                    onClick={() => {
                                                        if (canManage) setEditSpell(sp);
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="spaceEntityGhostBtn spaceEntityGhostBtn--danger"
                                                    onClick={() => handleDelete(sp)}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {rowError[sp.id] && (
                                        <div className="spaceSharingRowError" role="alert">
                                            <span aria-hidden="true">⚠ </span>
                                            {rowError[sp.id]}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {publishOpen && user && (
                <PublishSpellModal space={space} onClose={() => setPublishOpen(false)} />
            )}
            {/* Render-level permission guard: the modal cannot open (or stay open)
                for users who lost edit rights, regardless of how it was triggered. */}
            {editSpell && canManageEntity(space, user?.uid, editSpell.createdBy) && (
                <EditSpellModal
                    space={space}
                    spell={editSpell}
                    onClose={() => setEditSpell(null)}
                />
            )}
            {conflict && (
                <SpellConflictModal
                    conflictingName={conflict.conflictingName}
                    onCancel={() => setConflict(null)}
                    onReplace={() => {
                        const sp = conflict.spell;
                        setConflict(null);
                        void runInstall(sp, { onConflict: "replace" });
                    }}
                    onRename={(name) => {
                        const sp = conflict.spell;
                        setConflict(null);
                        void runInstall(sp, { onConflict: "rename", nameOverride: name });
                    }}
                />
            )}
        </section>
    );
};

function PublishSpellModal({
    space,
    onClose,
}: {
    space: CollabSpace;
    onClose: () => void;
}) {
    const user = useFirebaseAuthStore((s) => s.user);
    const [localSpells, setLocalSpells] = useState<Spell[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const titleId = useId();
    const modalRef = useModalA11y<HTMLDivElement>(onClose);

    useEffect(() => {
        let alive = true;
        maestroClient
            .listSpells()
            .then((s) => alive && setLocalSpells(s))
            .catch(
                (e) =>
                    alive &&
                    setLoadError(
                        e?.message ?? "Couldn't load spells. Check the server and try again.",
                    ),
            );
        return () => {
            alive = false;
        };
    }, []);

    const handlePublish = async () => {
        if (!user || !selectedId || !localSpells) return;
        const spell = localSpells.find((s) => s.id === selectedId);
        if (!spell) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            await SpaceShareClient.shareSpell(user, space.id, buildSpellShareInput(spell));
            onClose();
        } catch (e: any) {
            setSubmitError(e?.message ?? "Couldn't publish. Check your connection and try again.");
            setSubmitting(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                ref={modalRef}
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="spaceModalTitle" id={titleId}>Publish spell</div>
                <p className="spaceModalBody">
                    Pick a spell from your library to share with everyone in this space.
                </p>

                {loadError ? (
                    <div className="spaceSharingPickerEmpty">{loadError}</div>
                ) : localSpells === null ? (
                    <div className="spaceSharingPickerLoading">
                        <span className="spaceSharingSpinner" />
                        Loading spells…
                    </div>
                ) : localSpells.length === 0 ? (
                    <div className="spaceSharingPickerEmpty">
                        You have no spells to publish yet.
                    </div>
                ) : (
                    <div className="spacePushPickerList">
                        {localSpells.map((sp) => {
                            const checked = selectedId === sp.id;
                            return (
                                <label
                                    key={sp.id}
                                    className={`spacePushPickerRow ${checked ? "spacePushPickerRow--checked" : ""}`}
                                >
                                    <input
                                        type="radio"
                                        name="local-spell"
                                        checked={checked}
                                        onChange={() => setSelectedId(sp.id)}
                                    />
                                    <div className="spacePushPickerBody">
                                        <div className="spacePushPickerTitle">/{sp.name}</div>
                                        <div className="spacePushPickerProject">
                                            {sp.description || `${sp.rules?.length ?? 0} rule(s)`}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                )}

                {submitError && (
                    <div className="spaceShareError" role="alert">
                        <span aria-hidden="true">⚠ </span>
                        {submitError}
                    </div>
                )}

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

function EditSpellModal({
    space,
    spell,
    onClose,
}: {
    space: CollabSpace;
    spell: SpaceSpell;
    onClose: () => void;
}) {
    const [name, setName] = useState(spell.name);
    const [description, setDescription] = useState(spell.description);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const titleId = useId();
    const modalRef = useModalA11y<HTMLDivElement>(onClose);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        setSaveError(null);
        try {
            await SpaceSpellsClient.update(space.id, spell.id, {
                name: name.trim(),
                description,
            });
            onClose();
        } catch (e: any) {
            setSaveError(e?.message ?? "Couldn't save. Check your connection and try again.");
            setSaving(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div
                ref={modalRef}
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="spaceModalTitle" id={titleId}>Edit shared spell</div>
                <input
                    type="text"
                    className="spaceEntitySearchInput"
                    style={{ width: "100%", marginBottom: 10 }}
                    value={name}
                    placeholder="Spell name"
                    aria-label="Spell name"
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                />
                <textarea
                    className="spaceEntitySearchInput"
                    style={{ width: "100%", minHeight: 80, marginBottom: 10, resize: "vertical" }}
                    value={description}
                    placeholder="Description"
                    aria-label="Spell description"
                    maxLength={2000}
                    onChange={(e) => setDescription(e.target.value)}
                />
                {saveError && (
                    <div className="spaceShareError" role="alert">
                        <span aria-hidden="true">⚠ </span>
                        {saveError}
                    </div>
                )}
                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        disabled={!name.trim() || saving}
                        onClick={handleSave}
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SpellConflictModal({
    conflictingName,
    onCancel,
    onReplace,
    onRename,
}: {
    conflictingName: string;
    onCancel: () => void;
    onReplace: () => void;
    onRename: (name: string) => void;
}) {
    const [renameValue, setRenameValue] = useState(`${conflictingName}-2`);
    const [renaming, setRenaming] = useState(false);
    const titleId = useId();
    const modalRef = useModalA11y<HTMLDivElement>(onCancel);

    return (
        <div className="spaceModalOverlay" onClick={onCancel}>
            <div
                ref={modalRef}
                className="spaceModal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="spaceModalTitle" id={titleId}>Spell already exists</div>
                <p className="spaceModalBody">
                    A spell named <strong>/{conflictingName}</strong> is already in your library.
                    Replace it, install under a new name, or cancel.
                </p>

                {renaming && (
                    <input
                        type="text"
                        className="spaceEntitySearchInput"
                        style={{ width: "100%", marginBottom: 10 }}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder="New spell name"
                        aria-label="New spell name"
                    />
                )}

                <div className="spaceModalActions">
                    <button type="button" className="spaceEntityGhostBtn" onClick={onCancel}>
                        Cancel
                    </button>
                    {renaming ? (
                        <button
                            type="button"
                            className="spaceModalPrimaryBtn"
                            disabled={!renameValue.trim()}
                            onClick={() => onRename(renameValue.trim())}
                        >
                            Install as /{renameValue.trim()}
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="spaceEntityGhostBtn"
                                onClick={() => setRenaming(true)}
                            >
                                Rename
                            </button>
                            <button
                                type="button"
                                className="spaceModalPrimaryBtn"
                                onClick={onReplace}
                            >
                                Replace
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
