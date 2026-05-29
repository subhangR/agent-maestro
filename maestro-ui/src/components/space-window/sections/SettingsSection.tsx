import React, { useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";

type Props = {
    space: CollabSpace;
};

export const SettingsSection: React.FC<Props> = ({ space }) => {
    const [name, setName] = useState(space.name);
    const [description, setDescription] = useState(space.description ?? "");
    const [visibility, setVisibility] = useState<"public" | "private">(space.visibility);
    const [linkCopied, setLinkCopied] = useState(false);

    const inviteLink = `https://maestro.app/space/${space.id}/join`;

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 1600);
        } catch {
            /* ignore */
        }
    };

    const dirty =
        name !== space.name ||
        description !== (space.description ?? "") ||
        visibility !== space.visibility;

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
                                    onChange={() => setVisibility("public")}
                                />
                                <div className="spaceSettingsRadioBody">
                                    <div className="spaceSettingsRadioTitle">Public</div>
                                    <div className="spaceSettingsRadioHint">
                                        Anyone with the link can join.
                                    </div>
                                </div>
                            </label>
                            <label className="spaceSettingsRadio">
                                <input
                                    type="radio"
                                    name="visibility"
                                    value="private"
                                    checked={visibility === "private"}
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

                    <div className="spaceSettingsActions">
                        <button
                            type="button"
                            className="spaceEntityPrimaryBtn"
                            disabled={!dirty}
                        >
                            Save changes
                        </button>
                        <button
                            type="button"
                            className="spaceEntityGhostBtn"
                            disabled={!dirty}
                            onClick={() => {
                                setName(space.name);
                                setDescription(space.description ?? "");
                                setVisibility(space.visibility);
                            }}
                        >
                            Discard
                        </button>
                    </div>
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
                        <AdminRow name="Subhang" role="owner" />
                        <AdminRow name="Manzil" role="admin" />
                    </div>
                    <button type="button" className="spaceEntityGhostBtn" disabled>
                        + Add admin
                    </button>
                </div>

                <div className="spaceSettingsGroup spaceSettingsGroup--danger">
                    <div className="spaceSettingsGroupTitle spaceSettingsGroupTitle--danger">
                        Danger zone
                    </div>
                    <div className="spaceSettingsDangerRow">
                        <div className="spaceSettingsDangerCopy">
                            <div className="spaceSettingsDangerTitle">Leave space</div>
                            <div className="spaceSettingsDangerHint">
                                You'll lose access to messages, tasks, and shared resources.
                            </div>
                        </div>
                        <button type="button" className="spaceEntityDangerBtn">
                            Leave
                        </button>
                    </div>
                    <div className="spaceSettingsDangerRow">
                        <div className="spaceSettingsDangerCopy">
                            <div className="spaceSettingsDangerTitle">Delete space</div>
                            <div className="spaceSettingsDangerHint">
                                Permanently removes the space for all members. Cannot be undone.
                            </div>
                        </div>
                        <button type="button" className="spaceEntityDangerBtn">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

const AdminRow: React.FC<{ name: string; role: "owner" | "admin" }> = ({ name, role }) => (
    <div className="spaceSettingsAdminRow">
        <span className="spaceSettingsAdminName">{name}</span>
        <span
            className={`spaceMemberFullBadge spaceMemberFullBadge--${role}`}
        >
            {role}
        </span>
    </div>
);
