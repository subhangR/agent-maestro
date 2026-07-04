import React from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";

type Props = {
    space: CollabSpace;
};

/** Shared docs surface — implementation lands with the docs push/pull wave. */
export const DocsSection: React.FC<Props> = () => {
    return (
        <section className="spaceSection spaceDocsSection" aria-label="Shared docs">
            <EmptySectionState
                icon="📄"
                title="No docs shared yet"
                body="Share a project doc to give every member a copy they can pull locally."
            />
        </section>
    );
};
