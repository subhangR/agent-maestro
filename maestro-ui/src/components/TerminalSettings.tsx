import React, { useCallback } from 'react';
import {
  useTerminalSettingsStore,
  TERMINAL_FONT_PRESETS,
  TERMINAL_COLOR_PRESETS,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  LETTER_SPACING_MIN,
  LETTER_SPACING_MAX,
  DEFAULT_TERMINAL_FONT_ID,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_CURSOR_STYLE,
  DEFAULT_CURSOR_INACTIVE_STYLE,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_FONT_WEIGHT_BOLD,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_LETTER_SPACING,
  DEFAULT_SCROLLBACK,
  DEFAULT_COLOR_PRESET_ID,
  buildITheme,
  type TerminalColors,
  type CursorStyle,
  type CursorInactiveStyle,
} from '../stores/useTerminalSettingsStore';
import { useAdvancedMode } from '../hooks/useAdvancedMode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ColorKey = keyof TerminalColors;

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'cursorAccent', label: 'Cursor Accent' },
  { key: 'selectionBackground', label: 'Selection BG' },
  { key: 'selectionForeground', label: 'Selection FG' },
];

const ANSI_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'blue', label: 'Blue' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'white', label: 'White' },
  { key: 'brightBlack', label: 'Bright Black' },
  { key: 'brightRed', label: 'Bright Red' },
  { key: 'brightGreen', label: 'Bright Green' },
  { key: 'brightYellow', label: 'Bright Yellow' },
  { key: 'brightBlue', label: 'Bright Blue' },
  { key: 'brightMagenta', label: 'Bright Magenta' },
  { key: 'brightCyan', label: 'Bright Cyan' },
  { key: 'brightWhite', label: 'Bright White' },
];

const FONT_WEIGHT_OPTIONS = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'SemiBold' },
  { value: 700, label: 'Bold' },
];

const CURSOR_STYLE_OPTIONS: { value: CursorStyle; label: string }[] = [
  { value: 'block', label: 'Block' },
  { value: 'underline', label: 'Underline' },
  { value: 'bar', label: 'Bar' },
];

const CURSOR_INACTIVE_OPTIONS: { value: CursorInactiveStyle; label: string }[] = [
  { value: 'outline', label: 'Outline' },
  { value: 'block', label: 'Block' },
  { value: 'bar', label: 'Bar' },
  { value: 'underline', label: 'Underline' },
  { value: 'none', label: 'None' },
];

/**
 * Parse a CSS color string into a hex color suitable for <input type="color">.
 * Only handles #rrggbb and rgba(...) — returns fallback if unparseable.
 */
