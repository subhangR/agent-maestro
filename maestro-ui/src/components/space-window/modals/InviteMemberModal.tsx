import React, { useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";

type Props = {
    space: CollabSpace;
    onClose: () => void;
};

export const InviteMemberModal: React.FC<Props> = ({ space, onClose }) => {
    const inviteLink = `https://maestro.app/space/${space.id}/join`;
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // best-effort
        }
    };

    return (
        <div className="spaceModalOverlay" onClick={onClose} role="dialog" aria-modal="true">
            <div className="spaceModal" onClick={(e) => e.stopPropagation()}>
                <div className="spaceModalTitle">Invite to {space.name}</div>
                <p className="spaceModalBody">
                    Share this link with anyone you want to collaborate with.
                    {space.visibility === "private" && " Private spaces require approval — owners must accept join requests."}
                </p>

                <div className="spaceInviteLinkRow">
                    <input
                        readOnly
                        type="text"
                        className="spaceInviteLinkInput"
                        value={inviteLink}
                        onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        onClick={handleCopy}
                    >
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>

                <p className="spaceModalHint">
                    Email-based invites and join-request approvals land in a follow-up.
                </p>

                <div className="spaceModalActions">
                    <button type="button" className="spaceSectionDetailGhostBtn" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
