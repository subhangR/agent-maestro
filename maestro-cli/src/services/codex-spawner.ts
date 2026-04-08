import { randomBytes } from 'crypto';
import type { MaestroManifest } from '../types/manifest.js';
import type { SpawnResult, SpawnOptions } from './claude-spawner.js';
import { prepareSpawnerEnvironment } from './spawner-env.js';
import { PromptComposer, type PromptEnvelope } from '../prompting/prompt-composer.js';
import { spawnWithUlimit } from './spawn-with-ulimit.js';

/**
 * CodexSpawner - Spawns OpenAI Codex CLI sessions with manifests
 *
 * Handles:
 * - Environment variable setup for Maestro context
 * - Codex CLI process spawning
 */
export class CodexSpawner {
  private promptComposer: PromptComposer;

  constructor() {
    this.promptComposer = new PromptComposer();
  }

  /**
   * Prepare environment variables for Codex session
   */
  prepareEnvironment(
    manifest: MaestroManifest,
    sessionId: string
  ): Record<string, string> {
    return prepareSpawnerEnvironment(manifest, sessionId);
  }

  /** All supported Codex models */
  static readonly MODELS = [
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
    'gpt-5.1-codex',
    'gpt-5-codex',
    'gpt-5-codex-mini',
  ] as const;

  /**
   * Map manifest model to Codex model string.
   * If the model is already a native Codex model, pass it through.
   * Otherwise map Claude model names to a sensible default.
   */
  private mapModel(model: string): string {
    // Pass through if already a native Codex/OpenAI model
    if (model.startsWith('gpt-')) {
      return model;
    }
    // Map Claude model names to Codex equivalents
    switch (model) {
      case 'opus':
      case 'opus[1m]':
        return 'gpt-5.3-codex';
      case 'sonnet':
      case 'sonnet[1m]':
        return 'gpt-5.2-codex';
      case 'haiku':
        return 'gpt-5.1-codex-mini';
      default:
        return 'gpt-5.3-codex';
    }
  }

  /**
   * Map manifest permission mode to Codex approval policy.
   * Note: 'bypassPermissions' is handled separately via --dangerously-bypass-approvals-and-sandbox flag.
   */
  private mapApprovalPolicy(permissionMode: string): string {
    switch (permissionMode) {
      case 'bypassPermissions':
        // Handled by --dangerously-bypass-approvals-and-sandbox flag
        return 'never';
      case 'acceptEdits':
        return 'never';
      case 'readOnly':
        return 'untrusted';
      case 'interactive':
      default:
        return 'untrusted';
    }
  }

  /**
   * Map manifest permission mode to Codex sandbox mode.
   * Note: 'bypassPermissions' uses --dangerously-bypass-approvals-and-sandbox instead.
   */
  private mapSandboxMode(permissionMode: string): string {
    switch (permissionMode) {
      case 'bypassPermissions':
        // Handled by --dangerously-bypass-approvals-and-sandbox flag
        return 'danger-full-access';
      case 'acceptEdits':
        return 'workspace-write';
      case 'readOnly':
        return 'read-only';
      case 'interactive':
      default:
        return 'workspace-write';
    }
  }

  /**
   * Build Codex CLI arguments
   */
  buildCodexArgs(manifest: MaestroManifest): string[] {
    const args: string[] = [];

    // Set model
    const model = this.mapModel(manifest.session.model);
    args.push('--model', model);

    if (manifest.session.permissionMode === 'bypassPermissions') {
      // Use --dangerously-bypass-approvals-and-sandbox for full bypass mode
      // This skips all confirmation prompts and runs without sandboxing
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      // Set approval policy based on permission mode
      const approval = this.mapApprovalPolicy(manifest.session.permissionMode);
      args.push('--ask-for-approval', approval);

      // Set sandbox mode based on permission mode
      const sandbox = this.mapSandboxMode(manifest.session.permissionMode);
      args.push('--sandbox', sandbox);
    }

    // Set working directory if specified
    if (manifest.session.workingDirectory) {
      args.push('--cd', manifest.session.workingDirectory);
    }

    // Add max turns if specified
    if (manifest.session.maxTurns) {
      args.push('--max-turns', manifest.session.maxTurns.toString());
    }

    return args;
  }

  buildPromptEnvelope(
    manifest: MaestroManifest,
    sessionId: string,
  ): PromptEnvelope {
    return this.promptComposer.compose(manifest, { sessionId });
  }

  /**
   * Spawn Codex CLI session with manifest
   */
  async spawn(
    manifest: MaestroManifest,
    sessionId: string,
    options: SpawnOptions = {}
  ): Promise<SpawnResult> {
    const envelope = this.buildPromptEnvelope(manifest, sessionId);
    const systemPrompt = envelope.system;
    const taskContext = envelope.task;

    const env = {
      ...this.prepareEnvironment(manifest, sessionId),
      ...(options.env || {}),
    };

    const args = this.buildCodexArgs(manifest);

    // Inject static role instructions via Codex config override.
    // NOTE: `instructions` is reserved by Codex and ignored; use `developer_instructions`.
    args.push('-c', `developer_instructions=${JSON.stringify(systemPrompt)}`);

    // Dynamic task context as the prompt argument
    args.push(taskContext);

    const cwd = options.cwd || manifest.session.workingDirectory || process.cwd();

    const codexProcess = spawnWithUlimit('codex', args, {
      cwd,
      env,
      stdio: options.interactive ? 'inherit' : 'pipe',
    });

    const sendInput = (text: string) => {
      if (codexProcess.stdin && !codexProcess.stdin.destroyed) {
        codexProcess.stdin.write(text + '\n');
      }
    };

    return {
      sessionId,
      process: codexProcess,
      sendInput,
    };
  }

  /**
   * Generate unique session ID
   */
  generateSessionId(): string {
    return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }
}
