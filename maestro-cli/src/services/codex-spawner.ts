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
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.3-codex-spark',
    'gpt-5.2',
  ] as const;

  /**
   * Map manifest model to Codex model string.
   * If the model is already a native Codex model, pass it through.
   * Otherwise map Claude model names to a sensible default.
   */
  private mapModel(model: string): string {
    switch (model) {
      case 'gpt-5.2-codex':
      case 'gpt-5.1-codex':
      case 'gpt-5-codex':
        return 'gpt-5.2';
      case 'gpt-5.1-codex-max':
        return 'gpt-5.3-codex';
      case 'gpt-5.1-codex-mini':
      case 'gpt-5-codex-mini':
        return 'gpt-5.4-mini';
    }

    // Pass through if already a native Codex/OpenAI model
    if (model.startsWith('gpt-')) {
      return model;
    }
    // Map Claude model names to Codex equivalents
    switch (model) {
      case 'claude-fable-5':
      case 'claude-fable-5[1m]':
        // Fable is the most-capable Claude; map to the top Codex model.
        return 'gpt-5.6-sol';
      case 'claude-sonnet-5':
      case 'claude-sonnet-5[1m]':
        return 'gpt-5.6-terra';
      case 'claude-opus-4-8[1m]':
      case 'claude-opus-4-8':
      case 'claude-opus-4-7[1m]':
      case 'claude-opus-4-7':
      case 'opus':
      case 'opus[1m]':
        return 'gpt-5.6-terra';
      case 'sonnet':
      case 'sonnet[1m]':
        // Map to a current Codex model. 'gpt-5.2-codex' was removed in PR #83 and
        // would be passed verbatim to a CLI that no longer recognizes it.
        return 'gpt-5.2';
      case 'haiku':
        // 'gpt-5.1-codex-mini' was removed in PR #83; use its current equivalent.
        return 'gpt-5.4-mini';
      default:
        return 'gpt-5.6-sol';
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

  private permissionModeFromAccessMode(accessMode?: string): string | undefined {
    switch (accessMode) {
      case 'fullAccess':
        return 'bypassPermissions';
      case 'acceptEdits':
        return 'acceptEdits';
      case 'plan':
        return 'readOnly';
      case 'safe':
        return 'interactive';
      default:
        return undefined;
    }
  }

  private supportsReasoningEffort(model: string, effort: string): boolean {
    if (['low', 'medium', 'high', 'xhigh'].includes(effort)) {
      return true;
    }
    return effort === 'max' && ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'].includes(model);
  }

  /**
   * Build Codex CLI arguments
   */
  buildCodexArgs(manifest: MaestroManifest): string[] {
    const args: string[] = [];

    // Server-hosted PTYs are consumed by reconnectable browser/mobile xterm
    // clients. Keep Codex inline there so its transcript remains ordinary
    // scrollback instead of a continuously redrawn alternate screen. Native
    // Tauri terminals retain Codex's default auto behavior.
    if (process.env.MAESTRO_PTY_HOST === 'server') {
      args.push('--no-alt-screen');
    }

    // Set model
    const launchConfig = manifest.session.launchConfig || manifest.launchConfig;
    const model = this.mapModel(launchConfig?.model || manifest.session.model);
    args.push('--model', model);

    const permissionMode = this.permissionModeFromAccessMode(launchConfig?.accessMode) || manifest.session.permissionMode;

    if (permissionMode === 'bypassPermissions') {
      // Use --dangerously-bypass-approvals-and-sandbox for full bypass mode
      // This skips all confirmation prompts and runs without sandboxing
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      // Set approval policy based on permission mode
      const approval = this.mapApprovalPolicy(permissionMode);
      args.push('--ask-for-approval', approval);

      // Set sandbox mode based on permission mode
      const sandbox = this.mapSandboxMode(permissionMode);
      args.push('--sandbox', sandbox);
    }

    if (launchConfig?.reasoningEffort && this.supportsReasoningEffort(model, launchConfig.reasoningEffort)) {
      args.push('-c', `model_reasoning_effort=${JSON.stringify(launchConfig.reasoningEffort)}`);
    }
    if (launchConfig?.speed === 'fast' && ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4'].includes(model)) {
      args.push('-c', 'service_tier="fast"');
    }

    // Set working directory if specified
    if (manifest.session.workingDirectory) {
      args.push('--cd', manifest.session.workingDirectory);
    }

    return args;
  }

  /**
   * Build Codex CLI arguments for resuming an existing session:
   * `codex resume [OPTIONS] <SESSION_ID>` (verified against `codex resume --help`,
   * CLI 0.144.x). Unlike Claude — which lets Maestro pre-seed the session id via
   * `--session-id` and resume with `--resume <id>` — the Codex CLI generates its
   * own rollout id and cannot be pre-seeded, so resume requires the captured
   * native id. The launch config (model, sandbox, approval policy, cwd) is
   * reapplied so the resumed session keeps its settings.
   *
   * The Maestro role/system prompt IS re-injected via Codex's official
   * `developer_instructions` config key — documented as "additional user
   * instructions injected per session (before AGENTS.md)", i.e. it ADDS to
   * Codex's built-in base prompt rather than replacing it (the provider-specific
   * analog of Claude's `--append-system-prompt`). Because it is applied per
   * invocation, resume must pass it again — exactly like a fresh spawn — so the
   * agent keeps its Maestro identity, permissions, and task framing. The dynamic
   * task context is NOT re-passed: `codex resume <id>` restores the prior
   * conversation, so the original task turn is already present and re-passing it
   * would duplicate it.
   *
   * There is deliberately no `--last` fallback: it resumes the most recent
   * cwd-scoped session and would restore the WRONG thread when multiple Codex
   * sessions share a cwd. Callers without a native id fresh-start with full
   * context instead.
   *
   * @param manifest - The manifest (source of the launch-config flags + prompt).
   * @param sessionId - The Maestro session id (used to compose the system prompt).
   * @param codexSessionId - The captured native Codex rollout id (UUID or thread
   *   name). Required — resume is only safe against a positively-identified thread.
   */
  buildResumeArgs(manifest: MaestroManifest, sessionId: string, codexSessionId: string): string[] {
    const args = ['resume', ...this.buildCodexArgs(manifest)];

    // Re-inject the Maestro role/system prompt via Codex's per-session
    // developer-instructions channel (adds to, does not replace, the base prompt).
    const systemPrompt = this.buildPromptEnvelope(manifest, sessionId).system;
    args.push('-c', `developer_instructions=${JSON.stringify(systemPrompt)}`);

    // Resume the exact rollout thread by its native id (no `--last` guess).
    args.push(codexSessionId);
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
