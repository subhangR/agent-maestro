import React, { useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { CollabSpace, CollabSpaceMember } from "../../../firebase/collabSpaceTypes";
import { CollabSpaceClient } from "../../../firebase/CollabSpaceClient";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { colorForUid } from "../../../hooks/useSpaceSharing";
import { InviteMemberModal } from "../modals/InviteMemberModal";

type Props = {
    space: CollabSpace;
};

const ROLE_RANK: Record<CollabSpaceMember["role"], number> = {
    owner: 0,
    admin: 1,
    member: 2,
};

function initials(member: CollabSpaceMember): string {
    const source = (member.displayName || member.email || "?").trim();
    return source ? source.charAt(0).toUpperCase() : "?";
}

function joinedLabel(joinedAt: CollabSpaceMember["joinedAt"]): string {
    const ts = joinedAt as Timestamp | null;
    if (!ts || typeof ts.toDate !== "function") return "joined recently";
    const then = ts.toDate().getTime();
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return "joined just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `joined ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `joined ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `joined ${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `joined ${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `joined ${months}mo ago`;
    return `joined ${Math.floor(days / 365)}y ago`;
}

export const MembersSection: React.FC<Props> = ({ space }) => {
    const currentUser = useFirebaseAuthStore((s) => s.user);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
    const [busyUid, setBusyUid] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const currentUid = currentUser?.uid ?? null;
    const myRole = currentUid ? space.members[currentUid]?.role : undefined;
    const canManage = myRole === "owner" || myRole === "admin";

    const members = useMemo(() => {
        return Object.values(space.members ?? {})
            .filter(Boolean)
            .sort((a, b) => {
                const rank = ROLE_RANK[a.role] - ROLE_RANK[b.role];
                if (rank !== 0) return rank;
                return (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "");
            });
    }, [space.members]);

    const setRole = async (targetUid: string, role: "admin" | "member") => {
        // Permission guard at the action, not just the hidden menu.
        if (!canManage || space.members[targetUid]?.role === "owner") return;
        setOpenMenuFor(null);
        setBusyUid(targetUid);
        setError(null);
        try {
            await CollabSpaceClient.setMemberRole(space.id, targetUid, role);
        } catch (e: any) {
            setError(e?.message ?? "Couldn't update the role. Check your connection and try again.");
        } finally {
            setBusyUid(null);
        }
    };

    const removeMember = async (targetUid: string) => {
        // Permission guard at the action, not just the hidden menu.
        if (!canManage || space.members[targetUid]?.role === "owner" || targetUid === currentUid) return;
        setOpenMenuFor(null);
        setBusyUid(targetUid);
        setError(null);
        try {
            await CollabSpaceClient.removeMember(space.id, targetUid);
        } catch (e: any) {
            setError(e?.message ?? "Couldn't remove the member. Check your connection and try again.");
        } finally {
            setBusyUid(null);
        }
    };

    return (
        <section className="spaceEntityPane spaceEntityPane--members">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Members</span>
                    <span className="spaceEntityCount">{members.length}</span>
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

            {error && (
                <div className="spaceShareError" role="alert">
                    <span aria-hidden="true">⚠ </span>
                    {error}
                </div>
            )}

            <div className="spaceEntityBody">
                {members.length === 0 ? (
                    <div className="spaceMembersGroup">
                        <div className="spaceMembersGroupHeader">
                            <span className="spaceMembersGroupLabel">No members yet</span>
                        </div>
                    </div>
                ) : (
                    <div className="spaceMembersGroup">
                        {members.map((m) => {
                            const isSelf = m.uid === currentUid;
                            const canActOnTarget = canManage && m.role !== "owner" && !isSelf;
                            return (
                                <MemberRow
                                    key={m.uid}
                                    member={m}
                                    isSelf={isSelf}
                                    canActOnTarget={canActOnTarget}
                                    busy={busyUid === m.uid}
                                    menuOpen={openMenuFor === m.uid}
                                    onToggleMenu={() =>
                                        setOpenMenuFor(openMenuFor === m.uid ? null : m.uid)
                                    }
                                    onCloseMenu={() => setOpenMenuFor(null)}
                                    onMakeAdmin={() => setRole(m.uid, "admin")}
                                    onMakeMember={() => setRole(m.uid, "member")}
                                    onRemove={() => removeMember(m.uid)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
};

type MemberRowProps = {
    member: CollabSpaceMember;
    isSelf: boolean;
    canActOnTarget: boolean;
    busy: boolean;
    menuOpen: boolean;
    onToggleMenu: () => void;
    onCloseMenu: () => void;
    onMakeAdmin: () => void;
    onMakeMember: () => void;
    onRemove: () => void;
};

const MemberRow: React.FC<MemberRowProps> = ({
    member,
    isSelf,
    canActOnTarget,
    busy,
    menuOpen,
    onToggleMenu,
    onCloseMenu,
    onMakeAdmin,
    onMakeMember,
    onRemove,
}) => {
    const displayName = member.displayName || member.email || "Unknown";
    return (
        <div className={`spaceMemberFullRow ${busy ? "spaceMemberFullRow--busy" : ""}`}>
            <div className="spaceMemberFullAvatarWrap">
                {member.photoUrl ? (
                    <img className="spaceMemberFullAvatar" src={member.photoUrl} alt="" />
                ) : (
                    <div className="spaceMemberFullAvatar" style={{ background: colorForUid(member.uid) }}>
                        {initials(member)}
                    </div>
                )}
            </div>
            <div className="spaceMemberFullMain">
                <div className="spaceMemberFullName">
                    {displayName}
                    {isSelf && <span className="spaceMemberFullYou">you</span>}
                    {member.role === "owner" && (
                        <span className="spaceMemberFullBadge spaceMemberFullBadge--owner">owner</span>
                    )}
                    {member.role === "admin" && (
                        <span className="spaceMemberFullBadge spaceMemberFullBadge--admin">admin</span>
                    )}
                </div>
                <div className="spaceMemberFullSub">
                    {member.email ? `${member.email} · ` : ""}
                    {joinedLabel(member.joinedAt)}
                </div>
            </div>
            {canActOnTarget && (
                <div className="spaceMemberFullActions">
                    <button
                        type="button"
                        className="spaceEntityGhostBtn"
                        onClick={onToggleMenu}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={`Member actions for ${displayName}`}
                        disabled={busy}
                    >
                        {busy ? "…" : "···"}
                    </button>
                    {menuOpen && (
                        <div className="spaceMemberMenu" role="menu" onMouseLeave={onCloseMenu}>
                            {member.role === "member" ? (
                                <button
                                    type="button"
                                    className="spaceMemberMenuItem"
                                    role="menuitem"
                                    onClick={onMakeAdmin}
                                >
                                    Make admin
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="spaceMemberMenuItem"
                                    role="menuitem"
                                    onClick={onMakeMember}
                                >
                                    Make member
                                </button>
                            )}
                            <div className="spaceMemberMenuSep" />
                            <button
                                type="button"
                                className="spaceMemberMenuItem spaceMemberMenuItem--danger"
                                role="menuitem"
                                onClick={onRemove}
                            >
                                Remove from space
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
