import React from "react";
import { DirectoryListing } from "../../app/types/app-state";
import { InlineFolderBrowser } from "../InlineFolderBrowser";
import { Icon } from "../maestro/redesign/kit";

type PathPickerModalProps = {
  isOpen: boolean;
  listing: DirectoryListing | null;
  loading: boolean;
  error: string | null;
  onLoad: (path: string | null) => void;
  onClose: () => void;
  onSelect: () => void;
};

export function PathPickerModal({
  isOpen,
  listing,
  loading,
  error,
  onLoad,
  onClose,
  onSelect,
}: PathPickerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="themedModalBackdrop" onClick={onClose}>
      <div className="pn-mdl" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__titleinput">Select folder</div>
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="pn-mdl__body">
          <InlineFolderBrowser
            listing={listing}
            loading={loading}
            error={error}
            onNavigate={onLoad}
            onSelect={() => {}}
          />
        </div>
        <div className="pn-mdl__foot">
          <button type="button" className="pn-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="pn-btn pn-btn--primary" disabled={!listing} onClick={onSelect}>
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
