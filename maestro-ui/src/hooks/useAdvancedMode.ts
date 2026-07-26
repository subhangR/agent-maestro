import { useUIStore } from '../stores/useUIStore';

/**
 * Advanced (developer) mode gate.
 *
 * Power features — git config, terminal ANSI studio, file explorer + code
 * editor, spell rule-editor, gateway ops, SSH — are hidden by default and
 * revealed only when the user turns on "Show developer features". Use this hook
 * to conditionally render those surfaces:
 *
 *   const advanced = useAdvancedMode();
 *   if (!advanced) return null;
 */
export function useAdvancedMode(): boolean {
  return useUIStore((s) => s.advancedMode);
}
