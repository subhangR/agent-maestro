import { randomBytes } from 'crypto';
import type { MaestroManifest } from '../types/manifest.js';
import type { SpawnResult, SpawnOptions } from './claude-spawner.js';
import { prepareSpawnerEnvironment } from './spawner-env.js';
import { PromptComposer, type PromptEnvelope } from '../prompting/prompt-composer.js';
import { spawnWithUlimit } from './spawn-with-ulimit.js';

// Configurable binary: MAESTRO_KIMI_BIN > KIMI_BIN > 'kimi'
const resolveKimiBin = (): string =>
  process.env.MAESTRO_KIMI_BIN || process.env.KIMI_BIN || 'kimi';

/**
 * KimiSpawner - Spawns Kimi (Moonshot AI) CLI sessions with manifests.
 *
 * The actual Kimi CLI binary and API credentials are not yet available;
 * this spawner provides the scaffolding so the provider is selectable and
 * compiles. Once KIMI_API_KEY (and optionally KIMI_BASE_URL) are set and
 * the binary lands on PATH (or MAESTRO_KIMI_BIN / KIMI_BIN is set), sessions
 * will spawn without further code changes.
 *
 * Spawn command shape:
 *   <bin> --model <model> [--base-url <url>] "<system+task prompt>"
 *
 * The API key is injected into the child environment as KIMI_API_KEY /
 * MOONSHOT_API_KEY (Moonshot's official env var name).
 */
export class KimiSpawner {
  private promptComposer: PromptComposer;

  constructor() {
    this.promptComposer = new PromptComposer();
  }

  prepareEnvironment(
    manifest: MaestroManifest,
    sessionId: string
  ): Record<string, string> {
    const env = prepareSpawnerEnvironment(manifest, sessionId);
    delete env.MAESTRO_CLAUDE_SESSION_ID;
    return env;
  }

  private resolveModel(manifest: MaestroManifest): string {
    const launchConfig = manifest.session.launchConfig || manifest.launchConfig;
    const model = launchConfig?.model || manifest.session.model;
    if (model && (model.startsWith('kimi') || model.startsWith('moonshot'))) {
      return model;
    }
    return 'kimi-k2-0711-preview';
  }

  buildKimiArgs(manifest: MaestroManifest, prompt: string): string[] {
    const args: string[] = [];
    args.push('--model', this.resolveModel(manifest));

    const baseUrl = process.env.KIMI_BASE_URL;
    if (baseUrl) {
      args.push('--base-url', baseUrl);
    }

    if (manifest.session.maxTurns) {
      args.push('--max-turns', manifest.session.maxTurns.toString());
    }

    args.push(prompt);
    return args;
  }

  buildPromptEnvelope(
    manifest: MaestroManifest,
    sessionId: string,
  ): PromptEnvelope {
    return this.promptComposer.compose(manifest, { sessionId });
  }

  buildCombinedPrompt(systemPrompt: string, taskContext: string): string {
    return `[SYSTEM INSTRUCTIONS]\n${systemPrompt}\n\n[TASK]\n${taskContext}`;
  }

  async spawn(
    manifest: MaestroManifest,
    sessionId: string,
    options: SpawnOptions = {}
  ): Promise<SpawnResult> {
    const envelope = this.buildPromptEnvelope(manifest, sessionId);
    const combinedPrompt = this.buildCombinedPrompt(envelope.system, envelope.task);

    const baseEnv = this.prepareEnvironment(manifest, sessionId);
    // Forward API key under both the Maestro env name and Moonshot's official name
    const kimiApiKey = process.env.KIMI_API_KEY;
    if (kimiApiKey) {
      baseEnv['KIMI_API_KEY'] = kimiApiKey;
      baseEnv['MOONSHOT_API_KEY'] = kimiApiKey;
    }

    const env = {
      ...baseEnv,
      ...(options.env || {}),
    };

    const bin = resolveKimiBin();
    const args = this.buildKimiArgs(manifest, combinedPrompt);
    const cwd = options.cwd || manifest.session.workingDirectory || process.cwd();

    const kimiProcess = spawnWithUlimit(bin, args, {
      cwd,
      env,
      stdio: options.interactive ? 'inherit' : 'pipe',
    });

    const sendInput = (text: string) => {
      if (kimiProcess.stdin && !kimiProcess.stdin.destroyed) {
        kimiProcess.stdin.write(text + '\n');
      }
    };

    return {
      sessionId,
      process: kimiProcess,
      sendInput,
    };
  }

  generateSessionId(): string {
    return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }
}
