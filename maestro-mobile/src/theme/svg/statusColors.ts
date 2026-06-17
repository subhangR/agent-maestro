// status → theme-color-TOKEN map. Palette's StatusGlyph/StatusDot/Badge resolve
// the solid + soft fill from the active theme via these token names (never a
// parallel hex table). Knockout fills inside glyphs reference theme.colors.card/
// .surface directly (see paths.ts), never a css var.
import type { ColorToken } from '../tokens';

// TODO(atlas): replace with Lexicon's canonical status union exported from
// @/domain/derive once published (O-2). These 5 are the semantic STATUS COLORS;
// lifecycle kinds (working/in_review/completed/…) map onto them via Lexicon's
// toUiSessionStatus, which then keys this map.
export type StatusKey = 'run' | 'wait' | 'block' | 'info' | 'idle';

export interface StatusColorPair {
  /** solid token — the DOT/GLYPH stroke + fill (canonical hue, decorative) */
  solid: ColorToken;
  /** soft token — the translucent tag/chip background */
  soft: ColorToken;
  /** text token — AA-safe LABEL color (darkened in light theme; == solid in dark) */
  text: ColorToken;
}

// Palette: render status DOTS/GLYPHS with `solid`, status LABEL TEXT with `text`,
// tag/chip backgrounds with `soft`. (Atelier law: dot + word, AA-readable word.)
export const statusColorToken: Record<StatusKey, StatusColorPair> = {
  run: { solid: 'run', soft: 'runSoft', text: 'runText' },
  wait: { solid: 'wait', soft: 'waitSoft', text: 'waitText' },
  block: { solid: 'block', soft: 'blockSoft', text: 'blockText' },
  info: { solid: 'info', soft: 'infoSoft', text: 'infoText' },
  idle: { solid: 'idle', soft: 'idleSoft', text: 'idleText' },
};
