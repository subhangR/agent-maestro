import React, { useId, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { useModalA11y } from "../shared/useModalA11y";

type Props = {
    space: CollabSpace;
    onClose: () => void;
};

export const InviteMemberModal: React.FC<Props> = ({ space, onClose }) => {
    const inviteLink = `https://maestro.app/space/${space.id}/join`;
    const [copied, setCopied] = useState(false);
    const titleId = useId();
    const modalRef = useModalA11y<HTMLDivElement>(onClose);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard unavailable — the input selects on focus for manual copy.
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
                <div className="spaceModalTitle" id={titleId}>
                    Invite to {space.name}
                </div>
                <p className="spaceModalBody">
                    Share this link with anyone you want to collaborate with.
                    {space.visibility === "private" &&
                        " This is a private space — only people you invite can join."}
                </p>

                <div className="spaceInviteLinkRow">
                    <input
                        readOnly
                        type="text"
                        className="spaceInviteLinkInput"
                        value={inviteLink}
                        aria-label="Invite link"
                        onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                        type="button"
                        className="spaceModalPrimaryBtn"
                        onClick={handleCopy}
                        aria-live="polite"
                    >
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>

                <p className="spaceModalHint">Email-based invites are coming soon.</p>

                <div className="spaceModalActions">
                    <button type="button" className="spaceSectionDetailGhostBtn" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
