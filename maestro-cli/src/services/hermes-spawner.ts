import { randomBytes } from 'crypto';
import type { MaestroManifest } from '../types/manifest.js';
import type { SpawnResult, SpawnOptions } from './claude-spawner.js';
import { prepareSpawnerEnvironment } from './spawner-env.js';
import { PromptComposer, type PromptEnvelope } from '../prompting/prompt-composer.js';
import { spawnWithUlimit } from './spawn-with-ulimit.js';

const HERMES_DEFAULT_MODEL = 'hermes-default';

type HermesModelOverride = {
  provider?: string;
  model?: string;
};

/**
 * HermesSpawner - Spawns Nous Hermes Agent CLI sessions with manifests.
 *
 * Classic Hermes uses `--query` as a single-query non-interactive mode. The
 * Hermes TUI supports startup queries, so interactive Maestro task sessions
 * use `hermes chat --tui --query <task>`: the task is visible as the first user
 * message and the chat remains interactive afterward.
 */
export class HermesSpawner {
  private promptComposer: PromptComposer;

  constructor() {
    this.promptComposer = new PromptComposer();
  }

  prepareEnvironment(
    manifest: MaestroManifest,
    sessionId: string
  ): Record<string, string> {
    return prepareSpawnerEnvironment(manifest, sessionId);
  }

  static readonly MODELS = [
    HERMES_DEFAULT_MODEL,
    'anthropic:claude-fable-5',
    'anthropic/claude-fable-5',
    'claude-fable-5',
    'anthropic:claude-opus-4-8',
    'nous:anthropic/claude-opus-4.8',
    'openrouter:anthropic/claude-opus-4.8',
    'anthropic/claude-opus-4.8',
    'claude-opus-4-8',
    'anthropic/claude-sonnet-4.6',
    'openai/gpt-5.5',
    'openai/gpt-5.4',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    'gpt-5.4',
  ] as const;

  private shouldUseYolo(permissionMode: string): boolean {
    return permissionMode === 'acceptEdits' || permissionMode === 'bypassPermissions';
  }

  buildHermesPrompt(systemPrompt: string, taskContext: string): string {
    return `[SYSTEM INSTRUCTIONS]\n${systemPrompt}\n\n[TASK]\n${taskContext}`;
  }

  resolveModelOverride(model?: string): HermesModelOverride {
    if (!model || model === HERMES_DEFAULT_MODEL) {
      return {};
    }

    const explicitProviderSeparator = model.indexOf(':');
    if (explicitProviderSeparator > 0) {
      const provider = model.slice(0, explicitProviderSeparator);
      const modelName = model.slice(explicitProviderSeparator + 1);
      if (provider && modelName) {
        return { provider, model: modelName };
      }
    }

    if (model.startsWith('openai/')) {
      return {
        provider: 'openai-codex',
        model: model.split('/', 2)[1],
      };
    }

    if (model.startsWith('gpt-')) {
      return {
        provider: 'openai-codex',
        model,
      };
    }

    if (model.startsWith('anthropic/')) {
      return {
        provider: 'anthropic',
        model: model.split('/', 2)[1],
      };
    }

    if (model.startsWith('claude-')) {
      return {
        provider: 'anthropic',
        model,
      };
    }

    return { model };
  }

  buildHermesBaseArgs(manifest: MaestroManifest): string[] {
    const args: string[] = ['chat'];
    const launchConfig = manifest.session.launchConfig || manifest.launchConfig;

    const modelOverride = this.resolveModelOverride(launchConfig?.model || manifest.session.model);
    if (modelOverride.provider) {
      args.push('--provider', modelOverride.provider);
    }
    if (modelOverride.model) {
      args.push('--model', modelOverride.model);
    }

    if (manifest.session.maxTurns) {
      args.push('--max-turns', manifest.session.maxTurns.toString());
    }

    if (launchConfig?.accessMode === 'fullAccess' || this.shouldUseYolo(manifest.session.permissionMode)) {
      args.push('--yolo');
    }

    args.push('--source', 'maestro');

    return args;
  }

  buildHermesArgs(
    manifest: MaestroManifest,
    _sessionId: string,
    systemPrompt: string,
    taskContext: string,
  ): string[] {
    const args = this.buildHermesBaseArgs(manifest);

    args.push('--query', this.buildHermesPrompt(systemPrompt, taskContext));

    return args;
  }

  buildInteractiveHermesArgs(manifest: MaestroManifest, taskContext: string): string[] {
    const args = this.buildHermesBaseArgs(manifest);
    args.push('--tui', '--query', taskContext);
    return args;
  }

  buildPromptEnvelope(
    manifest: MaestroManifest,
    sessionId: string,
  ): PromptEnvelope {
    return this.promptComposer.compose(manifest, { sessionId });
  }

  async spawn(
    manifest: MaestroManifest,
    sessionId: string,
    options: SpawnOptions = {}
  ): Promise<SpawnResult> {
    const envelope = this.buildPromptEnvelope(manifest, sessionId);
    const env = {
      ...this.prepareEnvironment(manifest, sessionId),
      ...(options.env || {}),
    };
    const interactive = options.interactive === true;
    const args = interactive
      ? this.buildInteractiveHermesArgs(manifest, envelope.task)
      : this.buildHermesArgs(manifest, sessionId, envelope.system, envelope.task);
    const spawnEnv = interactive
      ? {
          ...env,
          HERMES_EPHEMERAL_SYSTEM_PROMPT: envelope.system,
        }
      : env;
    const cwd = options.cwd || manifest.session.workingDirectory || process.cwd();

    const hermesProcess = spawnWithUlimit('hermes', args, {
      cwd,
      env: spawnEnv,
      stdio: options.interactive ? 'inherit' : 'pipe',
    });

    const sendInput = (text: string) => {
      if (hermesProcess.stdin && !hermesProcess.stdin.destroyed) {
        hermesProcess.stdin.write(text + '\n');
      }
    };

    return {
      sessionId,
      process: hermesProcess,
      sendInput,
    };
  }

  generateSessionId(): string {
    return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }
}
