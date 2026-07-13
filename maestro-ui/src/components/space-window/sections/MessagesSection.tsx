import React, { useEffect } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { MessagingView } from "../../maestro/messaging/MessagingView";

type Props = {
    space: CollabSpace;
};

/**
 * Messages section for a Collab Space. Mounts the real, Firestore-backed
 * {@link MessagingView} (channels + live message stream + composer). Membership
 * and ownership are derived from the space document and the signed-in user, and
 * drive read/post/edit/delete permissions inside the view.
 */
export const MessagesSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const initialized = useFirebaseAuthStore((s) => s.initialized);
    const initAuth = useFirebaseAuthStore((s) => s.initAuth);

    // Ensure the auth listener is running so `user` resolves (idempotent).
    useEffect(() => {
        initAuth();
    }, [initAuth]);

    const isOwner = Boolean(user) && space.ownerId === user!.uid;
    const isMember =
        Boolean(user) &&
        (isOwner || space.memberIds.includes(user!.uid));

    // Auth still resolving — avoid flashing the "join this space" empty state.
    if (!initialized) {
        return (
            <section className="spaceEntityPane spaceEntityPane--messages">
                <div className="messagingRoot">
                    <div className="messagingMain">
                        <div className="messagingEmptyState">
                            <div className="messagingEmptyStateTitle">Loading…</div>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="spaceEntityPane spaceEntityPane--messages">
            <MessagingView
                space={space}
                user={user}
                isMember={isMember}
                isOwner={isOwner}
            />
        </section>
    );
};
