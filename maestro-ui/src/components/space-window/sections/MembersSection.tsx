import React, { useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { InviteMemberModal } from "../modals/InviteMemberModal";

type MockMember = {
    uid: string;
    displayName: string;
    email: string;
    initials: string;
    color: string;
    role: "owner" | "admin" | "member";
    presence: "online" | "idle" | "offline";
    joinedRelative: string;
};

const MOCK_MEMBERS: MockMember[] = [
    {
        uid: "u-subhang",
        displayName: "Subhang",
        email: "subhang@maestro.dev",
        initials: "S",
        color: "#7c9eff",
        role: "owner",
        presence: "online",
        joinedRelative: "joined 3 mo ago",
    },
    {
        uid: "u-manzil",
        displayName: "Manzil",
        email: "manzil@maestro.dev",
        initials: "M",
        color: "#f06767",
        role: "admin",
        presence: "online",
        joinedRelative: "joined 2 mo ago",
    },
    {
        uid: "u-priya",
        displayName: "Priya",
        email: "priya@maestro.dev",
        initials: "P",
        color: "#ffc864",
        role: "member",
        presence: "online",
        joinedRelative: "joined 6 wk ago",
    },
    {
        uid: "u-devon",
        displayName: "Devon",
        email: "devon@maestro.dev",
        initials: "D",
        color: "#66ddaa",
        role: "member",
        presence: "idle",
        joinedRelative: "joined 4 wk ago",
    },
    {
        uid: "u-asha",
        displayName: "Asha",
        email: "asha@maestro.dev",
        initials: "A",
        color: "#c084fc",
        role: "member",
        presence: "offline",
        joinedRelative: "joined 2 wk ago",
    },
];

type Props = {
    space: CollabSpace;
};

export const MembersSection: React.FC<Props> = ({ space }) => {
    const [inviteOpen, setInviteOpen] = useState(false);
    const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

    const online = MOCK_MEMBERS.filter((m) => m.presence === "online" || m.presence === "idle");
    const offline = MOCK_MEMBERS.filter((m) => m.presence === "offline");

    return (
        <section className="spaceEntityPane spaceEntityPane--members">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Members</span>
                    <span className="spaceEntityCount">{MOCK_MEMBERS.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn"
                        onClick={() => setInviteOpen(true)}
                    >
                        + Invite
                    </button>
                </div>
            </header>

            {inviteOpen && (
                <InviteMemberModal space={space} onClose={() => setInviteOpen(false)} />
            )}

            <div className="spaceEntityBody">
                <div className="spaceMembersGroup">
                    <div className="spaceMembersGroupHeader">
                        <span className="spaceMembersGroupLabel">Active</span>
                        <span className="spaceMembersGroupCount">{online.length}</span>
                    </div>
                    {online.map((m) => (
                        <MemberRow
                            key={m.uid}
                            member={m}
                            menuOpen={openMenuFor === m.uid}
                            onToggleMenu={() => setOpenMenuFor(openMenuFor === m.uid ? null : m.uid)}
                            onCloseMenu={() => setOpenMenuFor(null)}
                        />
                    ))}
                </div>

                {offline.length > 0 && (
                    <div className="spaceMembersGroup">
                        <div className="spaceMembersGroupHeader">
                            <span className="spaceMembersGroupLabel">Offline</span>
                            <span className="spaceMembersGroupCount">{offline.length}</span>
                        </div>
                        {offline.map((m) => (
                            <MemberRow
                                key={m.uid}
                                member={m}
                                menuOpen={openMenuFor === m.uid}
                                onToggleMenu={() => setOpenMenuFor(openMenuFor === m.uid ? null : m.uid)}
                                onCloseMenu={() => setOpenMenuFor(null)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

type MemberRowProps = {
    member: MockMember;
    menuOpen: boolean;
    onToggleMenu: () => void;
    onCloseMenu: () => void;
};

const MemberRow: React.FC<MemberRowProps> = ({ member, menuOpen, onToggleMenu, onCloseMenu }) => {
    return (
        <div className={`spaceMemberFullRow spaceMemberFullRow--${member.presence}`}>
            <div className="spaceMemberFullAvatarWrap">
                <div className="spaceMemberFullAvatar" style={{ background: member.color }}>
                    {member.initials}
                </div>
                <span className={`spaceMemberPresenceDot spaceMemberPresenceDot--${member.presence}`} />
            </div>
            <div className="spaceMemberFullMain">
                <div className="spaceMemberFullName">
                    {member.displayName}
                    {member.role === "owner" && (
                        <span className="spaceMemberFullBadge spaceMemberFullBadge--owner">owner</span>
                    )}
                    {member.role === "admin" && (
                        <span className="spaceMemberFullBadge spaceMemberFullBadge--admin">admin</span>
                    )}
                </div>
                <div className="spaceMemberFullSub">
                    {member.email} · {member.joinedRelative}
                </div>
            </div>
            <div className="spaceMemberFullActions">
                <button
                    type="button"
                    className="spaceEntityGhostBtn"
                    onClick={onToggleMenu}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                >
                    ···
                </button>
                {menuOpen && (
                    <div
                        className="spaceMemberMenu"
                        role="menu"
                        onMouseLeave={onCloseMenu}
                    >
                        <button type="button" className="spaceMemberMenuItem" disabled>
                            View profile
                        </button>
                        <button type="button" className="spaceMemberMenuItem" disabled>
                            Send DM
                        </button>
                        {member.role !== "owner" && (
                            <>
                                <div className="spaceMemberMenuSep" />
                                <button type="button" className="spaceMemberMenuItem" disabled>
                                    Make admin
                                </button>
                                <button
                                    type="button"
                                    className="spaceMemberMenuItem spaceMemberMenuItem--danger"
                                    disabled
                                >
                                    Remove from space
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
