import React from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";

type Props = {
    space: CollabSpace;
};

/** Shared files surface — implementation lands with the files wave. */
export const FilesSection: React.FC<Props> = () => {
    return (
        <section className="spaceSection spaceFilesSection" aria-label="Shared files">
            <EmptySectionState
                icon="📎"
                title="No files shared yet"
                body="Upload a small file to share it with everyone in this space."
            />
        </section>
    );
};
