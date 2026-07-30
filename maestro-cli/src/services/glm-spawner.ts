import { randomBytes } from 'crypto';
import type { MaestroManifest } from '../types/manifest.js';
import type { SpawnResult, SpawnOptions } from './claude-spawner.js';
import { prepareSpawnerEnvironment } from './spawner-env.js';
import { PromptComposer, type PromptEnvelope } from '../prompting/prompt-composer.js';
import { spawnWithUlimit } from './spawn-with-ulimit.js';

// Configurable binary: MAESTRO_GLM_BIN > GLM_BIN > 'glm'
const resolveGlmBin = (): string =>
  process.env.MAESTRO_GLM_BIN || process.env.GLM_BIN || 'glm';

/**
 * GlmSpawner - Spawns GLM (Zhipu AI) CLI sessions with manifests.
 *
 * The actual GLM CLI binary and API credentials are not yet available;
 * this spawner provides the scaffolding so the provider is selectable and
 * compiles. Once GLM_API_KEY (and optionally GLM_BASE_URL) are set and
 * the binary lands on PATH (or MAESTRO_GLM_BIN / GLM_BIN is set), sessions
 * will spawn without further code changes.
 *
 * Spawn command shape:
 *   <bin> --model <model> [--base-url <url>] "<system+task prompt>"
 *
 * The API key is injected into the child environment as GLM_API_KEY /
 * ZHIPU_API_KEY (Zhipu's common env var name).
 */
export class GlmSpawner {
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
    if (model && (model.startsWith('glm') || model.startsWith('chatglm'))) {
      return model;
    }
    return 'glm-4';
  }

  buildGlmArgs(manifest: MaestroManifest, prompt: string): string[] {
    const args: string[] = [];
    args.push('--model', this.resolveModel(manifest));

    const baseUrl = process.env.GLM_BASE_URL;
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
    // Forward API key under both the Maestro env name and Zhipu's common name
    const glmApiKey = process.env.GLM_API_KEY;
    if (glmApiKey) {
      baseEnv['GLM_API_KEY'] = glmApiKey;
      baseEnv['ZHIPU_API_KEY'] = glmApiKey;
    }

    const env = {
      ...baseEnv,
      ...(options.env || {}),
    };

    const bin = resolveGlmBin();
    const args = this.buildGlmArgs(manifest, combinedPrompt);
    const cwd = options.cwd || manifest.session.workingDirectory || process.cwd();

    const glmProcess = spawnWithUlimit(bin, args, {
      cwd,
      env,
      stdio: options.interactive ? 'inherit' : 'pipe',
    });

    const sendInput = (text: string) => {
      if (glmProcess.stdin && !glmProcess.stdin.destroyed) {
        glmProcess.stdin.write(text + '\n');
      }
    };

    return {
      sessionId,
      process: glmProcess,
      sendInput,
    };
  }

  generateSessionId(): string {
    return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }
}
