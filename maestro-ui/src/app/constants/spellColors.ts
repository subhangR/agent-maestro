/**
 * Spell color palette — the canonical 10-entry IDENTITY palette for spell rings.
 *
 * Source: docs/spell-system-design/uispec/01-design-system.md §1.2 (frozen).
 *
 * NOTE: This palette is the UI-side rendering surface. The server persists a
 * different (smaller) slug set on each `Spell.color` (see
 * maestro-server/src/types.ts → SPELL_COLORS). `SERVER_SLUG_TO_UI_ID` maps
 * the server slug onto a canonical UI palette id so ring rendering doesn't
 * depend on the in-flight reconciliation between the two enums.
 */

export type SpellColorId =
  | 'brass'
  | 'vermilion'
  | 'moss'
  | 'lapis'
  | 'amber'
  | 'aubergine'
  | 'teal'
  | 'clay'
  | 'slate'
  | 'plum';

export interface SpellColorScheme {
  primary: string;
  primaryRgb: string;
  dim: string;
  border: string;
  text: string;
}

export interface SpellColor {
  id: SpellColorId;
  label: string;
  light: SpellColorScheme;
  dark: SpellColorScheme;
}

export const SPELL_COLORS: ReadonlyArray<SpellColor> = [
  {
    id: 'brass', label: 'Brass',
    light: { primary: '#B26A2B', primaryRgb: '178, 106, 43',  dim: 'rgba(178,106,43,0.12)',  border: 'rgba(178,106,43,0.42)',  text: '#8A4F1E' },
    dark:  { primary: '#E0A45A', primaryRgb: '224, 164, 90',  dim: 'rgba(224,164,90,0.16)',  border: 'rgba(224,164,90,0.46)',  text: '#E8B574' },
  },
  {
    id: 'vermilion', label: 'Vermilion',
    light: { primary: '#B14538', primaryRgb: '177, 69, 56',   dim: 'rgba(177,69,56,0.12)',   border: 'rgba(177,69,56,0.42)',   text: '#962F23' },
    dark:  { primary: '#DA7D6A', primaryRgb: '218, 125, 106', dim: 'rgba(218,125,106,0.17)', border: 'rgba(218,125,106,0.46)', text: '#E59785' },
  },
  {
    id: 'moss', label: 'Moss',
    light: { primary: '#3E8E5A', primaryRgb: '62, 142, 90',   dim: 'rgba(62,142,90,0.12)',   border: 'rgba(62,142,90,0.42)',   text: '#2B6A41' },
    dark:  { primary: '#7BC097', primaryRgb: '123, 192, 151', dim: 'rgba(123,192,151,0.16)', border: 'rgba(123,192,151,0.46)', text: '#94CFAA' },
  },
  {
    id: 'lapis', label: 'Lapis',
    light: { primary: '#3F6C90', primaryRgb: '63, 108, 144',  dim: 'rgba(63,108,144,0.12)',  border: 'rgba(63,108,144,0.42)',  text: '#2E5478' },
    dark:  { primary: '#6F9FC7', primaryRgb: '111, 159, 199', dim: 'rgba(111,159,199,0.17)', border: 'rgba(111,159,199,0.46)', text: '#8FB7D7' },
  },
  {
    id: 'amber', label: 'Amber',
    light: { primary: '#A07410', primaryRgb: '160, 116, 16',  dim: 'rgba(160,116,16,0.12)',  border: 'rgba(160,116,16,0.42)',  text: '#7E5A06' },
    dark:  { primary: '#D9AA49', primaryRgb: '217, 170, 73',  dim: 'rgba(217,170,73,0.18)',  border: 'rgba(217,170,73,0.46)',  text: '#E4BC68' },
  },
  {
    id: 'aubergine', label: 'Aubergine',
    light: { primary: '#6E3F7A', primaryRgb: '110, 63, 122',  dim: 'rgba(110,63,122,0.12)',  border: 'rgba(110,63,122,0.42)',  text: '#562F61' },
    dark:  { primary: '#B589C2', primaryRgb: '181, 137, 194', dim: 'rgba(181,137,194,0.16)', border: 'rgba(181,137,194,0.46)', text: '#C7A1D2' },
  },
  {
    id: 'teal', label: 'Teal',
    light: { primary: '#1F7A75', primaryRgb: '31, 122, 117',  dim: 'rgba(31,122,117,0.12)',  border: 'rgba(31,122,117,0.42)',  text: '#155954' },
    dark:  { primary: '#5CB3AC', primaryRgb: '92, 179, 172',  dim: 'rgba(92,179,172,0.16)',  border: 'rgba(92,179,172,0.46)',  text: '#7DC4BD' },
  },
  {
    id: 'clay', label: 'Clay',
    light: { primary: '#9A4E2A', primaryRgb: '154, 78, 42',   dim: 'rgba(154,78,42,0.12)',   border: 'rgba(154,78,42,0.42)',   text: '#79361A' },
    dark:  { primary: '#D08966', primaryRgb: '208, 137, 102', dim: 'rgba(208,137,102,0.16)', border: 'rgba(208,137,102,0.46)', text: '#DDA081' },
  },
  {
    id: 'slate', label: 'Slate',
    light: { primary: '#4F5360', primaryRgb: '79, 83, 96',    dim: 'rgba(79,83,96,0.12)',    border: 'rgba(79,83,96,0.42)',    text: '#3A3D48' },
    dark:  { primary: '#9CA1B0', primaryRgb: '156, 161, 176', dim: 'rgba(156,161,176,0.15)', border: 'rgba(156,161,176,0.46)', text: '#BBC0CE' },
  },
  {
    id: 'plum', label: 'Plum',
    light: { primary: '#7F2D52', primaryRgb: '127, 45, 82',   dim: 'rgba(127,45,82,0.12)',   border: 'rgba(127,45,82,0.42)',   text: '#621F3F' },
    dark:  { primary: '#C77BA0', primaryRgb: '199, 123, 160', dim: 'rgba(199,123,160,0.16)', border: 'rgba(199,123,160,0.46)', text: '#D595B5' },
  },
];

