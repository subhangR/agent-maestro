import React, { useState } from "react";
import { DirectoryListing } from "../../app/types/app-state";
import { InlineFolderBrowser } from "../InlineFolderBrowser";
import { ProjectSoundSettings } from "./ProjectSoundSettings";
import type { ProjectSoundConfig } from "../../app/types/maestro";
import { IS_TAURI } from "../../platform/detect";
import { Icon } from "../maestro/redesign/kit";

type EnvironmentConfig = {
  id: string;
  name: string;
};

type ProjectModalProps = {
  isOpen: boolean;
  mode: "new" | "rename";
  title: string;
  titleInputRef: React.RefObject<HTMLInputElement>;
  onChangeTitle: (value: string) => void;
  basePath: string;
  onChangeBasePath: (value: string) => void;
  basePathPlaceholder: string;
  canUseCurrentTab: boolean;
  onUseCurrentTab: () => void;
  canUseHome: boolean;
  onUseHome: () => void;
  environments: EnvironmentConfig[];
  selectedEnvironmentId: string;
  onChangeEnvironmentId: (value: string) => void;
  onOpenEnvironments: () => void;
  assetsEnabled: boolean;
  onChangeAssetsEnabled: (value: boolean) => void;
  soundInstrument?: string;
  onChangeSoundInstrument?: (value: string) => void;
  soundConfig?: ProjectSoundConfig;
  onChangeSoundConfig?: (config: ProjectSoundConfig | undefined) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  browserListing: DirectoryListing | null;
  browserLoading: boolean;
  browserError: string | null;
  onBrowserNavigate: (path: string | null) => void;
  onBrowserSelect: (path: string) => void;
};

export function ProjectModal({
  isOpen,
  mode,
  title,
  titleInputRef,
  onChangeTitle,
  basePath,
  onChangeBasePath,
  basePathPlaceholder,
  canUseCurrentTab,
  onUseCurrentTab,
  canUseHome,
  onUseHome,
  environments,
  selectedEnvironmentId,
  onChangeEnvironmentId,
  onOpenEnvironments,
  assetsEnabled,
  onChangeAssetsEnabled,
  soundConfig,
  onChangeSoundConfig,
  onClose,
  onSubmit,
  browserListing,
  browserLoading,
  browserError,
  onBrowserNavigate,
  onBrowserSelect,
}: ProjectModalProps) {
  const [browserExpanded, setBrowserExpanded] = useState(false);
  const [soundExpanded, setSoundExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="themedModalBackdrop" onClick={onClose}>
      <div className="pn-mdl" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="pn-mdl__hd">
          <div className="pn-mdl__hdmain">
            <div className="pn-mdl__titleinput">
              {mode === "new" ? "New project" : "Project settings"}
            </div>
          </div>
          <button type="button" className="pn-mdl__close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="pn-mdl__body">
            <div className="themedFormRow">
              <div className="themedFormLabel">Title</div>
              <input
                className="themedFormInput"
                ref={titleInputRef}
                value={title}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder="e.g. my-repo"
              />
            </div>
            <div className="themedFormRow">
              <div className="themedFormLabel">Project folder</div>
              <input
                className="themedFormInput"
                value={basePath}
                onChange={(e) => onChangeBasePath(e.target.value)}
                placeholder={basePathPlaceholder}
              />
              <div className="themedPathActions">
                <button
                  type="button"
                  className="pn-btn pn-btn--sm"
                  onClick={onUseCurrentTab}
                  disabled={!canUseCurrentTab}
                >
                  Use current tab
                </button>
                <button type="button" className="pn-btn pn-btn--sm" onClick={onUseHome} disabled={!canUseHome}>
                  Home
                </button>
              </div>
              <button
                type="button"
                className="themedBrowseToggle"
                onClick={() => setBrowserExpanded((v) => !v)}
              >
                <span className={`themedBrowseToggleArrow${browserExpanded ? " themedBrowseToggleArrow--open" : ""}`}>
                  &#9654;
                </span>
                Browse
              </button>
              {browserExpanded && (
                <InlineFolderBrowser
                  listing={browserListing}
                  loading={browserLoading}
                  error={browserError}
                  onNavigate={onBrowserNavigate}
                  onSelect={onBrowserSelect}
                />
              )}
              <div className="themedFormHint">
                {IS_TAURI
                  ? "New sessions in this project start here."
                  : "Absolute path on the server (e.g. /home/ubuntu/agent-maestro). New sessions in this project start here."}
              </div>
            </div>
            <button
              type="button"
              className="themedBrowseToggle"
              onClick={() => setAdvancedExpanded((v) => !v)}
            >
              <span className={`themedBrowseToggleArrow${advancedExpanded ? " themedBrowseToggleArrow--open" : ""}`}>
                &#9654;
              </span>
              Advanced options
            </button>
            {advancedExpanded && (
              <>
            <div className="themedFormRow">
              <div className="themedFormLabel">Environment (.env)</div>
              <div className="themedPathRow">
                <select
                  className="themedFormSelect"
                  value={selectedEnvironmentId}
                  onChange={(e) => onChangeEnvironmentId(e.target.value)}
                >
                  <option value="">None</option>
                  {environments
                    .slice()
                    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                    .map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                </select>
                <button type="button" className="pn-btn pn-btn--sm" onClick={onOpenEnvironments}>
                  Manage
                </button>
              </div>
              <div className="themedFormHint">Applied to new sessions in this project.</div>
            </div>
            <div className="themedFormRow">
              <div className="themedFormLabel">Assets</div>
              <label className="themedCheckRow">
                <input
                  type="checkbox"
                  checked={assetsEnabled}
                  onChange={(e) => onChangeAssetsEnabled(e.target.checked)}
                />
                Auto-create enabled assets on new sessions
              </label>
              <div className="themedFormHint">Manage templates in the Assets panel.</div>
            </div>
            <div className="themedFormRow">
              <div className="themedFormLabel">Notification Sounds</div>
              <button
                type="button"
                className="themedBrowseToggle"
                onClick={() => setSoundExpanded((v) => !v)}
              >
                <span className={`themedBrowseToggleArrow${soundExpanded ? " themedBrowseToggleArrow--open" : ""}`}>
                  &#9654;
                </span>
                {soundConfig
                  ? `${soundConfig.instrument.charAt(0).toUpperCase() + soundConfig.instrument.slice(1)} (custom)`
                  : 'Configure sounds'}
              </button>
              {soundExpanded && (
                <ProjectSoundSettings
                  config={soundConfig}
                  onChange={(config) => onChangeSoundConfig?.(config)}
                />
              )}
              <div className="themedFormHint">Per-project instrument and sound category overrides.</div>
            </div>
              </>
            )}
          </div>
          <div className="pn-mdl__foot">
            <button type="button" className="pn-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pn-btn pn-btn--primary">
              {mode === "new" ? "Create" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
