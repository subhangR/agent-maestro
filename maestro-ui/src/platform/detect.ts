// IS_TAURI is true when running inside the Tauri shell, false in a plain browser.
// VITE_APP_MODE=browser wins even when __TAURI_INTERNALS__ is present (dev/test override).
export const IS_TAURI: boolean =
  import.meta.env.VITE_APP_MODE !== 'browser' &&
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in window;

export function isTauri(): boolean {
  return IS_TAURI;
}
