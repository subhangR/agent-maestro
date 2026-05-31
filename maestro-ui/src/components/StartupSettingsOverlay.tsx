import React, { useState, useCallback } from 'react';
import { useZoomStore, ZOOM_LEVELS, ZOOM_CONFIG, ZoomLevel } from '../stores/useZoomStore';
import { STORAGE_SETUP_COMPLETE_KEY } from '../app/constants/defaults';
import { soundManager } from '../services/soundManager';

interface StartupSettingsOverlayProps {
  onComplete: () => void;
}

export function StartupSettingsOverlay({ onComplete }: StartupSettingsOverlayProps) {
  const [step, setStep] = useState<'theme' | 'sound'>('theme');
  const zoomLevel = useZoomStore((s) => s.zoomLevel);
  const setZoomLevel = useZoomStore((s) => s.setZoomLevel);
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [volume, setVolume] = useState(soundManager.getVolume());

  const handleSoundToggle = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    soundManager.setEnabled(enabled);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    soundManager.setVolume(v);
  }, []);

  const handleFinish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_SETUP_COMPLETE_KEY, 'true');
    } catch {
      // best-effort
    }
    onComplete();
  }, [onComplete]);

  return (
    <div className="startupOverlay">
      <div className="startupOverlayBackdrop" />
      <div className="startupOverlayContent">
        <div className="startupOverlayHeader">
          <h1 className="startupOverlayTitle">Welcome to Maestro</h1>
          <p className="startupOverlaySubtitle">
            {step === 'theme'
              ? 'Set your UI scale'
              : 'Configure sound preferences'}
          </p>
          <div className="startupOverlaySteps">
            <span className={`startupStep ${step === 'theme' ? 'startupStepActive' : 'startupStepDone'}`}>1</span>
            <span className="startupStepLine" />
            <span className={`startupStep ${step === 'sound' ? 'startupStepActive' : ''}`}>2</span>
          </div>
        </div>

        {step === 'theme' && (
          <div className="startupOverlayBody">
            <div className="startupSection">
              <h2 className="startupSectionTitle">UI Scale</h2>
              <div className="startupZoomGrid">
                {ZOOM_LEVELS.map((level) => {
                  const config = ZOOM_CONFIG[level];
                  const isActive = level === zoomLevel;
                  return (
                    <button type="button"
                      key={level}
                      className={`startupZoomOption ${isActive ? 'startupZoomOptionActive' : ''}`}
                      onClick={() => setZoomLevel(level as ZoomLevel)}
                    >
                      <span className="startupZoomLabel">{config.label}</span>
                      <span className="startupZoomPercent">{Math.round(config.scale * 100)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="startupOverlayFooter">
              <button type="button" className="startupBtn startupBtnPrimary" onClick={() => setStep('sound')}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'sound' && (
          <div className="startupOverlayBody">
            <div className="startupSection">
              <h2 className="startupSectionTitle">Sound Effects</h2>
              <p className="startupSectionHint">
                Maestro can play sounds for task events, errors, and notifications.
              </p>

              <div className="startupSoundToggle">
                <button type="button"
                  className={`startupSoundBtn ${soundEnabled ? 'startupSoundBtnActive' : ''}`}
                  onClick={() => handleSoundToggle(true)}
                >
                  <span className="startupSoundIcon">&#9835;</span>
                  Sounds On
                </button>
                <button type="button"
                  className={`startupSoundBtn ${!soundEnabled ? 'startupSoundBtnActive' : ''}`}
                  onClick={() => handleSoundToggle(false)}
                >
                  <span className="startupSoundIcon">&#10005;</span>
                  Sounds Off
                </button>
              </div>

              {soundEnabled && (
                <div className="startupVolumeSection">
                  <label className="startupVolumeLabel">
                    Volume
                    <span className="startupVolumeValue">{Math.round(volume * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="startupVolumeSlider"
                  />
                </div>
              )}
            </div>

            <div className="startupOverlayFooter">
              <button type="button" className="startupBtn startupBtnSecondary" onClick={() => setStep('theme')}>
                Back
              </button>
              <button type="button" className="startupBtn startupBtnPrimary" onClick={handleFinish}>
                Get Started
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
