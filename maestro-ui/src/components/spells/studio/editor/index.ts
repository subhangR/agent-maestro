/**
 * Spell Editor / Rule Builder (S3) — the centerpiece surface.
 *
 * Self-contained create/edit surface for a multi-rule spell. Mount from the
 * Studio shell (UI-A) and pass `onSave`/`onCancel`; all editor state is local.
 *
 *   import { SpellEditor } from '../spells/studio/editor';
 *   <SpellEditor mode="create" onSave={savePayload} onCancel={close} />
 */
export { SpellEditor, default } from './SpellEditor';
export type { SpellEditorProps } from './SpellEditor';

// Re-exported for hosts that want to reuse the editor's data helpers/labels.
export {
  ALL_HOOK_EVENTS,
  HOOK_EVENT_FIRES_WHEN,
  HOOK_EVENT_GOOD_FOR,
  ACTION_META,
  LOOP_TYPE_META,
  SPELL_COLOR_SWATCHES,
  SPELL_LIMITS,
} from './editorState';
