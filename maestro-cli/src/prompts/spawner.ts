/**
 * Spawner Prompts
 *
 * Prompt strings used by agent spawners (Claude, Codex, Gemini, Hermes)
 * for structuring the prompts sent to AI agents.
 */

// ── Gemini prompt structure ─────────────────────────────────

export const GEMINI_SYSTEM_INSTRUCTIONS_HEADER = '[SYSTEM INSTRUCTIONS]';
export const GEMINI_TASK_HEADER = '[TASK]';

/**
 * Build the structured prompt for Gemini (which doesn't support a separate system prompt).
 */
export function buildGeminiStructuredPrompt(systemPrompt: string, taskContext: string): string {
  return `${GEMINI_SYSTEM_INSTRUCTIONS_HEADER}\n${systemPrompt}\n\n${GEMINI_TASK_HEADER}\n${taskContext}`;
}

// ── Agent tool display names ────────────────────────────────

export const AGENT_TOOL_DISPLAY_NAMES: Record<string, string> = {
  'codex': 'OpenAI Codex',
  'hermes': 'Hermes',
  'gemini': 'Google Gemini',
  'claude-code': 'Claude Code',
  'kimi': 'Kimi (Moonshot)',
  'glm': 'GLM (Zhipu)',
};

// ── Stdin warning ───────────────────────────────────────────

export const STDIN_UNAVAILABLE_WARNING =
  'Cannot send input: stdin is not available (using inherit mode) or process has ended';
