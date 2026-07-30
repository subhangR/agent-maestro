import React from "react";
import { Icon } from "../maestro/redesign/kit";

type ConfirmDeleteProjectModalProps = {
  isOpen: boolean;
  projectTitle: string;
  error: string | null;
  onClose: () => void;
  onConfirmDelete: () => void;
};

export function ConfirmDeleteProjectModal({
  isOpen,
  projectTitle,
  error,
  onClose,
  onConfirmDelete,
}: ConfirmDeleteProjectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="themedModalBackdrop" onClick={onClose}>
      <div className="pn-mdl" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__titleinput">Delete project</div>
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        {error ? (
          <>
            <div className="themedWarning" style={{ margin: '16px' }}>
              {error}
            </div>
            <div className="pn-mdl__foot">
              <button type="button" className="pn-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pn-mdl__body" style={{ fontSize: 13.5, color: 'var(--pn-ink-2)' }}>
              Delete "{projectTitle}"? This action cannot be undone.
            </div>
            <div className="pn-mdl__foot">
              <button type="button" className="pn-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="pn-btn pn-btn--danger" onClick={onConfirmDelete}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
