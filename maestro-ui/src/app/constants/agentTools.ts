import type { AgentTool, LaunchAccessMode, LaunchConfig, LaunchProvider, LaunchReasoningEffort, LaunchSpeed, ModelType } from "../types/maestro";

export type AgentToolOption = {
  id: AgentTool;
  provider: LaunchProvider;
  label: string;
  shortLabel: string;
  providerLabel: string;
  symbol: string;
  models: { value: ModelType; id: ModelType; label: string }[];
};

const withIds = (models: { value: ModelType; label: string }[]) =>
  models.map((model) => ({ ...model, id: model.value }));

export const MODELS_BY_AGENT_TOOL: Record<AgentTool, { value: ModelType; label: string }[]> = {
  "claude-code": [
    { value: "claude-fable-5", label: "Fable 5" },
    { value: "claude-fable-5[1m]", label: "Fable 5 1M" },
    { value: "claude-opus-5", label: "Opus 5" },
    { value: "claude-opus-5[1m]", label: "Opus 5 1M" },
    { value: "claude-opus-4-8", label: "Opus 4.8" },
    { value: "claude-opus-4-8[1m]", label: "Opus 4.8 1M" },
    { value: "claude-sonnet-5", label: "Sonnet 5" },
    { value: "claude-sonnet-5[1m]", label: "Sonnet 5 1M" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  ],
  codex: [
    { value: "gpt-5.6-sol", label: "5.6 Sol" },
    { value: "gpt-5.6-terra", label: "5.6 Terra" },
    { value: "gpt-5.6-luna", label: "5.6 Luna" },
  ],
  hermes: [
    { value: "hermes-default", label: "Hermes default" },
    { value: "anthropic:claude-opus-4-8", label: "Anthropic Claude Opus 4.8" },
    { value: "nous:anthropic/claude-opus-4.8", label: "Nous Claude Opus 4.8" },
    { value: "openrouter:anthropic/claude-opus-4.8", label: "OpenRouter Claude Opus 4.8" },
    { value: "openai/gpt-5.6-sol", label: "Codex OAuth 5.6 Sol" },
    { value: "openai/gpt-5.6-terra", label: "Codex OAuth 5.6 Terra" },
    { value: "openai/gpt-5.6-luna", label: "Codex OAuth 5.6 Luna" },
    { value: "anthropic/claude-sonnet-4.6", label: "Anthropic Claude Sonnet 4.6" },
  ],
  gemini: [
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
  ],
  kimi: [
    { value: "kimi-k2-0711-preview", label: "Kimi K2" },
  ],
  glm: [
    { value: "glm-4", label: "GLM-4" },
    { value: "glm-4-plus", label: "GLM-4 Plus" },
  ],
};

export const DEFAULT_MODEL_BY_AGENT_TOOL: Record<AgentTool, ModelType> = {
  "claude-code": "claude-opus-4-8",
  codex: "gpt-5.6-sol",
  hermes: "hermes-default",
  gemini: "gemini-3-pro-preview",
  kimi: "kimi-k2-0711-preview",
  glm: "glm-4",
};

// Retired model IDs mapped to active replacements. Currently empty — Claude
// Fable 5 is a live model again. Keep this map (and normalizeModelId) for
// future retirements. Keep in sync with maestro-server (types.ts) and
// maestro-cli (types/manifest.ts).
export const LEGACY_MODEL_ALIASES: Record<string, string> = {};

// Normalize a (possibly retired) model id to its active replacement.
export function normalizeModelId(model?: string): string | undefined {
  if (!model) return model;
  return LEGACY_MODEL_ALIASES[model] ?? model;
}

// Relative capability ranking used to pick the "top" team member when a task
// has several assigned. Must stay in sync with MODEL_POWER in
// maestro-server/src/api/sessionRoutes.ts so the badge mirrors what launches.
export const MODEL_POWER: Record<string, number> = {
  "claude-fable-5[1m]": 6.1,
  "claude-fable-5": 6.0,
  "claude-opus-5[1m]": 5.95,
  "claude-opus-5": 5.85,
  "claude-opus-4-8[1m]": 5.9,
  "claude-opus-4-8": 5.8,
  "gpt-5.6-sol": 5.6,
  "gpt-5.6-terra": 5.55,
  "gpt-5.5": 5.5,
  "gpt-5.6-luna": 5.45,
  "claude-opus-4-7[1m]": 5.2,
  "claude-opus-4-7": 5,
  "gpt-5.4": 4.7,
  "opus[1m]": 4.5,
  "gpt-5.3-codex": 4.2,
  opus: 4,
  "gpt-5.2-codex": 3.8,
  "claude-sonnet-5[1m]": 3.6,
  "claude-sonnet-5": 3.4,
  "sonnet[1m]": 3,
  "gpt-5.1-codex-max": 2.8,
  sonnet: 2.5,
  "gpt-5.1-codex": 2.3,
  "gpt-5-codex": 2,
  "gpt-5.1-codex-mini": 1.8,
  "gpt-5-codex-mini": 1.5,
  haiku: 1,
};

// Pick the most-powerful member by model rank, matching the server's resolution.
// Ties / unranked models fall back to assignment order (first wins).
export function pickTopMember<T extends { model?: string }>(members: T[]): T | undefined {
  let top: T | undefined;
  let topPower = -1;
  for (const member of members) {
    const power = member.model ? (MODEL_POWER[normalizeModelId(member.model)!] ?? 0) : -1;
    if (!top || power > topPower) {
      top = member;
      topPower = power;
    }
  }
  return top;
}

export const AGENT_TOOL_LABELS: Record<AgentTool, string> = {
  "claude-code": "Claude",
  codex: "OpenAI",
  hermes: "Hermes",
  gemini: "Gemini",
  kimi: "Kimi",
  glm: "GLM",
};

export const AGENT_TOOL_SHORT_LABELS: Record<AgentTool, string> = {
  "claude-code": "Claude",
  codex: "OpenAI",
  hermes: "Hermes",
  gemini: "Gemini",
  kimi: "Kimi",
  glm: "GLM",
};

export const AGENT_PROVIDER_LABELS: Record<AgentTool, string> = {
  "claude-code": "Claude",
  codex: "OpenAI",
  hermes: "Hermes",
  gemini: "Gemini",
  kimi: "Moonshot",
  glm: "Zhipu",
};

export const AGENT_TOOL_SYMBOLS: Record<AgentTool, string> = {
  "claude-code": "◈",
  codex: "◇",
  hermes: "✶",
  gemini: "◆",
  kimi: "☾",
  glm: "◑",
};

export const AGENT_TOOLS: AgentTool[] = ["claude-code", "codex", "hermes", "gemini", "kimi", "glm"];

/**
 * Agent tools whose sessions can be resumed. Resume replays the provider's
 * native session id — Claude via `claude --resume <MAESTRO_CLAUDE_SESSION_ID>`,
 * Codex via `codex resume <native-id>` (failing closed when the exact id cannot
 * be proven).
 * Gemini/Hermes have no proven native-id resume path yet, so resume is not
 * offered for them. The UI never assembles these commands itself; it only
 * decides whether to *offer* resume — the server emits the actual command.
 */
export const RESUMABLE_AGENT_TOOLS: readonly AgentTool[] = ["claude-code", "codex"];

/**
 * Single source of truth for every "Resume" affordance in the UI. A missing or
 * legacy `agentTool` defaults to `claude-code` (the original single-agent
 * behavior). Keep all resume buttons wired to this predicate so their gating can
 * never drift apart.
 */
export function isAgentToolResumable(agentTool?: string | null): boolean {
  return RESUMABLE_AGENT_TOOLS.includes((agentTool || "claude-code") as AgentTool);
}

export const AGENT_TOOL_TO_PROVIDER: Record<AgentTool, LaunchProvider> = {
  "claude-code": "claude",
  codex: "openai",
  hermes: "hermes",
  gemini: "gemini",
  kimi: "kimi",
  glm: "glm",
};

export const PROVIDER_TO_AGENT_TOOL: Record<LaunchProvider, AgentTool> = {
  claude: "claude-code",
  openai: "codex",
  hermes: "hermes",
  gemini: "gemini",
  kimi: "kimi",
  glm: "glm",
};

export const AGENT_TOOL_OPTIONS: AgentToolOption[] = AGENT_TOOLS.map((id) => ({
  id,
  provider: AGENT_TOOL_TO_PROVIDER[id],
  label: AGENT_TOOL_LABELS[id],
  shortLabel: AGENT_TOOL_SHORT_LABELS[id],
  providerLabel: AGENT_PROVIDER_LABELS[id],
  symbol: AGENT_TOOL_SYMBOLS[id],
  models: withIds(MODELS_BY_AGENT_TOOL[id]),
}));

export const REASONING_EFFORT_OPTIONS: Array<{ value: LaunchReasoningEffort; label: string }> = [
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];

const GPT_5_6_CODEX_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

export const CODEX_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.filter(
  (option) => option.value !== "minimal" && option.value !== "max",
);

export const ACCESS_MODE_OPTIONS: Array<{ value: LaunchAccessMode; label: string; description: string }> = [
  { value: "safe", label: "Safe", description: "Ask before risky actions" },
  { value: "acceptEdits", label: "Accept Edits", description: "Edit files without prompts" },
  { value: "plan", label: "Plan", description: "Read-only planning mode" },
  { value: "fullAccess", label: "Full Access", description: "Bypass prompts and sandbox" },
];

export const SPEED_OPTIONS: Array<{ value: LaunchSpeed; label: string; description: string }> = [
  { value: "standard", label: "Standard", description: "Default speed, normal usage" },
  { value: "fast", label: "Fast", description: "1.5x speed, increased usage" },
];

export function supportsMaxReasoning(provider: LaunchProvider, model?: string): boolean {
  if (provider === "claude") return true;
  if (provider === "openai") return GPT_5_6_CODEX_MODELS.includes(model || "");
  return false;
}

export function getReasoningOptionsForProvider(provider: LaunchProvider, model?: string): Array<{ value: LaunchReasoningEffort; label: string }> {
  if (provider === "claude") {
    return REASONING_EFFORT_OPTIONS.filter((option) => option.value !== "minimal");
  }
  if (provider === "openai") {
    return supportsMaxReasoning(provider, model)
      ? [...CODEX_REASONING_EFFORT_OPTIONS, REASONING_EFFORT_OPTIONS.find((option) => option.value === "max")!]
      : CODEX_REASONING_EFFORT_OPTIONS;
  }
  return [];
}

export function getReasoningValuesForProvider(provider: LaunchProvider, model?: string): LaunchReasoningEffort[] {
  return getReasoningOptionsForProvider(provider, model).map((option) => option.value);
}

export function supportsLaunchSpeed(provider: LaunchProvider, model?: string): boolean {
  if (provider === "openai") {
    return ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4"].includes(model || "");
  }
  return false;
}

export function accessModeFromPermissionMode(permissionMode?: string): LaunchConfig["accessMode"] | undefined {
  switch (permissionMode) {
    case "bypassPermissions":
      return "fullAccess";
    case "acceptEdits":
      return "acceptEdits";
    case "readOnly":
      return "plan";
    case "interactive":
      return "safe";
    default:
      return undefined;
  }
}

export function sanitizeLaunchConfig(config?: Partial<LaunchConfig> | null): LaunchConfig | undefined {
  if (!config?.provider || !config.model) return undefined;
  if (!["claude", "openai", "hermes", "gemini", "kimi", "glm"].includes(config.provider)) return undefined;

  const provider = config.provider as LaunchProvider;
  const model = normalizeModelId(config.model)!;
  const validReasoningValues = getReasoningValuesForProvider(provider, String(model));
  const reasoningEffort = config.reasoningEffort && validReasoningValues.includes(config.reasoningEffort)
    ? config.reasoningEffort
    : undefined;
  const speed = config.speed && supportsLaunchSpeed(provider, String(model))
    ? config.speed
    : undefined;
  const accessMode = config.accessMode && ["safe", "acceptEdits", "plan", "fullAccess"].includes(config.accessMode)
    ? config.accessMode
    : undefined;

  return {
    provider,
    model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(speed ? { speed } : {}),
    ...(accessMode ? { accessMode } : {}),
  };
}

const MODEL_LABEL_OVERRIDES: Record<string, string> = {
  "claude-fable-5": "Fable 5",
  "claude-fable-5[1m]": "Fable 5 1M",
  "claude-opus-5": "Opus 5",
  "claude-opus-5[1m]": "Opus 5 1M",
  "claude-opus-4-8": "Opus 4.8",
  "claude-opus-4-8[1m]": "Opus 4.8 1M",
  "claude-opus-4-7": "Opus 4.7",
  "claude-opus-4-7[1m]": "Opus 4.7 1M",
  "claude-sonnet-5": "Sonnet 5",
  "claude-sonnet-5[1m]": "Sonnet 5 1M",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-opus-4-6": "Opus 4.6 Legacy",
  "opus": "Opus",
  "opus[1m]": "Opus 1M",
  "sonnet": "Sonnet",
  "sonnet[1m]": "Sonnet 1M",
  "haiku": "Haiku",
  "gpt-5.6-sol": "Codex 5.6 Sol",
  "gpt-5.6-terra": "Codex 5.6 Terra",
  "gpt-5.6-luna": "Codex 5.6 Luna",
  "gpt-5.5": "Codex 5.5",
  "gpt-5.4": "Codex 5.4",
  "gpt-5.4-mini": "Codex 5.4 Mini",
  "gpt-5.3-codex": "Codex 5.3",
  "gpt-5.3-codex-spark": "Codex 5.3 Spark",
  "gpt-5.2": "Codex 5.2",
  "gpt-5.2-codex": "Codex 5.2",
  "anthropic:claude-opus-4-8": "Claude Opus 4.8",
  "nous:anthropic/claude-opus-4.8": "Claude Opus 4.8",
  "openrouter:anthropic/claude-opus-4.8": "Claude Opus 4.8",
  "anthropic/claude-opus-4.8": "Claude Opus 4.8",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3-pro-preview": "Gemini 3 Pro Preview",
};

export function getModelDisplayLabel(model?: string): string {
  if (!model) return "Default";
  const normalized = normalizeModelId(model)!;
  return MODEL_LABEL_OVERRIDES[normalized] || normalized;
}

export function formatProviderModelLabel(agentTool?: AgentTool, model?: string): string {
  if (!agentTool && !model) return "Default";
  const provider = agentTool ? AGENT_PROVIDER_LABELS[agentTool] : "Model";
  const label = getModelDisplayLabel(model);
  return `${provider}/${label}`;
}

export function createLaunchConfig(agentTool: AgentTool, model: ModelType | string, existing?: Partial<LaunchConfig>): LaunchConfig {
  return sanitizeLaunchConfig({
    ...existing,
    provider: AGENT_TOOL_TO_PROVIDER[agentTool],
    model,
  })!;
}

export function createLaunchConfigFromLegacy(
  agentTool?: AgentTool,
  model?: ModelType | string,
  reasoningEffort?: LaunchReasoningEffort,
  permissionMode?: string,
): LaunchConfig | undefined {
  // Coerce the legacy bare provider name 'claude' (used by some pre-PR#83 persisted
  // data) to the canonical 'claude-code' tool key so the override is not dropped.
  const rawTool = (agentTool as string) === "claude" ? "claude-code" : agentTool;
  const tool = rawTool || (model ? "claude-code" : undefined);
  if (!tool) return undefined;
  return sanitizeLaunchConfig({
    provider: AGENT_TOOL_TO_PROVIDER[tool],
    model: model || DEFAULT_MODEL_BY_AGENT_TOOL[tool],
    reasoningEffort,
    accessMode: accessModeFromPermissionMode(permissionMode),
  });
}

export function getAgentToolForLaunchConfig(config?: Pick<LaunchConfig, "provider">): AgentTool | undefined {
  return config ? PROVIDER_TO_AGENT_TOOL[config.provider] : undefined;
}

export function formatLaunchConfigLabel(config?: LaunchConfig): string {
  if (!config) return "Default";
  return formatProviderModelLabel(PROVIDER_TO_AGENT_TOOL[config.provider], config.model);
}
