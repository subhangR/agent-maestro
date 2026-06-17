// Public sheets surface. Feature streams import ONLY from here:
//   import { sheets } from '@/../navigation/sheets'  →  sheets.open({ type: ... })
//
// `sheets` is the imperative, hook-free cross-stream action channel — callable
// from anywhere (event handlers, deep tiles, services) without prop-drilling or
// a React context. <SheetHost> renders whatever the store holds.
import { useSheetStore } from './useSheetStore';
import type { SheetIntent } from './types';

export const sheets = {
  /** Open a sheet (stacks above any already-open sheet). */
  open(intent: SheetIntent): void {
    useSheetStore.getState().open(intent);
  },
  /** Dismiss the top-most sheet. */
  dismiss(): void {
    useSheetStore.getState().pop();
  },
  /** Dismiss every open sheet. */
  dismissAll(): void {
    useSheetStore.getState().clear();
  },
  /** Number of currently-open sheets (0 when none). */
  get count(): number {
    return useSheetStore.getState().stack.length;
  },
};

// NOTE: SheetHost and SHEET_REGISTRY are deliberately NOT re-exported here.
// They transitively import the feature sheet bodies (registry.tsx → @/features/*),
// and feature screens import this barrel — re-exporting them would create a
// navigation⇄features import cycle. This barrel is a pure LEAF (only
// ./useSheetStore + ./types). The sole SheetHost consumer (app/_layout) imports
// it from the direct module './SheetHost'; SheetHost reads SHEET_REGISTRY from
// its sibling './registry'. app/ is never imported by features, so the
// SheetHost→registry→features edge stays strictly one-way.
export { useSheetStore } from './useSheetStore';
export type {
  SheetIntent,
  SheetType,
  SheetController,
  SheetBodyProps,
  PickerConfig,
  PickerOption,
  DocRef,
} from './types';
