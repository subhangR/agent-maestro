import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../maestro/redesign/kit";

type NewSessionModalProps = {
  isOpen: boolean;
  projectName: string | null;
  name: string;
  nameInputRef: React.RefObject<HTMLInputElement>;
  onChangeName: (value: string) => void;
  command: string;
  onChangeCommand: (value: string) => void;
  commandSuggestions?: string[];
  cwd: string;
  onChangeCwd: (value: string) => void;
  cwdPlaceholder: string;
  onBrowseCwd: () => void;
  canUseProjectBase: boolean;
  onUseProjectBase: () => void;
  canUseCurrentTab: boolean;
  onUseCurrentTab: () => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
};

export function NewSessionModal({
  isOpen,
  projectName,
  name,
  nameInputRef,
  onChangeName,
  command,
  onChangeCommand,
  commandSuggestions,
  cwd,
  onChangeCwd,
  cwdPlaceholder,
  onBrowseCwd,
  canUseProjectBase,
  onUseProjectBase,
  canUseCurrentTab,
  onUseCurrentTab,
  onClose,
  onSubmit,
}: NewSessionModalProps) {
  // Auto-focus the input field when dialog opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, nameInputRef]);

  if (!isOpen) return null;

  return createPortal(
    <div className="themedModalBackdrop" onClick={onClose}>
      <div className="pn-mdl" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__titleinput">New terminal</div>
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="pn-mdl__body">
            <div className="themedFormHint" style={{ marginBottom: '10px' }}>
              Enter a name for your new terminal session
            </div>

            <div className="themedFormRow">
              <div className="themedFormLabel">Terminal Name</div>
              <input
                className="themedFormInput"
                ref={nameInputRef}
                value={name}
                onChange={(e) => onChangeName(e.target.value)}
                placeholder="e.g., main shell"
              />
            </div>
          </div>

          <div className="pn-mdl__foot">
            <button type="button" className="pn-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pn-btn pn-btn--primary">
              Create Terminal
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
