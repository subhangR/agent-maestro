import { api } from '../api.js';
import { ClaudeSpawner } from '../services/claude-spawner.js';
import { CodexSpawner } from '../services/codex-spawner.js';
import { spawnWithUlimit } from '../services/spawn-with-ulimit.js';
import { readManifestFromEnv } from '../services/manifest-reader.js';
import { getPermissionsFromManifest, setCachedPermissions } from '../services/command-permissions.js';
import type { MaestroManifest, AgentTool } from '../types/manifest.js';

/** The concrete invocation the resume path will run. */
export interface ResumeInvocation {
  /** The agent binary to launch (`claude`, `codex`, …). */
  bin: string;
  /** Full argument list for the resume invocation (no prompt appended). */
  args: string[];
}

/**
 * WorkerResumeCommand - Resume a previously stopped/crashed agent session.
 *
 * Reads MAESTRO_SESSION_ID plus the provider-specific resume id from the
 * environment, marks the session as working, and re-launches the correct agent
 * for the session's `agentTool`:
 *
 *  - `claude-code`: `claude --resume <claudeSessionId>` (Maestro pre-seeds the id
 *    via `--session-id` at spawn, so resume-by-id is deterministic).
 *  - `codex`: `codex resume <codexSessionId>` — only when a native Codex rollout
 *    id was captured. The Codex CLI generates its own session id and has no
 *    `--session-id`/`--resume` flag, so the id can only be captured after spawn.
 *    When no id is available there is NO `--last` or fresh-start fallback.
 *
 * Providers without a native resume-by-id surface (gemini/hermes), and Codex
 * sessions with no captured id, fail closed. Reusing the same Maestro id for a
 * fresh agent is user-visible data loss disguised as resume.
 */
export class WorkerResumeCommand {
  private claudeSpawner = new ClaudeSpawner();
  private codexSpawner = new CodexSpawner();

  private debug(message: string): void {
    if (process.env.MAESTRO_DEBUG === 'true') {
      console.error(message);
    }
  }

  /**
   * Resolve the exact binary + args for resuming a session, branching on the
   * agent tool. Throws when the provider-native conversation cannot be restored.
   *
   * Kept pure (no process spawning, no env reads) so the resume contract for
   * each provider is directly unit-testable.
   */
  async resolveResumeInvocation(params: {
    agentTool: AgentTool;
    sessionId: string;
    manifest: MaestroManifest | null;
    claudeSessionId?: string;
    codexSessionId?: string;
    mode?: string;
  }): Promise<ResumeInvocation> {
    const { agentTool, sessionId, manifest, claudeSessionId, codexSessionId, mode } = params;

    switch (agentTool) {
      case 'codex': {
        // Codex resumes through the interactive `resume` subcommand, but only
        // against a positively-captured native rollout id. There is NO `--last`
        // fallback: it resumes the most recent cwd-scoped session and would
        // restore the WRONG thread when multiple Codex sessions share a cwd.
        if (!codexSessionId) {
          throw new Error('MAESTRO_CODEX_SESSION_ID environment variable not set; refusing to fresh-start a Codex resume');
        }
        if (manifest) {
          return {
            bin: 'codex',
            args: this.codexSpawner.buildResumeArgs(manifest, sessionId, codexSessionId),
          };
        }
        return { bin: 'codex', args: ['resume', codexSessionId] };
      }

      case 'claude-code': {
        if (!claudeSessionId) {
          throw new Error('MAESTRO_CLAUDE_SESSION_ID environment variable not set');
        }
        if (manifest) {
          return {
            bin: 'claude',
            args: await this.claudeSpawner.buildResumeArgs(manifest, sessionId, claudeSessionId),
          };
        }
        const args = ['--resume', claudeSessionId];
        const pluginDir = this.claudeSpawner.getPluginDir(mode || 'worker');
        if (pluginDir) {
          args.push('--plugin-dir', pluginDir);
        }
        return { bin: 'claude', args };
      }

      // gemini/hermes have no native resume-by-id.
      default:
        throw new Error(`Cannot resume '${agentTool}' because it has no provider-native resume-by-id contract`);
    }
  }

  async execute(): Promise<void> {
    try {
      const sessionId = process.env.MAESTRO_SESSION_ID;
      const claudeSessionId = process.env.MAESTRO_CLAUDE_SESSION_ID;
      const codexSessionId = process.env.MAESTRO_CODEX_SESSION_ID;

      if (!sessionId) {
        throw new Error('MAESTRO_SESSION_ID environment variable not set');
      }

      // Mark session as working (best-effort; non-fatal)
      try {
        await api.patch(`/api/sessions/${sessionId}`, { status: 'working' });
      } catch (err: unknown) {
        this.debug(`[worker-resume] Failed to update session status: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Read the manifest so we can reapply the full launch config on resume.
      let manifest: MaestroManifest | null = null;
      const manifestResult = await readManifestFromEnv();
      if (manifestResult.success && manifestResult.manifest) {
        manifest = manifestResult.manifest;
        // Refresh cached command permissions so CLI hooks gate correctly.
        try {
          setCachedPermissions(getPermissionsFromManifest(manifest));
        } catch (err: unknown) {
          this.debug(`[worker-resume] Failed to cache permissions: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        this.debug(`[worker-resume] Manifest unavailable, using minimal resume args: ${manifestResult.error || 'unknown'}`);
      }

      // The manifest is the source of truth for the agent tool; fall back to the
      // env hint, then to claude-code for legacy sessions.
      const agentTool: AgentTool =
        manifest?.agentTool || (process.env.MAESTRO_AGENT_TOOL as AgentTool | undefined) || 'claude-code';
      const mode = process.env.MAESTRO_MODE || 'worker';

      const invocation = await this.resolveResumeInvocation({
        agentTool,
        sessionId,
        manifest,
        claudeSessionId,
        codexSessionId,
        mode,
      });

      const agentProcess = spawnWithUlimit(invocation.bin, invocation.args, {
        env: { ...process.env } as Record<string, string>,
        stdio: 'inherit',
      });

      agentProcess.on('exit', (code) => {
        this.debug(`[worker-resume] ${invocation.bin} (resume) exited with code ${code}`);
        // Never convert a provider resume failure into a second invocation with
        // an empty conversation.
        process.exitCode = code ?? 1;
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown worker resume error');
      if (message) {
        console.error(message);
      }
      if (process.env.MAESTRO_DEBUG === 'true' && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

}
