import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { CollabSpace, CollabSpaceMember } from "../../../firebase/collabSpaceTypes";
import { CollabSpaceClient } from "../../../firebase/CollabSpaceClient";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { useModalA11y } from "../shared/useModalA11y";

type Props = {
    space: CollabSpace;
};

export const SettingsSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);

    const [name, setName] = useState(space.name);
    const [description, setDescription] = useState(space.description ?? "");
    const [visibility, setVisibility] = useState<"public" | "private">(space.visibility);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);
    const savedTimer = useRef<number | null>(null);

    const [confirm, setConfirm] = useState<null | "leave" | "delete">(null);
    const [dangerBusy, setDangerBusy] = useState(false);
    const [dangerError, setDangerError] = useState<string | null>(null);

    const myRole = user ? space.members[user.uid]?.role : undefined;
    const isOwner = myRole === "owner";
    const canManage = myRole === "owner" || myRole === "admin";

    const admins = useMemo<CollabSpaceMember[]>(
        () =>
            Object.values(space.members ?? {})
                .filter((m): m is CollabSpaceMember => Boolean(m) && (m.role === "owner" || m.role === "admin"))
                .sort((a) => (a.role === "owner" ? -1 : 1)),
        [space.members],
    );

    const dirty =
        name !== space.name ||
        description !== (space.description ?? "") ||
        visibility !== space.visibility;

    const discard = () => {
        setName(space.name);
        setDescription(space.description ?? "");
        setVisibility(space.visibility);
        setSaveError(null);
    };

    // Clear the pending "Saved" timer on unmount.
    useEffect(() => {
        return () => {
            if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
        };
    }, []);

    const save = async () => {
        // Permission guard at the action, not just disabled inputs.
        if (!canManage || !dirty || saving) return;
        setSaving(true);
        setSaveError(null);
        setJustSaved(false);
        try {
            await CollabSpaceClient.update(space.id, {
                name: name.trim() || space.name,
                description: description.trim(),
                visibility,
            });
            // The live subscription pushes the updated space back down as a prop,
            // which recomputes `dirty` to false. No manual reset needed.
            setJustSaved(true);
            if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
            savedTimer.current = window.setTimeout(() => setJustSaved(false), 2000);
        } catch (e: any) {
            setSaveError(
                e?.message ?? "Couldn't save changes. Check your connection and try again.",
            );
        } finally {
            setSaving(false);
        }
    };

    const doLeave = async () => {
        if (!user || dangerBusy) return;
        setDangerBusy(true);
        setDangerError(null);
        try {
            await CollabSpaceClient.leave(user, space.id);
            // The space subscription re-renders SpaceWindow into its not-member state.
        } catch (e: any) {
            setDangerError(
                e?.message ?? "Couldn't leave the space. Check your connection and try again.",
            );
            setDangerBusy(false);
            setConfirm(null);
        }
    };

    const doDelete = async () => {
        // Permission guard at the action: only the owner may delete.
        if (!isOwner || dangerBusy) return;
        setDangerBusy(true);
        setDangerError(null);
        try {
            await CollabSpaceClient.delete(space.id);
            // The space subscription re-renders SpaceWindow into its missing state.
        } catch (e: any) {
            setDangerError(
                e?.message ?? "Couldn't delete the space. Check your connection and try again.",
            );
            setDangerBusy(false);
            setConfirm(null);
        }
    };

    return (
        <section className="spaceEntityPane spaceEntityPane--settings">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Settings</span>
                </div>
            </header>

            <div className="spaceEntityBody spaceSettingsBody">
                <div className="spaceSettingsGroup">
                    <div className="spaceSettingsGroupTitle">General</div>

                    <div className="spaceSettingsField">
                        <label className="spaceSettingsLabel" htmlFor="space-name">
                            Space name
                        </label>
                        <input
                            id="space-name"
                            type="text"
                            className="spaceSettingsInput pn-input"
                            value={name}
                            disabled={!canManage || saving}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="spaceSettingsField">
                        <label className="spaceSettingsLabel" htmlFor="space-desc">
                            Description
                        </label>
                        <textarea
                            id="space-desc"
                            className="spaceSettingsTextarea pn-textarea"
                            value={description}
                            disabled={!canManage || saving}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="What's this space for?"
                        />
                    </div>

                    <div className="spaceSettingsField">
                        <span className="spaceSettingsLabel">Visibility</span>
                        <div className="spaceSettingsRadioGroup">
                            <label className="spaceSettingsRadio">
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="public"
                                    checked={visibility === "public"}
                                    disabled={!canManage || saving}
                                    onChange={() => setVisibility("public")}
                                />
                                <div className="spaceSettingsRadioBody">
                                    <div className="spaceSettingsRadioTitle">Public</div>
                                    <div className="spaceSettingsRadioHint">
                                        Anyone on this repo can find and join.
                                    </div>
                                </div>
                            </label>
                            <label className="spaceSettingsRadio">
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="private"
                                    checked={visibility === "private"}
                                    disabled={!canManage || saving}
                                    onChange={() => setVisibility("private")}
                                />
                                <div className="spaceSettingsRadioBody">
                                    <div className="spaceSettingsRadioTitle">Private</div>
                                    <div className="spaceSettingsRadioHint">
                                        Invite-only. Members must be added by an admin.
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {saveError && (
                        <div className="spaceShareError" role="alert">
                            <span aria-hidden="true">⚠ </span>
                            {saveError}
                        </div>
                    )}

                    {canManage && (
                        <div className="spaceSettingsActions">
                            <button
                                type="button"
                                className="spaceEntityPrimaryBtn pn-btn pn-btn--primary"
                                disabled={!dirty || saving}
                                onClick={save}
                            >
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                            <button
                                type="button"
                                className="spaceEntityGhostBtn pn-btn pn-btn--ghost"
                                disabled={!dirty || saving}
                                onClick={discard}
                            >
                                Discard
                            </button>
                            {justSaved && !dirty && (
                                <span className="spaceSettingsSavedNote" role="status">
                                    ✓ Saved
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="spaceSettingsGroup">
                    <div className="spaceSettingsGroupTitle">Invite</div>
                    <p className="spaceModalHint">
                        Create and manage private invite links or join codes from the Members tab.
                    </p>
                </div>

                <div className="spaceSettingsGroup">
                    <div className="spaceSettingsGroupTitle">Admins</div>
                    <div className="spaceSettingsAdminList">
                        {admins.map((m) => (
                            <AdminRow
                                key={m.uid}
                                name={m.displayName || m.email || "Unknown"}
                                role={m.role === "owner" ? "owner" : "admin"}
                            />
                        ))}
                    </div>
                    {canManage && (
                        <div className="spaceSettingsHint">
                            Promote a member to admin from the Members tab.
                        </div>
                    )}
                </div>

                <div className="spaceSettingsGroup spaceSettingsGroup--danger">
                    <div className="spaceSettingsGroupTitle spaceSettingsGroupTitle--danger">
                        Danger zone
                    </div>

                    {dangerError && (
                        <div className="spaceShareError" role="alert">
                            <span aria-hidden="true">⚠ </span>
                            {dangerError}
                        </div>
                    )}

                    <div className="spaceSettingsDangerRow">
                        <div className="spaceSettingsDangerCopy">
                            <div className="spaceSettingsDangerTitle">Leave space</div>
                            <div className="spaceSettingsDangerHint">
                                You'll lose access to messages, tasks, and shared resources.
                            </div>
                        </div>
                        <button
                            type="button"
                            className="spaceEntityDangerBtn pn-btn pn-btn--danger"
                            onClick={() => setConfirm("leave")}
                        >
                            Leave
                        </button>
                    </div>

                    {isOwner && (
                        <div className="spaceSettingsDangerRow">
                            <div className="spaceSettingsDangerCopy">
                                <div className="spaceSettingsDangerTitle">Delete space</div>
                                <div className="spaceSettingsDangerHint">
                                    Permanently removes the space for all members. Cannot be undone.
                                </div>
                            </div>
                            <button
                                type="button"
                                className="spaceEntityDangerBtn pn-btn pn-btn--danger"
                                onClick={() => setConfirm("delete")}
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Render-level permission guard: the delete confirm can never open
                for non-owners, regardless of how it was triggered. */}
            {confirm && (confirm === "leave" || isOwner) && (
                <ConfirmDangerModal
                    kind={confirm}
                    spaceName={space.name}
                    busy={dangerBusy}
                    onCancel={() => {
                        if (!dangerBusy) setConfirm(null);
                    }}
                    onConfirm={confirm === "leave" ? doLeave : doDelete}
                />
            )}
        </section>
    );
};

const AdminRow: React.FC<{ name: string; role: "owner" | "admin" }> = ({ name, role }) => (
    <div className="spaceSettingsAdminRow">
        <span className="spaceSettingsAdminName">{name}</span>
        <span className={`spaceMemberFullBadge spaceMemberFullBadge--${role}`}>{role}</span>
    </div>
);

const ConfirmDangerModal: React.FC<{
    kind: "leave" | "delete";
    spaceName: string;
    busy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}> = ({ kind, spaceName, busy, onCancel, onConfirm }) => {
    const isDelete = kind === "delete";
    const titleId = useId();
    const modalRef = useModalA11y<HTMLDivElement>(onCancel);
    return (
        <div className="spaceModalOverlay" onClick={onCancel}>
            <div
                ref={modalRef}
                className="spaceModal pn-mdl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="spaceModalTitle pn-mdl__titleinput" id={titleId}>
                    {isDelete ? `Delete ${spaceName}?` : `Leave ${spaceName}?`}
                </div>
                <p className="spaceModalBody">
                    {isDelete
                        ? "This permanently removes the space and its channels for every member. This can't be undone."
                        : "You'll lose access to this space's messages, tasks, and shared resources. You can rejoin later if it's public."}
                </p>
                <div className="spaceModalActions">
                    <button
                        type="button"
                        className="spaceSectionDetailGhostBtn pn-btn pn-btn--ghost"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceEntityDangerBtn pn-btn pn-btn--danger"
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy
                            ? isDelete
                                ? "Deleting…"
                                : "Leaving…"
                            : isDelete
                            ? "Delete space"
                            : "Leave space"}
                    </button>
                </div>
            </div>
        </div>
    );
};
