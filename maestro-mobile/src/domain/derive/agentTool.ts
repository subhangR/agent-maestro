// Server AgentTool ↔ Atelier display-tool reconciliation.
// Server (4): claude-code | codex | hermes | gemini.
// Design (m-data.jsx session `kind`, 4): claude | codex | gemini | terminal.
// Mismatch on both ends — never persist a design string back to the server.
import type { AgentTool } from '../enums';

/** The design's tool/icon vocabulary (session tile `kind`). */
export type DisplayTool = 'claude' | 'codex' | 'gemini' | 'terminal';

/**
 * Map a server tool to the design icon slug. `hermes` has no design tile, so it
 * falls back to 'claude' (closest visual). Plain shell sessions (no agentTool)
 * are the design's 'terminal' — pass `undefined` to get it.
 */
export function toDisplayTool(tool: AgentTool | undefined | null): DisplayTool {
  switch (tool) {
    case 'claude-code':
      return 'claude';
    case 'codex':
      return 'codex';
    case 'gemini':
      return 'gemini';
    case 'hermes':
      return 'claude';
    default:
      return 'terminal';
  }
}

const DISPLAY_TOOL_LABEL: Record<DisplayTool, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  terminal: 'Terminal',
};

export function displayToolLabel(tool: AgentTool | undefined | null): string {
  return DISPLAY_TOOL_LABEL[toDisplayTool(tool)];
}
