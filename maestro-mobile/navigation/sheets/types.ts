// ─────────────────────────────────────────────────────────────────────────
// SheetIntent — the cross-stream action contract (Compass owns; Palette/Forge
// consume). This discriminated union is the ONLY channel through which one
// feature stream triggers another stream's action. A deep tile in Stream A
// (a task row) opens a Stream-B sheet (spawn) by calling `sheets.open({...})`
// — never by importing the other stream's component.
//
// Stability rule: adding a NEW `type` member is backward-compatible; changing
// an existing member's params is a breaking contract change — coordinate with
// Palette (bodies) + Forge (call sites) first.
// ─────────────────────────────────────────────────────────────────────────
import type { IconName } from '@/theme';

// Entity ids are plain strings across the domain — intent params take `string`
// so feature streams pass `task.id` / `member.id` directly with no casting.

/** A reference to a viewable document/diagram. Refine with Forge/whiteboard. */
export interface DocRef {
  /** Entity the doc hangs off (server stores docs under sessions/tasks/projects). */
  scope: 'session' | 'task' | 'project';
  ownerId: string;
  /** Specific doc id; omit to open the owner's doc list. */
  docId?: string;
}

/** One selectable row in the universal PickerSheet. */
export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
  iconName?: IconName;
  /** Free-form swatch/colour token for status/model rows; Palette styles it. */
  tone?: string;
  disabled?: boolean;
}

/**
 * The universal dropdown replacement. Every desktop `<select>` becomes a
 * PickerSheet opened via `sheets.open({ type: 'picker', config })`. Heavily
 * reused (priority, model, agent, mode, permissions, assignees) so the shape is
 * frozen early. The callback model keeps it imperative — pickers are actions,
 * not deep-linked routes, so passing `onSubmit` through the intent is safe.
 */
export interface PickerConfig {
  title: string;
  options: PickerOption[];
  /** Currently-selected ids (single → length 0/1; multi → 0..n). */
  selectedIds: string[];
  /** Multi-select when true; single-select (auto-dismiss on pick) otherwise. */
  multi?: boolean;
  /** Show a search/filter field above the rows. */
  searchable?: boolean;
  /** Called with the final selection. Compass dismisses the picker after. */
  onSubmit: (selectedIds: string[]) => void;
}

/**
 * Every sheet the app can open. `command` is the Conduct hub (straddles both
 * streams — its body lives in `features/conduct/`, owned by Stream B).
 */
export type SheetIntent =
  // Conduct hub — spawn / new task / new member / cast spell launcher.
  | { type: 'command' }
  // Project switcher (action, not a route; deep links redirect through here).
  | { type: 'project' }
  // Create or edit a task. `taskId` set → edit; `parentId` set → new subtask.
  | { type: 'createTask'; taskId?: string; parentId?: string; projectId?: string }
  // New / edit team member. `memberId` set → edit.
  | { type: 'editMember'; memberId?: string; projectId?: string }
  // Spawn/run configuration for a task (model, agent, mode, permissions).
  | { type: 'runConfig'; taskId: string; sessionId?: string }
  // Universal single/multi picker (stackable over a form sheet — the `raise` case).
  | { type: 'picker'; config: PickerConfig }
  // Single document viewer (markdown).
  | { type: 'doc'; docRef: DocRef }
  // Single diagram / Excalidraw scene viewer.
  | { type: 'diagram'; docRef: DocRef }
  // The docs browser (markdown | diagram tabs).
  | { type: 'docs'; kind?: 'markdown' | 'diagram' };

/** Discriminant union of every sheet `type`. */
export type SheetType = SheetIntent['type'];

/**
 * The imperative handle Compass passes into every sheet body. Bodies call
 * `sheet.dismiss()` to close themselves and `sheet.open(intent)` to stack a
 * child sheet (e.g. a form opening a picker). They never touch the store.
 */
export interface SheetController {
  /** Open another sheet, stacked above this one. */
  open: (intent: SheetIntent) => void;
  /** Dismiss this sheet (pops the top of the stack). */
  dismiss: () => void;
  /** Dismiss every open sheet. */
  dismissAll: () => void;
}

/** Props every registered sheet body receives. Palette authors the bodies. */
export interface SheetBodyProps<I extends SheetIntent = SheetIntent> {
  intent: I;
  sheet: SheetController;
}
