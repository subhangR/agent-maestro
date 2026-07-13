// Server AgentMode → Atelier display label (design m-data.jsx MODES).
import type { AgentMode } from '../enums';
import { normalizeMode } from '../enums';

/** Design labels: Worker / Coordinator / Co-Worker / Co-Coordinator. */
export const MODE_DISPLAY_LABEL: Record<AgentMode, string> = {
  worker: 'Worker',
  coordinator: 'Coordinator',
  'coordinated-worker': 'Co-Worker',
  'coordinated-coordinator': 'Co-Coordinator',
};

/** Display label for any mode value (legacy aliases normalized first). */
export function modeDisplayLabel(mode: string): string {
  return MODE_DISPLAY_LABEL[normalizeMode(mode)];
}
