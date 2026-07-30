import React from "react";

type Props = {
    icon?: React.ReactNode;
    title: string;
    body: string;
    action?: { label: string; onClick: () => void; disabled?: boolean };
};

export const EmptySectionState: React.FC<Props> = ({ icon, title, body, action }) => {
    return (
        <div className="spaceEmptySection pn-empty">
            {icon && <div className="spaceEmptySectionIcon" aria-hidden="true">{icon}</div>}
            <div className="spaceEmptySectionTitle pn-empty__h">{title}</div>
            <div className="spaceEmptySectionBody pn-empty__p">{body}</div>
            {action && (
                <button
                    type="button"
                    className="spaceEmptySectionAction pn-btn pn-btn--primary"
                    onClick={action.onClick}
                    disabled={action.disabled}
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};
