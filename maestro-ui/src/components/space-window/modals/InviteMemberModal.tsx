import React, { useEffect, useId, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
    CollabSpace,
    CollabSpaceInvite,
    CollabSpaceInviteKind,
} from "../../../firebase/collabSpaceTypes";
import { CollabSpaceClient } from "../../../firebase/CollabSpaceClient";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { useModalA11y } from "../shared/useModalA11y";

type Props = {
    space: CollabSpace;
    onClose: () => void;
};

const EXPIRY_OPTIONS = [
    { value: "24", label: "24 hours" },
    { value: "168", label: "7 days" },
    { value: "720", label: "30 days" },
] as const;

function inviteStatus(invite: CollabSpaceInvite): "active" | "expired" | "revoked" | "full" {
    if (invite.revokedAt) return "revoked";
    if ((invite.expiresAt?.toDate().getTime() ?? Infinity) <= Date.now()) return "expired";
    if (invite.useCount >= invite.maxUses) return "full";
    return "active";
}

function labelForInvite(invite: CollabSpaceInvite): string {
    return invite.kind === "link" ? "Invite link" : "Join code";
}

export const InviteMemberModal: React.FC<Props> = ({ space, onClose }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const myRole = user ? space.members[user.uid]?.role : undefined;
    const canManage = myRole === "owner" || myRole === "admin";
    const [kind, setKind] = useState<CollabSpaceInviteKind>("link");
    const [expiryHours, setExpiryHours] = useState("168");
    const [maxUses, setMaxUses] = useState("1");
    const [invites, setInvites] = useState<CollabSpaceInvite[]>([]);
    const [created, setCreated] = useState<CollabSpaceInvite | null>(null);
    const [loading, setLoading] = useState(canManage);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const titleId = useId();
    const modalRef = useModalA11y<HTMLDivElement>(onClose);

    const shareValue = useMemo(() => {
        if (!created) return "";
        return created.kind === "link"
            ? CollabSpaceClient.buildInviteLink(space.id, created.id)
            : created.id;
    }, [created, space.id]);

    const refresh = async () => {
        if (!canManage) return;
        setLoading(true);
        try {
            setInvites(await CollabSpaceClient.listInvites(space.id));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Couldn't load invitations.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refresh();
        // The modal is tied to one immutable space id for its lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [space.id, canManage]);

    const createInvite = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user || !canManage) return;
        const hours = Number(expiryHours);
        const uses = Number(maxUses);
        if (!Number.isInteger(hours) || hours < 1 || hours > 720 || !Number.isInteger(uses) || uses < 1 || uses > 1000) {
            setError("Choose an expiry between 1 hour and 30 days, and 1–1,000 uses.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const invite = await CollabSpaceClient.createInvite(user, space.id, {
                kind,
                maxUses: uses,
                expiresAt: Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000),
            });
            setCreated(invite);
            setInvites((current) => [invite, ...current]);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Couldn't create this invitation.");
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!shareValue) return;
        try {
            await navigator.clipboard.writeText(shareValue);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setError("Clipboard access is unavailable. Select the value and copy it manually.");
        }
    };

    const revoke = async (invite: CollabSpaceInvite) => {
        if (!canManage || inviteStatus(invite) !== "active") return;
        setBusy(true);
        setError(null);
        try {
            await CollabSpaceClient.revokeInvite(space.id, invite.id);
            setInvites((current) => current.map((item) =>
                item.id === invite.id ? { ...item, revokedAt: Timestamp.now() } : item,
            ));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Couldn't revoke this invitation.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose}>
            <div ref={modalRef} className="spaceModal spaceModal--invites" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
                <div className="spaceModalTitle" id={titleId}>Invite to {space.name}</div>
                {space.visibility !== "private" ? (
                    <p className="spaceModalBody">This is a public space. Any signed-in Maestro user can find and join it from the Collab Space list for this repository.</p>
                ) : !canManage ? (
                    <p className="spaceModalBody">Only space owners and admins can create private invitations.</p>
                ) : (
                    <>
                        <p className="spaceModalBody">Create a revocable invite link or a shareable join code. Whoever has it can join until it expires or reaches its use limit.</p>
                        <form className="spaceInviteForm" onSubmit={createInvite}>
                            <div className="spaceInviteKindRow" role="radiogroup" aria-label="Invitation type">
                                <label><input type="radio" checked={kind === "link"} onChange={() => setKind("link")} /> Invite link</label>
                                <label><input type="radio" checked={kind === "code"} onChange={() => setKind("code")} /> Join code</label>
                            </div>
                            <label className="spaceInviteField"><span>Expires after</span><select value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} disabled={busy}>{EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                            <label className="spaceInviteField"><span>Maximum uses</span><input type="number" min="1" max="1000" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} disabled={busy} /></label>
                            <button type="submit" className="spaceModalPrimaryBtn" disabled={busy}>{busy ? "Creating…" : `Create ${kind === "link" ? "link" : "code"}`}</button>
                        </form>
                        {created && (
                            <div className="spaceInviteCreated" aria-live="polite">
                                <span className="spaceInviteCreatedLabel">New {labelForInvite(created)}</span>
                                <div className="spaceInviteLinkRow"><input readOnly type="text" className="spaceInviteLinkInput" value={shareValue} aria-label={labelForInvite(created)} onFocus={(e) => e.currentTarget.select()} /><button type="button" className="spaceModalPrimaryBtn" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
                            </div>
                        )}
                        <div className="spaceInviteListHeader"><span>Active and recent</span>{loading && <span>Loading…</span>}</div>
                        <div className="spaceInviteList">
                            {invites.length === 0 && !loading ? <p className="spaceModalHint">No private invitations yet.</p> : invites.map((invite) => {
                                const status = inviteStatus(invite);
                                return <div className="spaceInviteRow" key={invite.id}><div><strong>{labelForInvite(invite)}</strong><span>{invite.useCount}/{invite.maxUses} uses · {status}</span></div><button type="button" className="spaceSectionDetailGhostBtn" disabled={busy || status !== "active"} onClick={() => void revoke(invite)}>{status === "active" ? "Revoke" : status}</button></div>;
                            })}
                        </div>
                    </>
                )}
                {error && <div className="spaceShareError" role="alert">{error}</div>}
                <div className="spaceModalActions"><button type="button" className="spaceSectionDetailGhostBtn" onClick={onClose}>Done</button></div>
            </div>
        </div>
    );
};
