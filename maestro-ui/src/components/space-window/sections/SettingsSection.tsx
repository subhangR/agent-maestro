import React, { useMemo, useState } from "react";
import { CollabSpace, CollabSpaceMember } from "../../../firebase/collabSpaceTypes";
import { CollabSpaceClient } from "../../../firebase/CollabSpaceClient";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";

type Props = {
    space: CollabSpace;
};

export const SettingsSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);

    const [name, setName] = useState(space.name);
    const [description, setDescription] = useState(space.description ?? "");
    const [visibility, setVisibility] = useState<"public" | "private">(space.visibility);
    const [linkCopied, setLinkCopied] = useState(false);

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const [confirm, setConfirm] = useState<null | "leave" | "delete">(null);
    const [dangerBusy, setDangerBusy] = useState(false);
    const [dangerError, setDangerError] = useState<string | null>(null);

    const inviteLink = CollabSpaceClient.buildInviteLink(space.id);

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

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 1600);
        } catch {
            /* ignore */
        }
    };

    const discard = () => {
        setName(space.name);
        setDescription(space.description ?? "");
        setVisibility(space.visibility);
        setSaveError(null);
    };

    const save = async () => {
        if (!dirty || saving) return;
        setSaving(true);
        setSaveError(null);
        try {
            await CollabSpaceClient.update(space.id, {
                name: name.trim() || space.name,
                description: description.trim(),
                visibility,
            });
            // The live subscription pushes the updated space back down as a prop,
            // which recomputes `dirty` to false. No manual reset needed.
        } catch (e: any) {
            setSaveError(e?.message ?? "Couldn't save changes.");
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
            setDangerError(e?.message ?? "Couldn't leave the space.");
            setDangerBusy(false);
            setConfirm(null);
        }
    };

    const doDelete = async () => {
        if (dangerBusy) return;
        setDangerBusy(true);
        setDangerError(null);
        try {
            await CollabSpaceClient.delete(space.id);
            // The space subscription re-renders SpaceWindow into its missing state.
        } catch (e: any) {
            setDangerError(e?.message ?? "Couldn't delete the space.");
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
                            className="spaceSettingsInput"
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
                            className="spaceSettingsTextarea"
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

                    {saveError && <div className="spaceShareError">{saveError}</div>}

                    {canManage && (
                        <div className="spaceSettingsActions">
                            <button
                                type="button"
                                className="spaceEntityPrimaryBtn"
                                disabled={!dirty || saving}
                                onClick={save}
                            >
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                            <button
                                type="button"
                                className="spaceEntityGhostBtn"
                                disabled={!dirty || saving}
                                onClick={discard}
                            >
                                Discard
                            </button>
                        </div>
                    )}
                </div>

                <div className="spaceSettingsGroup">
                    <div className="spaceSettingsGroupTitle">Invite</div>
                    <div className="spaceSettingsField">
                        <label className="spaceSettingsLabel">Invite link</label>
                        <div className="spaceSettingsInviteRow">
                            <input
                                readOnly
                                type="text"
                                className="spaceSettingsInput spaceSettingsInputMono"
                                value={inviteLink}
                                onFocus={(e) => e.currentTarget.select()}
                            />
                            <button
                                type="button"
                                className="spaceEntityPrimaryBtn"
                                onClick={copyLink}
                            >
                                {linkCopied ? "Copied" : "Copy"}
                            </button>
                        </div>
                    </div>
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
                    <button type="button" className="spaceEntityGhostBtn" disabled title="Coming soon">
                        + Add admin
                    </button>
                </div>

                <div className="spaceSettingsGroup spaceSettingsGroup--danger">
                    <div className="spaceSettingsGroupTitle spaceSettingsGroupTitle--danger">
                        Danger zone
                    </div>

                    {dangerError && <div className="spaceShareError">{dangerError}</div>}

                    <div className="spaceSettingsDangerRow">
                        <div className="spaceSettingsDangerCopy">
                            <div className="spaceSettingsDangerTitle">Leave space</div>
                            <div className="spaceSettingsDangerHint">
                                You'll lose access to messages, tasks, and shared resources.
                            </div>
                        </div>
                        <button
                            type="button"
                            className="spaceEntityDangerBtn"
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
                                className="spaceEntityDangerBtn"
                                onClick={() => setConfirm("delete")}
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {confirm && (
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
    return (
        <div className="spaceModalOverlay" onClick={onCancel} role="dialog" aria-modal="true">
            <div className="spaceModal" onClick={(e) => e.stopPropagation()}>
                <div className="spaceModalTitle">
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
                        className="spaceSectionDetailGhostBtn"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="spaceEntityDangerBtn"
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
