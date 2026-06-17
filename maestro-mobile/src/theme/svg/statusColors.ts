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
  /** solid token — the dot/glyph stroke + label color */
  solid: ColorToken;
  /** soft token — the translucent tag/chip background */
  soft: ColorToken;
}

export const statusColorToken: Record<StatusKey, StatusColorPair> = {
  run: { solid: 'run', soft: 'runSoft' },
  wait: { solid: 'wait', soft: 'waitSoft' },
  block: { solid: 'block', soft: 'blockSoft' },
  info: { solid: 'info', soft: 'infoSoft' },
  idle: { solid: 'idle', soft: 'idleSoft' },
};
