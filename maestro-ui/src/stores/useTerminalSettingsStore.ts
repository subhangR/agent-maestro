import { create } from 'zustand';
import type { ITheme } from '@xterm/xterm';

/**
 * User-configurable terminal appearance (font, cursor, colors, spacing),
 * persisted to localStorage and applied live to every open xterm instance.
 * The terminal stays dark in both themes; the bg flips between two dark values
 * to match --pn-term-bg chrome gutter (unless the user sets an explicit bg override).
 */

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const STORAGE_TERMINAL_FONT_KEY = 'agents-ui-terminal-font-id-v1';
const STORAGE_TERMINAL_FONT_SIZE_KEY = 'agents-ui-terminal-font-size-v1';
const STORAGE_TERMINAL_SETTINGS_KEY = 'agents-ui-terminal-settings-v2';

// ---------------------------------------------------------------------------
// Font presets
// ---------------------------------------------------------------------------
export interface TerminalFontPreset {
  id: string;
  label: string;
  /** Full CSS font-family stack passed to xterm's `fontFamily` option. */
  stack: string;
}

export const TERMINAL_FONT_PRESETS: TerminalFontPreset[] = [
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack:
      '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    id: 'system',
    label: 'System Mono (SF Mono)',
    stack:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  { id: 'menlo', label: 'Menlo', stack: 'Menlo, Monaco, "Courier New", monospace' },
  { id: 'monaco', label: 'Monaco', stack: 'Monaco, Menlo, "Courier New", monospace' },
  { id: 'courier', label: 'Courier', stack: '"Courier New", Courier, monospace' },
];

export const DEFAULT_TERMINAL_FONT_ID = 'jetbrains';
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const TERMINAL_FONT_SIZE_MIN = 9;
export const TERMINAL_FONT_SIZE_MAX = 22;

export function terminalFontStack(id: string): string {
  return (
    TERMINAL_FONT_PRESETS.find((p) => p.id === id) ?? TERMINAL_FONT_PRESETS[0]
  ).stack;
}

// ---------------------------------------------------------------------------
// Color theme presets
// ---------------------------------------------------------------------------
export interface TerminalColorPreset {
  id: string;
  label: string;
  colors: TerminalColors;
}

/**
 * Explicit color overrides. All fields are optional; undefined means "use
 * the automatic value" (e.g., background follows the app light/dark theme).
 */
