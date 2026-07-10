import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOL_OPTIONS,
  AGENT_TOOL_LABELS,
  ACCESS_MODE_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  DEFAULT_MODEL_BY_AGENT_TOOL,
  createLaunchConfigFromLegacy,
  formatProviderModelLabel,
  getModelDisplayLabel,
  getReasoningOptionsForProvider,
  MODEL_POWER,
  MODELS_BY_AGENT_TOOL,
  normalizeModelId,
  pickTopMember,
  sanitizeLaunchConfig,
  supportsLaunchSpeed,
} from '../app/constants/agentTools';
import { DEFAULT_AGENT_SHORTCUT_IDS } from '../app/constants/defaults';

describe('agent tool UI constants', () => {
  const claudeModels = MODELS_BY_AGENT_TOOL['claude-code'].map((model) => model.value);
  const codexModels = MODELS_BY_AGENT_TOOL.codex.map((model) => model.value);
  const claudeReasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max'];
  const codexReasoningEfforts = ['low', 'medium', 'high', 'xhigh'];
  const codexMaxReasoningModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
  const fastCodexModels = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4'];

  it('exposes Hermes beside Claude and Codex in user-facing pickers', () => {
    expect(AGENT_TOOL_OPTIONS.map((tool) => tool.id)).toEqual(
      expect.arrayContaining(['claude-code', 'codex', 'hermes']),
    );
    expect(AGENT_TOOL_LABELS.hermes).toBe('Hermes');
  });

  it('provides a default Hermes model and selectable model list', () => {
    expect(DEFAULT_MODEL_BY_AGENT_TOOL.hermes).toBe('hermes-default');
    expect(MODELS_BY_AGENT_TOOL.hermes).toContainEqual({
      value: 'hermes-default',
      label: 'Hermes default',
    });
    expect(MODELS_BY_AGENT_TOOL.hermes).toContainEqual({
      value: 'anthropic:claude-opus-4-8',
      label: 'Anthropic Claude Opus 4.8',
    });
    expect(MODELS_BY_AGENT_TOOL.hermes).toContainEqual({
      value: 'nous:anthropic/claude-opus-4.8',
      label: 'Nous Claude Opus 4.8',
    });
    expect(MODELS_BY_AGENT_TOOL.hermes).toContainEqual({
      value: 'openrouter:anthropic/claude-opus-4.8',
      label: 'OpenRouter Claude Opus 4.8',
    });
    expect(MODELS_BY_AGENT_TOOL.hermes).toContainEqual({
      value: 'openai/gpt-5.5',
      label: 'Codex OAuth GPT 5.5',
    });
    expect(MODELS_BY_AGENT_TOOL.hermes).toContainEqual({
      value: 'openai/gpt-5.6-sol',
      label: 'Codex OAuth 5.6 Sol',
    });
  });

  it('pins Hermes in the default quick-launch shortcuts', () => {
    expect(DEFAULT_AGENT_SHORTCUT_IDS).toEqual(
      expect.arrayContaining(['codex', 'claude', 'hermes', 'gemini']),
    );
  });

  it('exposes OpenAI reasoning effort options for Codex launches', () => {
    expect(CODEX_REASONING_EFFORT_OPTIONS.map((item) => item.value)).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('exposes canonical launch access modes for task UIs', () => {
    expect(ACCESS_MODE_OPTIONS.map((item) => item.value)).toEqual([
      'safe',
      'acceptEdits',
      'plan',
      'fullAccess',
    ]);
  });

  it('matches Claude CLI effort support and excludes speed', () => {
    expect(DEFAULT_MODEL_BY_AGENT_TOOL['claude-code']).toBe('claude-opus-4-8');
    expect(MODELS_BY_AGENT_TOOL['claude-code'][0]).toEqual({
      value: 'claude-fable-5',
      label: 'Fable 5',
    });
    expect(getReasoningOptionsForProvider('claude').map((item) => item.value)).toEqual(claudeReasoningEfforts);

    for (const model of claudeModels) {
      expect(supportsLaunchSpeed('claude', model)).toBe(false);
      for (const effort of claudeReasoningEfforts) {
        expect(sanitizeLaunchConfig({
          provider: 'claude',
          model,
          reasoningEffort: effort as any,
          speed: 'fast',
          accessMode: 'fullAccess',
        })).toEqual({
          provider: 'claude',
          model,
          reasoningEffort: effort,
          accessMode: 'fullAccess',
        });
      }
    }

    expect(sanitizeLaunchConfig({
      provider: 'claude',
      model: 'claude-opus-4-8',
      reasoningEffort: 'minimal' as any,
    })).toEqual({
      provider: 'claude',
      model: 'claude-opus-4-8',
    });
  });

  it('matches Codex CLI reasoning and speed-tier support', () => {
    expect(getReasoningOptionsForProvider('openai').map((item) => item.value)).toEqual(codexReasoningEfforts);
    expect(getReasoningOptionsForProvider('openai', 'gpt-5.6-sol').map((item) => item.value)).toEqual([
      ...codexReasoningEfforts,
      'max',
    ]);

    for (const model of codexModels) {
      const effortsForModel = codexMaxReasoningModels.includes(model)
        ? [...codexReasoningEfforts, 'max']
        : codexReasoningEfforts;
      for (const effort of effortsForModel) {
        const sanitized = sanitizeLaunchConfig({
          provider: 'openai',
          model,
          reasoningEffort: effort as any,
          speed: 'fast',
          accessMode: 'acceptEdits',
        });
        expect(sanitized).toEqual({
          provider: 'openai',
          model,
          reasoningEffort: effort,
          ...(fastCodexModels.includes(model) ? { speed: 'fast' } : {}),
          accessMode: 'acceptEdits',
        });
      }
    }

    expect(sanitizeLaunchConfig({
      provider: 'openai',
      model: 'gpt-5.5',
      reasoningEffort: 'max',
    })).toEqual({
      provider: 'openai',
      model: 'gpt-5.5',
    });

    expect(sanitizeLaunchConfig({
      provider: 'openai',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'max',
      speed: 'fast',
    })).toEqual({
      provider: 'openai',
      model: 'gpt-5.6-sol',
      reasoningEffort: 'max',
      speed: 'fast',
    });
  });

  it('formats task launch badges as Provider/Model', () => {
    expect(formatProviderModelLabel('claude-code', 'claude-opus-4-8')).toBe('Claude/Opus 4.8');
    expect(formatProviderModelLabel('claude-code', 'claude-opus-4-7')).toBe('Claude/Opus 4.7');
    expect(formatProviderModelLabel('hermes', 'anthropic:claude-opus-4-8')).toBe('Hermes/Claude Opus 4.8');
    expect(formatProviderModelLabel('codex', 'gpt-5.5')).toBe('OpenAI/Codex 5.5');
    expect(formatProviderModelLabel('codex', 'gpt-5.6-sol')).toBe('OpenAI/Codex 5.6 Sol');
  });

  it('limits speed to supported OpenAI Codex models', () => {
    expect(supportsLaunchSpeed('claude', 'claude-opus-4-8')).toBe(false);
    expect(supportsLaunchSpeed('claude', 'claude-opus-4-7')).toBe(false);
    expect(supportsLaunchSpeed('hermes', 'anthropic:claude-opus-4-8')).toBe(false);
    expect(supportsLaunchSpeed('openai', 'gpt-5.6-sol')).toBe(true);
    expect(supportsLaunchSpeed('openai', 'gpt-5.6-terra')).toBe(true);
    expect(supportsLaunchSpeed('openai', 'gpt-5.6-luna')).toBe(true);
    expect(supportsLaunchSpeed('openai', 'gpt-5.5')).toBe(true);
    expect(supportsLaunchSpeed('openai', 'gpt-5.4-mini')).toBe(false);
  });

  it('sanitizes provider-specific launch settings', () => {
    expect(sanitizeLaunchConfig({
      provider: 'claude',
      model: 'claude-opus-4-8',
      reasoningEffort: 'max',
      speed: 'fast',
    })).toEqual({
      provider: 'claude',
      model: 'claude-opus-4-8',
      reasoningEffort: 'max',
    });

    expect(sanitizeLaunchConfig({
      provider: 'hermes',
      model: 'anthropic:claude-opus-4-8',
      reasoningEffort: 'high',
      speed: 'fast',
    })).toEqual({
      provider: 'hermes',
      model: 'anthropic:claude-opus-4-8',
    });

    expect(sanitizeLaunchConfig({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      reasoningEffort: 'high',
      speed: 'fast',
    })).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
    });
  });

  it('normalizes legacy team-member launch fields without requiring a new storage shape', () => {
    expect(createLaunchConfigFromLegacy('claude-code', 'sonnet', undefined, 'acceptEdits')).toEqual({
      provider: 'claude',
      model: 'sonnet',
      accessMode: 'acceptEdits',
    });

    expect(createLaunchConfigFromLegacy('codex', 'gpt-5.2-codex', 'high', 'bypassPermissions')).toEqual({
      provider: 'openai',
      model: 'gpt-5.2-codex',
      reasoningEffort: 'high',
      accessMode: 'fullAccess',
    });

    expect(createLaunchConfigFromLegacy(undefined, 'opus', undefined, undefined)).toEqual({
      provider: 'claude',
      model: 'opus',
    });
  });

  it('keeps legacy model names supported without showing alias choices in pickers', () => {
    expect(MODELS_BY_AGENT_TOOL['claude-code'].map((model) => model.value)).not.toEqual(
      expect.arrayContaining(['sonnet', 'sonnet[1m]', 'opus', 'opus[1m]', 'haiku']),
    );
    expect(MODELS_BY_AGENT_TOOL.codex.map((model) => model.value)).not.toContain('gpt-5.2-codex');

    expect(getModelDisplayLabel('sonnet')).toBe('Sonnet');
    expect(getModelDisplayLabel('opus[1m]')).toBe('Opus 1M');
    expect(getModelDisplayLabel('gpt-5.2-codex')).toBe('Codex 5.2');
  });

  it('offers live Claude Fable 5 and Sonnet 5 and tops the Claude list with Fable 5', () => {
    const claudeValues = MODELS_BY_AGENT_TOOL['claude-code'].map((model) => model.value);
    expect(claudeValues).toContain('claude-fable-5');
    expect(claudeValues).toContain('claude-sonnet-5');
    expect(claudeValues[0]).toBe('claude-fable-5');
    expect(MODEL_POWER['claude-fable-5']).toBe(6.0);
    expect(MODEL_POWER['claude-fable-5[1m]']).toBe(6.1);
    expect(MODEL_POWER['gpt-5.6-sol']).toBe(5.6);
    expect(MODEL_POWER['gpt-5.6-terra']).toBe(5.55);
    expect(MODEL_POWER['gpt-5.6-luna']).toBe(5.45);
  });

  it('passes live Fable 5 and Sonnet 5 model ids through normalizeModelId unchanged', () => {
    // Both are live models again — no alias remapping.
    expect(normalizeModelId('claude-fable-5')).toBe('claude-fable-5');
    expect(normalizeModelId('claude-sonnet-5')).toBe('claude-sonnet-5');
    // Non-aliased ids pass through unchanged.
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(normalizeModelId(undefined)).toBeUndefined();
  });

  it('labels, launches, and ranks live Fable 5 and Sonnet 5 as themselves', () => {
    expect(getModelDisplayLabel('claude-fable-5')).toBe('Fable 5');
    expect(getModelDisplayLabel('claude-sonnet-5')).toBe('Sonnet 5');
    expect(sanitizeLaunchConfig({ provider: 'claude', model: 'claude-fable-5' })).toEqual({
      provider: 'claude',
      model: 'claude-fable-5',
    });
    // Fable 5 (6.0) outranks Opus 4.8 (5.8).
    const members = [{ model: 'claude-fable-5' }, { model: 'claude-opus-4-8' }];
    expect(pickTopMember(members)?.model).toBe('claude-fable-5');
  });
});
