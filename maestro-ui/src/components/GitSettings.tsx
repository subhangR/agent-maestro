import React, { useEffect, useState } from 'react';
import {
  useGitSettingsStore,
  previewBranchName,
  DEFAULT_BRANCH_NAMING_SCHEME,
} from '../stores/useGitSettingsStore';
import { maestroClient } from '../utils/MaestroClient';
import type { GitCapabilities } from '../app/types/maestro';

/**
 * Global git-integration preferences plus a live capability readout (git / gh /
 * gh-auth). The capability row tells the user why PR features may be unavailable
 * — PR UI elsewhere is gated on `hasGh`.
 */
export function GitSettings() {
  const defaultBaseBranch = useGitSettingsStore((s) => s.defaultBaseBranch);
  const branchNamingScheme = useGitSettingsStore((s) => s.branchNamingScheme);
  const autoDiscardOnMerge = useGitSettingsStore((s) => s.autoDiscardOnMerge);
  const setDefaultBaseBranch = useGitSettingsStore((s) => s.setDefaultBaseBranch);
  const setBranchNamingScheme = useGitSettingsStore((s) => s.setBranchNamingScheme);
  const setAutoDiscardOnMerge = useGitSettingsStore((s) => s.setAutoDiscardOnMerge);
  const reset = useGitSettingsStore((s) => s.reset);

  const [caps, setCaps] = useState<GitCapabilities | null>(null);
  const [capsError, setCapsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    maestroClient
      .getGitCapabilities()
      .then((c) => { if (!cancelled) setCaps(c); })
      .catch(() => { if (!cancelled) setCapsError(true); });
    return () => { cancelled = true; };
  }, []);

  const isDefault =
    defaultBaseBranch === '' &&
    branchNamingScheme === DEFAULT_BRANCH_NAMING_SCHEME &&
    autoDiscardOnMerge === false;

  return (
    <div className="pn-fld">
      <div className="pn-fld">
        <div className="pn-flabel">Environment</div>
        <div className="pn-fhint">
          Detected git tooling. PR features require GitHub CLI (gh), installed and authenticated.
        </div>
        <div className="pn-frow">
          {capsError ? (
            <span className="pn-fhint">Unable to read git capabilities.</span>
          ) : caps === null ? (
            <span className="pn-fhint">Checking…</span>
          ) : (
            <>
              <CapBadge ok={caps.hasGit} label="git" />
              <CapBadge ok={caps.hasGh} label="gh" />
              <CapBadge ok={caps.ghAuthed} label="gh auth" />
            </>
          )}
        </div>
        {caps && !caps.hasGh && (
          <div className="pn-fhint">
            Install GitHub CLI from https://cli.github.com to enable pull requests.
          </div>
        )}
        {caps && caps.hasGh && !caps.ghAuthed && (
          <div className="pn-fhint">
            Run <code>gh auth login</code> to enable pull requests.
          </div>
        )}
      </div>

      <div className="pn-fld">
        <label className="pn-flabel" htmlFor="gitDefaultBaseBranch">
          Default base branch
        </label>
        <div className="pn-fhint">
          Overrides the auto-detected base (origin/HEAD) when merging or opening PRs. Leave blank to auto-detect.
        </div>
        <input
          id="gitDefaultBaseBranch"
          className="pn-input"
          type="text"
          spellCheck={false}
          placeholder="auto-detect (e.g. main)"
          value={defaultBaseBranch}
          onChange={(e) => setDefaultBaseBranch(e.target.value)}
        />
      </div>

      <div className="pn-fld">
        <label className="pn-flabel" htmlFor="gitBranchScheme">
          Branch naming scheme
        </label>
        <div className="pn-fhint">
          Template for worktree branch names. <code>{'{slug}'}</code> = task slug, <code>{'{id}'}</code> = short id.
        </div>
        <input
          id="gitBranchScheme"
          className="pn-input"
          type="text"
          spellCheck={false}
          placeholder={DEFAULT_BRANCH_NAMING_SCHEME}
          value={branchNamingScheme}
          onChange={(e) => setBranchNamingScheme(e.target.value)}
        />
        <div className="pn-fhint">
          Example: <code>{previewBranchName(branchNamingScheme)}</code>
        </div>
      </div>

      <div className="pn-fld">
        <div className="pn-caps">
          <div className="pn-cap">
            <input
              type="checkbox"
              id="gitAutoDiscard"
              className="sr-only"
              checked={autoDiscardOnMerge}
              onChange={(e) => setAutoDiscardOnMerge(e.target.checked)}
            />
            <div className="pn-cap__body">
              <span className="pn-cap__name">Auto-discard worktree after merge</span>
              <span className="pn-cap__desc">
                Remove the worktree and its branch automatically once it merges cleanly.
              </span>
            </div>
            <label
              htmlFor="gitAutoDiscard"
              className={`pn-switch${autoDiscardOnMerge ? ' pn-switch--on' : ''}`}
              aria-label="Auto-discard worktree after merge"
            />
          </div>
        </div>
      </div>

      {!isDefault && (
        <button type="button" className="pn-btn" onClick={reset}>
          Reset to defaults
        </button>
      )}
    </div>
  );
}

function CapBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`pn-pill ${ok ? 'pn-pill--run' : 'pn-pill--idle'}`}
      title={ok ? `${label} available` : `${label} not available`}
    >
      <span aria-hidden="true">{ok ? '✓' : '✕'}</span>
      {label}
    </span>
  );
}