function toColorInputValue(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1] + value[1];
    const g = value[2] + value[2];
    const b = value[3] + value[3];
    return `#${r}${g}${b}`;
  }
  // rgba(...) → strip alpha
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return `#${parseInt(m[1]).toString(16).padStart(2, '0')}${parseInt(m[2]).toString(16).padStart(2, '0')}${parseInt(m[3]).toString(16).padStart(2, '0')}`;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pn-fld" style={{ marginBottom: 20 }}>
      <div className="pn-flabel" style={{ marginBottom: 10, opacity: 0.5, letterSpacing: '0.06em', fontSize: 10, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

interface ColorSwatchProps {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (hex: string) => void;
}

function ColorSwatch({ label, value, fallback, onChange }: ColorSwatchProps) {
  const inputVal = toColorInputValue(value, fallback);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <input
        type="color"
        value={inputVal}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 28,
          height: 28,
          border: '1px solid var(--pn-line, rgba(255,255,255,0.1))',
          borderRadius: 4,
          padding: 2,
          cursor: 'pointer',
          background: 'transparent',
          flexShrink: 0,
        }}
        aria-label={label}
        title={label}
      />
      <input
        type="text"
        className="pn-input"
        value={value ?? ''}
        placeholder={fallback}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (/^#[0-9a-fA-F]{3,8}$/.test(v) || v === '') {
            onChange(v || fallback);
          }
        }}
        style={{ flex: 1, fontFamily: 'var(--pn-mono, monospace)', fontSize: 12 }}
        aria-label={`${label} hex value`}
      />
      <span style={{ fontSize: 11, opacity: 0.7, minWidth: 80 }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal Preview
// ---------------------------------------------------------------------------

interface PreviewProps {
  fontStack: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  colors: TerminalColors;
}

function TerminalPreview({ fontStack, fontSize, fontWeight, lineHeight, letterSpacing, colors }: PreviewProps) {
  const autoBg =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? '#100E0A'
      : '#1B1812';
  const theme = buildITheme(colors, autoBg);

  return (
    <div
      style={{
        background: theme.background,
        color: theme.foreground,
        fontFamily: fontStack,
        fontSize: `${fontSize}px`,
        fontWeight,
        lineHeight,
        letterSpacing: `${letterSpacing}px`,
        padding: '12px 14px',
        borderRadius: 6,
        whiteSpace: 'pre',
        overflowX: 'auto',
        border: '1px solid var(--pn-line, rgba(255,255,255,0.08))',
      }}
    >
      <div>
        <span style={{ color: theme.cursor }}>❯</span>
        {' git status · ls -la'}
      </div>
      <div>
        <span style={{ color: theme.green }}>M </span>
        <span style={{ color: theme.blue }}>src/index.ts</span>
      </div>
      <div>
        <span style={{ color: theme.red }}>D </span>
        <span style={{ color: theme.yellow }}>old/legacy.ts</span>
      </div>
      <div style={{ color: theme.brightBlack }}>
        {'function foo(x) { return x * 2; } // il1 O0 0x2A'}
      </div>
      <div>
        <span style={{ color: theme.cyan }}>const</span>
        <span> result = </span>
        <span style={{ color: theme.magenta }}>await</span>
        <span style={{ color: theme.green }}> fetch</span>
        <span>(url);</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TerminalSettings() {
  const advancedMode = useAdvancedMode();
  const fontId = useTerminalSettingsStore((s) => s.fontId);
  const fontStack = useTerminalSettingsStore((s) => s.fontStack);
  const fontSize = useTerminalSettingsStore((s) => s.fontSize);
  const fontWeight = useTerminalSettingsStore((s) => s.fontWeight);
  const fontWeightBold = useTerminalSettingsStore((s) => s.fontWeightBold);
  const lineHeight = useTerminalSettingsStore((s) => s.lineHeight);
  const letterSpacing = useTerminalSettingsStore((s) => s.letterSpacing);
  const cursorStyle = useTerminalSettingsStore((s) => s.cursorStyle);
  const cursorInactiveStyle = useTerminalSettingsStore((s) => s.cursorInactiveStyle);
  const scrollback = useTerminalSettingsStore((s) => s.scrollback);
  const colorPresetId = useTerminalSettingsStore((s) => s.colorPresetId);
  const colors = useTerminalSettingsStore((s) => s.colors);

  const setFontId = useTerminalSettingsStore((s) => s.setFontId);
  const setFontSize = useTerminalSettingsStore((s) => s.setFontSize);
  const setFontWeight = useTerminalSettingsStore((s) => s.setFontWeight);
  const setFontWeightBold = useTerminalSettingsStore((s) => s.setFontWeightBold);
  const setLineHeight = useTerminalSettingsStore((s) => s.setLineHeight);
  const setLetterSpacing = useTerminalSettingsStore((s) => s.setLetterSpacing);
  const setCursorStyle = useTerminalSettingsStore((s) => s.setCursorStyle);
  const setCursorInactiveStyle = useTerminalSettingsStore((s) => s.setCursorInactiveStyle);
  const setScrollback = useTerminalSettingsStore((s) => s.setScrollback);
  const applyColorPreset = useTerminalSettingsStore((s) => s.applyColorPreset);
  const setColor = useTerminalSettingsStore((s) => s.setColor);
  const reset = useTerminalSettingsStore((s) => s.reset);

  const isDefault =
    fontId === DEFAULT_TERMINAL_FONT_ID &&
    fontSize === DEFAULT_TERMINAL_FONT_SIZE &&
    fontWeight === DEFAULT_FONT_WEIGHT &&
    fontWeightBold === DEFAULT_FONT_WEIGHT_BOLD &&
    lineHeight === DEFAULT_LINE_HEIGHT &&
    letterSpacing === DEFAULT_LETTER_SPACING &&
    cursorStyle === DEFAULT_CURSOR_STYLE &&
    cursorInactiveStyle === DEFAULT_CURSOR_INACTIVE_STYLE &&
    scrollback === DEFAULT_SCROLLBACK &&
    colorPresetId === DEFAULT_COLOR_PRESET_ID;

  const handleColorChange = useCallback(
    (key: ColorKey, value: string) => {
      setColor(key, value);
    },
    [setColor],
  );

  // Build theme for ColorSwatch fallback values
  const autoBg =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
      ? '#100E0A'
      : '#1B1812';
  const theme = buildITheme(colors, autoBg);

  return (
    <div className="pn-fld">
      {/* TODO: currently global settings, not per-project. Add per-project scoping
          if/when the domain model supports project-level terminal overrides. */}

      {/* ---- Live Preview ---- */}
      <Section title="Preview">
        <TerminalPreview
          fontStack={fontStack}
          fontSize={fontSize}
          fontWeight={fontWeight}
          lineHeight={lineHeight}
          letterSpacing={letterSpacing}
          colors={colors}
        />
      </Section>

      {/* ---- Font ---- */}
      <Section title="Font">
        <div className="pn-fld">
          <div className="pn-flabel">Family</div>
          <select
            className="pn-select"
            value={fontId}
            onChange={(e) => setFontId(e.target.value)}
          >
            {TERMINAL_FONT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pn-fld">
          <div className="pn-flabel">Size — {fontSize}px</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="pn-btn"
              onClick={() => setFontSize(fontSize - 1)}
              disabled={fontSize <= TERMINAL_FONT_SIZE_MIN}
              aria-label="Decrease terminal font size"
            >
              −
            </button>
            <input
              type="range"
              min={TERMINAL_FONT_SIZE_MIN}
              max={TERMINAL_FONT_SIZE_MAX}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
              aria-label="Terminal font size"
            />
            <button
              type="button"
              className="pn-btn"
              onClick={() => setFontSize(fontSize + 1)}
              disabled={fontSize >= TERMINAL_FONT_SIZE_MAX}
              aria-label="Increase terminal font size"
            >
              +
            </button>
          </div>
        </div>

        <div className="pn-fld">
          <div className="pn-flabel">Weight (normal)</div>
          <div className="pn-seg">
            {FONT_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`pn-seg-i${fontWeight === opt.value ? ' pn-seg-i--active' : ''}`}
                onClick={() => setFontWeight(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pn-fld">
          <div className="pn-flabel">Weight (bold)</div>
          <div className="pn-seg">
            {FONT_WEIGHT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`pn-seg-i${fontWeightBold === opt.value ? ' pn-seg-i--active' : ''}`}
                onClick={() => setFontWeightBold(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pn-fld">
          <div className="pn-flabel">Line Height — {lineHeight.toFixed(2)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="pn-btn"
              onClick={() => setLineHeight(parseFloat((lineHeight - LINE_HEIGHT_STEP).toFixed(10)))}
              disabled={lineHeight <= LINE_HEIGHT_MIN}
              aria-label="Decrease line height"
            >
              −
            </button>
            <input
              type="range"
              min={LINE_HEIGHT_MIN}
              max={LINE_HEIGHT_MAX}
              step={LINE_HEIGHT_STEP}
              value={lineHeight}
              onChange={(e) => setLineHeight(parseFloat(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Terminal line height"
            />
            <button
              type="button"
              className="pn-btn"
              onClick={() => setLineHeight(parseFloat((lineHeight + LINE_HEIGHT_STEP).toFixed(10)))}
              disabled={lineHeight >= LINE_HEIGHT_MAX}
              aria-label="Increase line height"
            >
              +
            </button>
          </div>
        </div>

        {advancedMode && (
        <div className="pn-fld">
          <div className="pn-flabel">Letter Spacing — {letterSpacing}px</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="pn-btn"
              onClick={() => setLetterSpacing(letterSpacing - 1)}
              disabled={letterSpacing <= LETTER_SPACING_MIN}
              aria-label="Decrease letter spacing"
            >
              −
            </button>
            <input
              type="range"
              min={LETTER_SPACING_MIN}
              max={LETTER_SPACING_MAX}
              step={1}
              value={letterSpacing}
              onChange={(e) => setLetterSpacing(parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
              aria-label="Terminal letter spacing"
            />
            <button
              type="button"
              className="pn-btn"
              onClick={() => setLetterSpacing(letterSpacing + 1)}
              disabled={letterSpacing >= LETTER_SPACING_MAX}
              aria-label="Increase letter spacing"
            >
              +
            </button>
          </div>
        </div>
        )}
      </Section>

      {/* ---- Cursor ---- */}
      <Section title="Cursor">
        <div className="pn-fld">
          <div className="pn-flabel">Style</div>
          <div className="pn-seg">
            {CURSOR_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`pn-seg-i${cursorStyle === opt.value ? ' pn-seg-i--active' : ''}`}
                onClick={() => setCursorStyle(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pn-fld">
          <div className="pn-flabel">Inactive Style</div>
          <div className="pn-fhint">Cursor appearance when the terminal is not focused</div>
          <select
            className="pn-select"
            value={cursorInactiveStyle}
            onChange={(e) => setCursorInactiveStyle(e.target.value as CursorInactiveStyle)}
          >
            {CURSOR_INACTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      {/* ---- Behavior (Advanced) ---- */}
      {advancedMode && (
      <Section title="Behavior">
        <div className="pn-fld">
          <div className="pn-flabel">Scrollback Lines</div>
          <div className="pn-fhint">
            Number of lines to keep in the scrollback buffer (0 – 100 000)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              className="pn-input"
              min={0}
              max={100000}
              step={1000}
              value={scrollback}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setScrollback(n);
              }}
              style={{ width: 100 }}
              aria-label="Terminal scrollback lines"
            />
            <input
              type="range"
              min={0}
              max={50000}
              step={1000}
              value={Math.min(scrollback, 50000)}
              onChange={(e) => setScrollback(parseInt(e.target.value, 10))}
              style={{ flex: 1 }}
              aria-label="Terminal scrollback slider"
            />
          </div>
        </div>
      </Section>
      )}

      {/* ---- Colors ---- */}
      <Section title="Colors">
        <div className="pn-fld">
          <div className="pn-flabel">Theme Preset</div>
          <div className="pn-fhint">
            Presets populate all color fields. You can then override individual colors below.
          </div>
          <div className="pn-seg" style={{ flexWrap: 'wrap' }}>
            {TERMINAL_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`pn-seg-i${colorPresetId === preset.id ? ' pn-seg-i--active' : ''}`}
                onClick={() => applyColorPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {advancedMode && (<>
        <div className="pn-fld">
          <div className="pn-flabel" style={{ marginBottom: 8 }}>Core Colors</div>
          <div className="pn-card-s" style={{ padding: '8px 10px' }}>
            {COLOR_FIELDS.map(({ key, label }) => {
              const fallback = (theme as Record<string, string | undefined>)[key as string] ?? '#888888';
              return (
                <ColorSwatch
                  key={key}
                  label={label}
                  value={colors[key]}
                  fallback={typeof fallback === 'string' ? fallback : '#888888'}
                  onChange={(hex) => handleColorChange(key, hex)}
                />
              );
            })}
          </div>
        </div>

        <div className="pn-fld">
          <div className="pn-flabel" style={{ marginBottom: 8 }}>ANSI Colors (16)</div>
          <div className="pn-card-s" style={{ padding: '8px 10px' }}>
            {ANSI_FIELDS.map(({ key, label }) => {
              const fallback = (theme as Record<string, string | undefined>)[key as string] ?? '#888888';
              return (
                <ColorSwatch
                  key={key}
                  label={label}
                  value={colors[key]}
                  fallback={typeof fallback === 'string' ? fallback : '#888888'}
                  onChange={(hex) => handleColorChange(key, hex)}
                />
              );
            })}
          </div>
        </div>
        </>)}
      </Section>

      {/* ---- Reset ---- */}
      {!isDefault && (
        <div className="pn-fld">
          <button type="button" className="pn-btn" onClick={reset}>
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