export interface TerminalColors {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

/** Warm Atelier — the original maestro palette. */
const WARM_ATELIER_COLORS: TerminalColors = {
  // background intentionally undefined → follows app light/dark toggle
  foreground: '#D9D2C4',
  cursor: '#E0A45A',
  cursorAccent: undefined,
  selectionBackground: 'rgba(224,164,90,0.22)',
  selectionForeground: '#F3EEE2',
  black: '#322D24',
  red: '#CB7059',
  green: '#74B083',
  yellow: '#D2A24C',
  blue: '#6E9BC4',
  magenta: '#B98BC0',
  cyan: '#6FB2A8',
  white: '#CFC8BA',
  brightBlack: '#6B6453',
  brightRed: '#DC8B73',
  brightGreen: '#8FC79C',
  brightYellow: '#E6B968',
  brightBlue: '#88B0D6',
  brightMagenta: '#CCA0D2',
  brightCyan: '#86C4BA',
  brightWhite: '#EFE9DB',
};

/** Classic dark — high-contrast ANSI on near-black. */
const CLASSIC_DARK_COLORS: TerminalColors = {
  background: '#1A1A1A',
  foreground: '#F0F0F0',
  cursor: '#FFFFFF',
  cursorAccent: '#1A1A1A',
  selectionBackground: 'rgba(255,255,255,0.2)',
  selectionForeground: '#FFFFFF',
  black: '#2E2E2E',
  red: '#E06C75',
  green: '#98C379',
  yellow: '#E5C07B',
  blue: '#61AFEF',
  magenta: '#C678DD',
  cyan: '#56B6C2',
  white: '#DCDFE4',
  brightBlack: '#636D83',
  brightRed: '#F16079',
  brightGreen: '#A8D89C',
  brightYellow: '#F0CC8A',
  brightBlue: '#74BFFF',
  brightMagenta: '#D48CF0',
  brightCyan: '#6CC7D2',
  brightWhite: '#FFFFFF',
};

/** Light terminal — soft warm light bg. */
const LIGHT_TERMINAL_COLORS: TerminalColors = {
  background: '#FAF6F0',
  foreground: '#2C2620',
  cursor: '#7A5C2A',
  cursorAccent: '#FAF6F0',
  selectionBackground: 'rgba(122,92,42,0.18)',
  selectionForeground: '#2C2620',
  black: '#3C3530',
  red: '#8B2D20',
  green: '#2D6B3A',
  yellow: '#7A5C2A',
  blue: '#2A5080',
  magenta: '#6A3878',
  cyan: '#2A6060',
  white: '#BFBAB2',
  brightBlack: '#7A7268',
  brightRed: '#B04030',
  brightGreen: '#3A8A4A',
  brightYellow: '#9A7838',
  brightBlue: '#3A6A9A',
  brightMagenta: '#864898',
  brightCyan: '#3A7A7A',
  brightWhite: '#F5F0E8',
};

export const TERMINAL_COLOR_PRESETS: TerminalColorPreset[] = [
  { id: 'warm-atelier', label: 'Warm Atelier (Default)', colors: WARM_ATELIER_COLORS },
  { id: 'classic-dark', label: 'Classic Dark', colors: CLASSIC_DARK_COLORS },
  { id: 'light', label: 'Light Terminal', colors: LIGHT_TERMINAL_COLORS },
];

// ---------------------------------------------------------------------------
// Defaults for all new options
// ---------------------------------------------------------------------------
export type CursorStyle = 'block' | 'underline' | 'bar';
export type CursorInactiveStyle = 'outline' | 'block' | 'bar' | 'underline' | 'none';

export const DEFAULT_CURSOR_STYLE: CursorStyle = 'block';
export const DEFAULT_CURSOR_BLINK = true;
export const DEFAULT_CURSOR_INACTIVE_STYLE: CursorInactiveStyle = 'outline';
export const DEFAULT_FONT_WEIGHT: number = 400;
export const DEFAULT_FONT_WEIGHT_BOLD: number = 700;
export const DEFAULT_LINE_HEIGHT = 1.2;
export const DEFAULT_LETTER_SPACING = 0;
export const DEFAULT_SCROLLBACK = 5000;
export const DEFAULT_COLOR_PRESET_ID = 'warm-atelier';

export const LINE_HEIGHT_MIN = 1.0;
export const LINE_HEIGHT_MAX = 2.0;
export const LINE_HEIGHT_STEP = 0.05;
export const LETTER_SPACING_MIN = -2;
export const LETTER_SPACING_MAX = 6;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------
export interface TerminalSettingsState {
  // Font
  fontId: string;
  fontSize: number;
  /** Derived from fontId — the stack to hand xterm. */
  fontStack: string;
  fontWeight: number;
  fontWeightBold: number;
  lineHeight: number;
  letterSpacing: number;

  // Cursor
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  cursorInactiveStyle: CursorInactiveStyle;

  // Behavior
  scrollback: number;

  // Colors
  colorPresetId: string;
  colors: TerminalColors;

  // Actions
  setFontId: (id: string) => void;
  setFontSize: (size: number) => void;
  setFontWeight: (w: number) => void;
  setFontWeightBold: (w: number) => void;
  setLineHeight: (h: number) => void;
  setLetterSpacing: (s: number) => void;
  setCursorStyle: (style: CursorStyle) => void;
  setCursorBlink: (blink: boolean) => void;
  setCursorInactiveStyle: (style: CursorInactiveStyle) => void;
  setScrollback: (n: number) => void;
  applyColorPreset: (presetId: string) => void;
  setColor: (key: keyof TerminalColors, value: string | undefined) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Serialisable snapshot of all settings (written to localStorage).
 * We keep it flat so old v1 keys still load without breaking anything.
 */
interface PersistedSettings {
  fontId?: string;
  fontSize?: number;
  fontWeight?: number;
  fontWeightBold?: number;
  lineHeight?: number;
  letterSpacing?: number;
  cursorStyle?: CursorStyle;
  cursorBlink?: boolean;
  cursorInactiveStyle?: CursorInactiveStyle;
  scrollback?: number;
  colorPresetId?: string;
  colors?: TerminalColors;
}

function readSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_TERMINAL_SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as PersistedSettings;
  } catch {
    // best-effort
  }
  // Fall back to legacy v1 keys
  const out: PersistedSettings = {};
  try {
    const fontId = localStorage.getItem(STORAGE_TERMINAL_FONT_KEY);
    if (fontId && TERMINAL_FONT_PRESETS.some((p) => p.id === fontId)) out.fontId = fontId;
    const fontSize = localStorage.getItem(STORAGE_TERMINAL_FONT_SIZE_KEY);
    const n = fontSize ? parseInt(fontSize, 10) : NaN;
    if (Number.isFinite(n) && n >= TERMINAL_FONT_SIZE_MIN && n <= TERMINAL_FONT_SIZE_MAX)
      out.fontSize = n;
  } catch {
    // best-effort
  }
  return out;
}

