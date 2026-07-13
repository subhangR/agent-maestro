// Maps a drawn GlyphKind to its semantic StatusKey (the Atelier `.m-stat--*`
// color buckets). Glyphs/dots render in the StatusKey's `solid` token; labels in
// its AA-safe `text` token (see @/theme statusColorToken). Single source so
// StatusGlyph, StatusDot and Badge can't drift.
import type { GlyphKind, StatusKey } from '@/theme';

export const GLYPH_STATUS_KEY: Record<GlyphKind, StatusKey> = {
  todo: 'idle',
  idle: 'idle',
  cancelled: 'idle',
  archived: 'idle',
  stopped: 'idle',
  in_progress: 'run',
  working: 'run',
  completed: 'run',
  in_review: 'info',
  spawning: 'info',
  blocked: 'block',
  failed: 'block',
  needsInput: 'wait',
};
