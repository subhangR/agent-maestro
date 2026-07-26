import React from 'react';
import { useZoomStore, ZOOM_LEVELS, ZOOM_CONFIG } from '../stores/useZoomStore';
import { TerminalSettings } from './TerminalSettings';
import { useUIStore } from '../stores/useUIStore';

export function DisplaySettings() {
  const zoomLevel = useZoomStore((s) => s.zoomLevel);
  const setZoomLevel = useZoomStore((s) => s.setZoomLevel);
  const advancedMode = useUIStore((s) => s.advancedMode);
  const setAdvancedMode = useUIStore((s) => s.setAdvancedMode);

  return (
    <div className="pn-fld">
      {/* ---------------- Developer features ---------------- */}
      <div className="pn-fld">
        <div className="pn-flabel">Developer features</div>
        <div className="pn-fhint">
          Show advanced tools — git, the code editor and file browser, terminal color editing,
          automation rules, and server details. Off by default to keep things simple.
        </div>
        <div className="pn-seg">
          <button
            type="button"
            className={`pn-seg-i${!advancedMode ? ' pn-seg-i--active' : ''}`}
            onClick={() => setAdvancedMode(false)}
          >
            Off
          </button>
          <button
            type="button"
            className={`pn-seg-i${advancedMode ? ' pn-seg-i--active' : ''}`}
            onClick={() => setAdvancedMode(true)}
          >
            On
          </button>
        </div>
      </div>

      {/* ---------------- UI Scale ---------------- */}
      <div className="pn-fld">
        <div className="pn-flabel">UI Scale</div>
        <div className="pn-fhint">
          Scales the entire interface — text, panels, buttons, spacing
        </div>
        <div className="pn-seg">
          {ZOOM_LEVELS.map((level) => {
            const config = ZOOM_CONFIG[level];
            const isActive = level === zoomLevel;
            return (
              <button
                key={level}
                type="button"
                className={`pn-seg-i${isActive ? ' pn-seg-i--active' : ''}`}
                onClick={() => setZoomLevel(level)}
              >
                {config.label} {Math.round(config.scale * 100)}%
              </button>
            );
          })}
        </div>
      </div>

      <div className="pn-fld">
        <div className="pn-flabel">Preview</div>
        <div className="pn-card-s" style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: `calc(13px * ${ZOOM_CONFIG[zoomLevel].scale})` }}>
            The quick brown fox jumps over the lazy dog.
          </span>
          <span style={{ fontSize: `calc(11px * ${ZOOM_CONFIG[zoomLevel].scale})`, opacity: 0.6 }}>
            ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
          </span>
        </div>
      </div>

      {zoomLevel !== 'normal' && (
        <button
          type="button"
          className="pn-btn"
          onClick={() => setZoomLevel('normal')}
        >
          Reset UI Scale to Default
        </button>
      )}

      {/* ---------------- Terminal (full panel) ---------------- */}
      {/* Same store as Project Settings → Terminal — changes here apply
          globally to every open terminal. */}
      <div className="pn-fld" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--pn-line)' }}>
        <div className="pn-flabel">Terminal</div>
        <div className="pn-fhint">
          Font, cursor, behavior and colors for every session terminal. Same settings as Project Settings → Terminal.
        </div>
      </div>
      <TerminalSettings />
    </div>
  );
}