function snapshotForPersist(s: TerminalSettingsState): PersistedSettings {
  return {
    fontId: s.fontId,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    fontWeightBold: s.fontWeightBold,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    cursorStyle: s.cursorStyle,
    cursorBlink: s.cursorBlink,
    cursorInactiveStyle: s.cursorInactiveStyle,
    scrollback: s.scrollback,
    colorPresetId: s.colorPresetId,
    colors: s.colors,
  };
}

function persistSettings(payload: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_TERMINAL_SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Build ITheme from TerminalColors + auto-bg
// ---------------------------------------------------------------------------

/**
 * Build an xterm ITheme from TerminalColors.
 * `autoBg` is the background that follows the app light/dark toggle.
 * If `colors.background` is explicitly set, it overrides `autoBg`.
 */
export function buildITheme(colors: TerminalColors, autoBg: string): ITheme {
  const bg = colors.background ?? autoBg;
  return {
    background: bg,
    foreground: colors.foreground ?? '#D9D2C4',
    cursor: colors.cursor ?? '#E0A45A',
    cursorAccent: colors.cursorAccent ?? bg,
    selectionBackground: colors.selectionBackground ?? 'rgba(224,164,90,0.22)',
    selectionForeground: colors.selectionForeground ?? '#F3EEE2',
    black: colors.black ?? '#322D24',
    red: colors.red ?? '#CB7059',
    green: colors.green ?? '#74B083',
    yellow: colors.yellow ?? '#D2A24C',
    blue: colors.blue ?? '#6E9BC4',
    magenta: colors.magenta ?? '#B98BC0',
    cyan: colors.cyan ?? '#6FB2A8',
    white: colors.white ?? '#CFC8BA',
    brightBlack: colors.brightBlack ?? '#6B6453',
    brightRed: colors.brightRed ?? '#DC8B73',
    brightGreen: colors.brightGreen ?? '#8FC79C',
    brightYellow: colors.brightYellow ?? '#E6B968',
    brightBlue: colors.brightBlue ?? '#88B0D6',
    brightMagenta: colors.brightMagenta ?? '#CCA0D2',
    brightCyan: colors.brightCyan ?? '#86C4BA',
    brightWhite: colors.brightWhite ?? '#EFE9DB',
  };
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const _saved = readSettings();

const DEFAULT_STATE = {
  fontId: DEFAULT_TERMINAL_FONT_ID,
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  fontStack: terminalFontStack(DEFAULT_TERMINAL_FONT_ID),
  fontWeight: DEFAULT_FONT_WEIGHT,
  fontWeightBold: DEFAULT_FONT_WEIGHT_BOLD,
  lineHeight: DEFAULT_LINE_HEIGHT,
  letterSpacing: DEFAULT_LETTER_SPACING,
  cursorStyle: DEFAULT_CURSOR_STYLE as CursorStyle,
  cursorBlink: DEFAULT_CURSOR_BLINK,
  cursorInactiveStyle: DEFAULT_CURSOR_INACTIVE_STYLE as CursorInactiveStyle,
  scrollback: DEFAULT_SCROLLBACK,
  colorPresetId: DEFAULT_COLOR_PRESET_ID,
  colors: { ...WARM_ATELIER_COLORS },
};

function resolvedInitialState() {
  const fontId = (_saved.fontId && TERMINAL_FONT_PRESETS.some((p) => p.id === _saved.fontId))
    ? _saved.fontId
    : DEFAULT_TERMINAL_FONT_ID;
  const fontSize = (_saved.fontSize !== undefined && Number.isFinite(_saved.fontSize)
    && _saved.fontSize >= TERMINAL_FONT_SIZE_MIN && _saved.fontSize <= TERMINAL_FONT_SIZE_MAX)
    ? _saved.fontSize
    : DEFAULT_TERMINAL_FONT_SIZE;
  const fontWeight = _saved.fontWeight ?? DEFAULT_FONT_WEIGHT;
  const fontWeightBold = _saved.fontWeightBold ?? DEFAULT_FONT_WEIGHT_BOLD;
  const lineHeight = _saved.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const letterSpacing = _saved.letterSpacing ?? DEFAULT_LETTER_SPACING;
  const cursorStyle = _saved.cursorStyle ?? DEFAULT_CURSOR_STYLE;
  const cursorBlink = _saved.cursorBlink ?? DEFAULT_CURSOR_BLINK;
  const cursorInactiveStyle = _saved.cursorInactiveStyle ?? DEFAULT_CURSOR_INACTIVE_STYLE;
  const scrollback = _saved.scrollback ?? DEFAULT_SCROLLBACK;
  const colorPresetId = _saved.colorPresetId ?? DEFAULT_COLOR_PRESET_ID;

  // Colors: start from the preset then overlay any per-key overrides saved
  const presetColors = (TERMINAL_COLOR_PRESETS.find((p) => p.id === colorPresetId)
    ?? TERMINAL_COLOR_PRESETS[0]).colors;
  const colors: TerminalColors = { ...presetColors, ...(_saved.colors ?? {}) };

  return {
    fontId,
    fontSize,
    fontStack: terminalFontStack(fontId),
    fontWeight,
    fontWeightBold,
    lineHeight,
    letterSpacing,
    cursorStyle: cursorStyle as CursorStyle,
    cursorBlink,
    cursorInactiveStyle: cursorInactiveStyle as CursorInactiveStyle,
    scrollback,
    colorPresetId,
    colors,
  };
}

const _init = resolvedInitialState();

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTerminalSettingsStore = create<TerminalSettingsState>((set, get) => ({
  ..._init,

  setFontId: (id: string) => {
    const stack = terminalFontStack(id);
    set({ fontId: id, fontStack: stack });
    persistSettings(snapshotForPersist(get()));
  },

  setFontSize: (size: number) => {
    const clamped = Math.min(
      TERMINAL_FONT_SIZE_MAX,
      Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(size)),
    );
    set({ fontSize: clamped });
    persistSettings(snapshotForPersist(get()));
  },

  setFontWeight: (w: number) => {
    set({ fontWeight: w });
    persistSettings(snapshotForPersist(get()));
  },

  setFontWeightBold: (w: number) => {
    set({ fontWeightBold: w });
    persistSettings(snapshotForPersist(get()));
  },

  setLineHeight: (h: number) => {
    const clamped = Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, h));
    const rounded = Math.round(clamped / LINE_HEIGHT_STEP) * LINE_HEIGHT_STEP;
    set({ lineHeight: rounded });
    persistSettings(snapshotForPersist(get()));
  },

  setLetterSpacing: (s: number) => {
    const clamped = Math.min(LETTER_SPACING_MAX, Math.max(LETTER_SPACING_MIN, s));
    set({ letterSpacing: clamped });
    persistSettings(snapshotForPersist(get()));
  },

  setCursorStyle: (style: CursorStyle) => {
    set({ cursorStyle: style });
    persistSettings(snapshotForPersist(get()));
  },

  setCursorBlink: (blink: boolean) => {
    set({ cursorBlink: blink });
    persistSettings(snapshotForPersist(get()));
  },

  setCursorInactiveStyle: (style: CursorInactiveStyle) => {
    set({ cursorInactiveStyle: style });
    persistSettings(snapshotForPersist(get()));
  },

  setScrollback: (n: number) => {
    const clamped = Math.min(100000, Math.max(0, Math.round(n)));
    set({ scrollback: clamped });
    persistSettings(snapshotForPersist(get()));
  },

  applyColorPreset: (presetId: string) => {
    const preset = TERMINAL_COLOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const colors = { ...preset.colors };
    set({ colorPresetId: presetId, colors });
    persistSettings(snapshotForPersist(get()));
  },

  setColor: (key: keyof TerminalColors, value: string | undefined) => {
    const colors = { ...get().colors, [key]: value };
    set({ colors });
    persistSettings(snapshotForPersist(get()));
  },

  reset: () => {
    set({ ...DEFAULT_STATE });
    persistSettings(snapshotForPersist(get()));
  },
}));
