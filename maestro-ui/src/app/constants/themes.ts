/* ------------------------------------------------------------------ */
/*  Style Definitions — the "personality" of each visual theme         */
/* ------------------------------------------------------------------ */

export type StyleId = 'terminal' | 'material' | 'glass' | 'minimal';

export interface StyleMeta {
  id: StyleId;
  name: string;
  description: string;
  icon: string;          // emoji or short label shown in picker
}

export const STYLES: Record<StyleId, StyleMeta> = {
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    description: 'Neon hacker aesthetic',
    icon: '>_',
  },
  material: {
    id: 'material',
    name: 'Material',
    description: 'Clean Material Design',
    icon: '◐',
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    description: 'Frosted glassmorphism',
    icon: '◇',
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Ultra-clean & focused',
    icon: '—',
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
// The redesign is built around translucent, layered surfaces. Keep the style
// picker and the first-run experience in sync with that visual language.
export const DEFAULT_STYLE_ID: StyleId = 'glass';

/* ------------------------------------------------------------------ */
/*  Color Theme Definitions — each style has its own color palette     */
/* ------------------------------------------------------------------ */

export type ThemeId = string;  // composite key: `${styleId}-${colorKey}`

export interface ThemeColors {
  primary: string;
  primaryDim: string;
  primaryRgb: string;
  border: string;
  text: string;
  textDim: string;
}

export interface ColorVariant {
  key: string;
  name: string;
  colors: ThemeColors;
}

export interface StyleThemes {
  styleId: StyleId;
  defaultColorKey: string;
  variants: ColorVariant[];
}

/* ---------- Terminal color variants ---------- */
const TERMINAL_VARIANTS: ColorVariant[] = [
  {
    key: 'green',
    name: 'Matrix Green',
    colors: {
      primary: '#00ff41',
      primaryDim: '#00cc33',
      primaryRgb: '0, 255, 65',
      border: '#003300',
      text: '#00ff41',
      textDim: '#00aa2b',
    },
  },
  {
    key: 'blue',
    name: 'Cyber Blue',
    colors: {
      primary: '#00d9ff',
      primaryDim: '#00a8cc',
      primaryRgb: '0, 217, 255',
      border: '#002233',
      text: '#00d9ff',
      textDim: '#0099bb',
    },
  },
  {
    key: 'purple',
    name: 'Neon Purple',
    colors: {
      primary: '#a855f7',
      primaryDim: '#8b44cc',
      primaryRgb: '168, 85, 247',
      border: '#1a0033',
      text: '#a855f7',
      textDim: '#7c3aed',
    },
  },
  {
    key: 'amber',
    name: 'Retro Amber',
    colors: {
      primary: '#ffb000',
      primaryDim: '#cc8c00',
      primaryRgb: '255, 176, 0',
      border: '#332200',
      text: '#ffb000',
      textDim: '#cc8c00',
    },
  },
  {
    key: 'cyan',
    name: 'Tron Cyan',
    colors: {
      primary: '#22d3ee',
      primaryDim: '#1aa8bc',
      primaryRgb: '34, 211, 238',
      border: '#002233',
      text: '#22d3ee',
      textDim: '#0ea5c7',
    },
  },
  {
    key: 'rose',
    name: 'Hot Pink',
    colors: {
      primary: '#f472b6',
      primaryDim: '#c25a92',
      primaryRgb: '244, 114, 182',
      border: '#330022',
      text: '#f472b6',
      textDim: '#db2777',
    },
  },
];

/* ---------- Material color variants ---------- */
const MATERIAL_VARIANTS: ColorVariant[] = [
  {
    key: 'indigo',
    name: 'Indigo',
    colors: {
      primary: '#818cf8',
      primaryDim: '#6366f1',
      primaryRgb: '129, 140, 248',
      border: '#1e1b4b',
      text: '#c7d2fe',
      textDim: '#a5b4fc',
    },
  },
  {
    key: 'teal',
    name: 'Teal',
    colors: {
      primary: '#2dd4bf',
      primaryDim: '#14b8a6',
      primaryRgb: '45, 212, 191',
      border: '#042f2e',
      text: '#99f6e4',
      textDim: '#5eead4',
    },
  },
  {
    key: 'purple',
    name: 'Deep Purple',
    colors: {
      primary: '#a78bfa',
      primaryDim: '#8b5cf6',
      primaryRgb: '167, 139, 250',
      border: '#2e1065',
      text: '#ddd6fe',
      textDim: '#c4b5fd',
    },
  },
  {
    key: 'rose',
    name: 'Rose',
    colors: {
      primary: '#fb7185',
      primaryDim: '#f43f5e',
      primaryRgb: '251, 113, 133',
      border: '#4c0519',
      text: '#fecdd3',
      textDim: '#fda4af',
    },
  },
  {
    key: 'amber',
    name: 'Amber',
    colors: {
      primary: '#fbbf24',
      primaryDim: '#f59e0b',
      primaryRgb: '251, 191, 36',
      border: '#451a03',
      text: '#fde68a',
      textDim: '#fcd34d',
    },
  },
  {
    key: 'emerald',
    name: 'Emerald',
    colors: {
      primary: '#34d399',
      primaryDim: '#10b981',
      primaryRgb: '52, 211, 153',
      border: '#022c22',
      text: '#a7f3d0',
      textDim: '#6ee7b7',
    },
  },
];

/* ---------- Glass color variants ---------- */
const GLASS_VARIANTS: ColorVariant[] = [
  {
    key: 'frost',
    name: 'Frost Blue',
    colors: {
      primary: '#7dd3fc',
      primaryDim: '#38bdf8',
      primaryRgb: '125, 211, 252',
      border: 'rgba(125, 211, 252, 0.15)',
      text: '#e0f2fe',
      textDim: '#bae6fd',
    },
  },
  {
    key: 'lavender',
    name: 'Lavender',
    colors: {
      primary: '#c4b5fd',
      primaryDim: '#a78bfa',
      primaryRgb: '196, 181, 253',
      border: 'rgba(196, 181, 253, 0.15)',
      text: '#ede9fe',
      textDim: '#ddd6fe',
    },
  },
  {
    key: 'mint',
    name: 'Mint',
    colors: {
      primary: '#6ee7b7',
      primaryDim: '#34d399',
      primaryRgb: '110, 231, 183',
      border: 'rgba(110, 231, 183, 0.15)',
      text: '#d1fae5',
      textDim: '#a7f3d0',
    },
  },
  {
    key: 'coral',
    name: 'Coral',
    colors: {
      primary: '#fda4af',
      primaryDim: '#fb7185',
      primaryRgb: '253, 164, 175',
      border: 'rgba(253, 164, 175, 0.15)',
      text: '#ffe4e6',
      textDim: '#fecdd3',
    },
  },
  {
    key: 'gold',
    name: 'Gold',
    colors: {
      primary: '#fcd34d',
      primaryDim: '#fbbf24',
      primaryRgb: '252, 211, 77',
      border: 'rgba(252, 211, 77, 0.15)',
      text: '#fef9c3',
      textDim: '#fde68a',
    },
  },
  {
    key: 'violet',
    name: 'Violet',
    colors: {
      primary: '#f0abfc',
      primaryDim: '#e879f9',
      primaryRgb: '240, 171, 252',
      border: 'rgba(240, 171, 252, 0.15)',
      text: '#fae8ff',
      textDim: '#f5d0fe',
    },
  },
];

/* ---------- Minimal color variants ---------- */
const MINIMAL_VARIANTS: ColorVariant[] = [
  {
    key: 'slate',
    name: 'Slate',
    colors: {
      primary: '#94a3b8',
      primaryDim: '#64748b',
      primaryRgb: '148, 163, 184',
      border: '#1e293b',
      text: '#e2e8f0',
      textDim: '#cbd5e1',
    },
  },
  {
    key: 'blue',
    name: 'Blue',
    colors: {
      primary: '#60a5fa',
      primaryDim: '#3b82f6',
      primaryRgb: '96, 165, 250',
      border: '#1e3a5f',
      text: '#dbeafe',
      textDim: '#93c5fd',
    },
  },
  {
    key: 'violet',
    name: 'Violet',
    colors: {
      primary: '#a78bfa',
      primaryDim: '#8b5cf6',
      primaryRgb: '167, 139, 250',
      border: '#2e1065',
      text: '#ddd6fe',
      textDim: '#c4b5fd',
    },
  },
  {
    key: 'orange',
    name: 'Orange',
    colors: {
      primary: '#fb923c',
      primaryDim: '#f97316',
      primaryRgb: '251, 146, 60',
      border: '#431407',
      text: '#fed7aa',
      textDim: '#fdba74',
    },
  },
  {
    key: 'emerald',
    name: 'Emerald',
    colors: {
      primary: '#34d399',
      primaryDim: '#10b981',
      primaryRgb: '52, 211, 153',
      border: '#022c22',
      text: '#a7f3d0',
      textDim: '#6ee7b7',
    },
  },
  {
    key: 'rose',
    name: 'Rose',
    colors: {
      primary: '#fb7185',
      primaryDim: '#f43f5e',
      primaryRgb: '251, 113, 133',
      border: '#4c0519',
      text: '#fecdd3',
      textDim: '#fda4af',
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Grouped exports                                                    */
/* ------------------------------------------------------------------ */

export const STYLE_THEMES: Record<StyleId, StyleThemes> = {
  terminal: { styleId: 'terminal', defaultColorKey: 'green', variants: TERMINAL_VARIANTS },
  material: { styleId: 'material', defaultColorKey: 'indigo', variants: MATERIAL_VARIANTS },
  glass:    { styleId: 'glass',    defaultColorKey: 'frost',  variants: GLASS_VARIANTS },
  minimal:  { styleId: 'minimal',  defaultColorKey: 'slate',  variants: MINIMAL_VARIANTS },
};

/** Build a composite theme ID like "terminal-green" or "material-indigo" */
export function buildThemeId(styleId: StyleId, colorKey: string): string {
  return `${styleId}-${colorKey}`;
}

/** Parse a composite theme ID back to parts */
export function parseThemeId(themeId: string): { styleId: StyleId; colorKey: string } {
  const idx = themeId.indexOf('-');
  if (idx === -1) {
    // Legacy: bare color key means terminal style
    return { styleId: 'terminal', colorKey: themeId };
  }
  const styleId = themeId.slice(0, idx) as StyleId;
  const colorKey = themeId.slice(idx + 1);
  return { styleId, colorKey };
}

/** Get the ColorVariant for a given style + colorKey */
export function getColorVariant(styleId: StyleId, colorKey: string): ColorVariant | undefined {
  return STYLE_THEMES[styleId]?.variants.find((v) => v.key === colorKey);
}

/** Get all valid composite theme IDs */
export function getAllThemeIds(): string[] {
  return STYLE_IDS.flatMap((sid) =>
    STYLE_THEMES[sid].variants.map((v) => buildThemeId(sid, v.key))
  );
}

/* Legacy compat — keep old defaults working during migration */
export const DEFAULT_THEME_ID = buildThemeId(DEFAULT_STYLE_ID, STYLE_THEMES[DEFAULT_STYLE_ID].defaultColorKey);