const SPELL_COLOR_IDS = SPELL_COLORS.map(c => c.id) as ReadonlyArray<SpellColorId>;

export function isSpellColorId(value: unknown): value is SpellColorId {
  return typeof value === 'string' && (SPELL_COLOR_IDS as ReadonlyArray<string>).includes(value);
}

/**
 * The server persists a smaller slug set on Spell.color (amber/rose/violet/...).
 * Map each onto a canonical UI palette id so ring rendering doesn't depend
 * on the in-flight reconciliation between the two enums. Any unrecognised
 * slug falls back to `brass` (the user-default identity).
 *
 * Keep in sync with maestro-server/src/types.ts → SPELL_COLORS.
 */
const SERVER_SLUG_TO_UI_ID: Record<string, SpellColorId> = {
  amber:   'amber',
  rose:    'vermilion',
  violet:  'aubergine',
  sky:     'lapis',
  emerald: 'moss',
  fuchsia: 'plum',
  lime:    'moss',
  cyan:    'teal',
  indigo:  'lapis',
  // UI ids accepted verbatim too — covers spells already authored against the
  // UI palette and any future migration path.
  brass:     'brass',
  vermilion: 'vermilion',
  moss:      'moss',
  lapis:     'lapis',
  aubergine: 'aubergine',
  teal:      'teal',
  clay:      'clay',
  slate:     'slate',
  plum:      'plum',
};

export function resolveSpellColorId(serverSlug: string | undefined | null): SpellColorId {
  if (!serverSlug) return 'brass';
  return SERVER_SLUG_TO_UI_ID[serverSlug] ?? 'brass';
}
