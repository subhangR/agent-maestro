import React from "react";

type Props = {
    icon?: React.ReactNode;
    title: string;
    body: string;
    action?: { label: string; onClick: () => void; disabled?: boolean };
};

export const EmptySectionState: React.FC<Props> = ({ icon, title, body, action }) => {
    return (
        <div className="spaceEmptySection">
            {icon && <div className="spaceEmptySectionIcon" aria-hidden="true">{icon}</div>}
            <div className="spaceEmptySectionTitle">{title}</div>
            <div className="spaceEmptySectionBody">{body}</div>
            {action && (
                <button
                    type="button"
                    className="spaceEmptySectionAction"
                    onClick={action.onClick}
                    disabled={action.disabled}
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};
