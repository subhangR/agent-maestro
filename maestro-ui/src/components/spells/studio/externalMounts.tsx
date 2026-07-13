/* ==========================================================================
   externalMounts — cross-track import bridge (Track UI-A owns this file)

   FINAL INTEGRATION (tracks B + C landed): this module now re-exports the REAL
   components authored by Track UI-B (the editor) and Track UI-C (active /
   spellbook / ensemble / observability / task-assignment). The earlier local
   stubs have been removed. UI-A surfaces import these through this single hub so
   there is one swap point for the whole cross-track boundary.
   ========================================================================== */

// ── UI-B: Spell editor (S3) ──────────────────────────────────────────────────
export { SpellEditor } from './editor';
export type { SpellEditorProps } from './editor';

// ── UI-C: active-on-session (S5) + ring hook ─────────────────────────────────
export { ActiveSpellsOnSession, useActiveSpellRingAttrs } from './active';
export type { ActiveSpellsOnSessionProps } from './active';

// ── UI-C: spellbook drawer (S6) ──────────────────────────────────────────────
export { SpellbookDrawer } from './spellbook';
export type { SpellbookDrawerProps } from './spellbook';

// ── UI-C: ensembles (S9) ─────────────────────────────────────────────────────
export { EnsembleSurface, EnsembleList } from './ensemble';
export type { EnsembleSurfaceProps, EnsembleListProps } from './ensemble';

// ── UI-C: observability / activity feed (S8) ─────────────────────────────────
export { SpellActivityFeed } from './observability';
export type { SpellActivityFeedProps } from './observability';

// ── UI-C: task ↔ spell assignment (S7) ───────────────────────────────────────
export { TaskSpellAssignment } from './taskspell';
export type { TaskSpellAssignmentProps } from './taskspell';
