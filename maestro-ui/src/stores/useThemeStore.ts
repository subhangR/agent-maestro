import { create } from 'zustand';
import { StyleId } from '../app/constants/themes';

/**
 * The swappable multi-theme system (Terminal / Material / Glass / Minimal × 6
 * colors) has been retired in favor of one confident identity: the graphite
 * "ink" canvas + a single amber "baton" accent, defined entirely in CSS
 * (styles-tokens.css). This store is now a thin compatibility shim that locks
 * the app to that single identity. It no longer writes per-variant color vars;
 * the CSS aliases own the palette.
 */

const LOCKED_STYLE_ID: StyleId = 'maestro' as StyleId;
const LOCKED_COLOR_KEY = 'baton';

interface ThemeState {
  styleId: StyleId;
  colorKey: string;
  /** No-ops — the identity is fixed. Kept for API compatibility. */
  setStyle: (id: StyleId) => void;
  setColor: (colorKey: string) => void;
  setStyleAndColor: (styleId: StyleId, colorKey: string) => void;
}

function applyToDom(): void {
  const el = document.documentElement;
  // A neutral, fixed value. Legacy `html[data-style="material|glass|minimal"]`
  // overrides never match, so the single graphite identity always renders.
  el.setAttribute('data-style', LOCKED_STYLE_ID);
  el.setAttribute('data-theme', LOCKED_STYLE_ID);
  // Clear any inline color vars a previous build may have written, so the CSS
  // token aliases (--theme-* → baton) win.
  for (const v of [
    '--theme-primary',
    '--theme-primary-dim',
    '--theme-primary-rgb',
    '--theme-border',
    '--theme-text',
    '--theme-text-dim',
  ]) {
    el.style.removeProperty(v);
  }
}

export const useThemeStore = create<ThemeState>(() => ({
  styleId: LOCKED_STYLE_ID,
  colorKey: LOCKED_COLOR_KEY,
  setStyle: applyToDom,
  setColor: applyToDom,
  setStyleAndColor: applyToDom,
}));

/** Initialize the locked identity on app startup. */
export function initTheme(): void {
  applyToDom();
}
