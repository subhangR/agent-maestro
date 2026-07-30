import React from "react";

type Props = {
    state: "loading" | "not-member" | "missing";
    spaceName?: string;
};

export const SpaceWindowEmpty: React.FC<Props> = ({ state, spaceName }) => {
    let title: string;
    let body: string;

    if (state === "loading") {
        title = "Opening space…";
        body = "Loading channels and members.";
    } else if (state === "not-member") {
        title = "You're not a member of this space";
        body = "Join the space from the Collab tab to enter.";
    } else {
        title = "Space not found";
        body = "This space may have been deleted or you no longer have access.";
    }

    return (
        <div className="spaceWindowEmpty">
            <div className="spaceWindowEmptyCard pn-empty">
                <div className="spaceWindowEmptyTitle pn-empty__h">{title}</div>
                <div className="spaceWindowEmptyText pn-empty__p">
                    {body}
                    {spaceName && state !== "loading" ? ` (${spaceName})` : ""}
                </div>
            </div>
        </div>
    );
};
