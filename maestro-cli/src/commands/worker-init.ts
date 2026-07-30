import type { MaestroManifest } from '../types/manifest.js';
import { isWorkerMode } from '../types/manifest.js';
import { readManifestFromEnv } from '../services/manifest-reader.js';
import { AgentSpawner } from '../services/agent-spawner.js';
import { api } from '../api.js';
import { randomBytes } from 'crypto';
import {
  getPermissionsFromManifest,
  setCachedPermissions,
  type CommandPermissions
} from '../services/command-permissions.js';
import {
  MANIFEST_PATH_NOT_SET,
  MANIFEST_NOT_FOUND_PREFIX,
  MANIFEST_NOT_FOUND_HINT,
  INVALID_MANIFEST_PREFIX,
  INVALID_MANIFEST_HINT,
  WRONG_MODE_WORKER_PREFIX,
  WRONG_MODE_WORKER_HINT,
} from '../prompts/index.js';
import { displayInitUI } from '../ui/init-display.js';
import { autoActivateManifestSpells } from '../services/spell-auto-activator.js';

/**
 * WorkerInitCommand - Initialize a worker session from a manifest
 *
 * Reads manifest from MAESTRO_MANIFEST_PATH environment variable,
 * validates it's a worker manifest, and spawns the configured agent tool.
 */
export class WorkerInitCommand {
  private spawner: AgentSpawner;

  constructor() {
    this.spawner = new AgentSpawner();
  }

  /**
   * Get manifest path from environment
   */
  getManifestPath(): string {
    const path = process.env.MAESTRO_MANIFEST_PATH;

    if (!path) {
      throw new Error(MANIFEST_PATH_NOT_SET);
    }

    return path;
  }

  /**
   * Get or generate session ID
   */
  getSessionId(): string {
    const envSessionId = process.env.MAESTRO_SESSION_ID;

    if (envSessionId) {
      return envSessionId;
    }

    // Generate new session ID
    return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Validate that manifest is for worker mode
   */
  validateWorkerManifest(manifest: MaestroManifest): boolean {
    return isWorkerMode(manifest.mode);
  }

  /**
   * Format error message
   */
  formatError(errorType: string, details?: string): string {
    switch (errorType) {
      case 'manifest_not_found':
        return `${MANIFEST_NOT_FOUND_PREFIX}${details}\n\n${MANIFEST_NOT_FOUND_HINT}`;

      case 'invalid_manifest':
        return `${INVALID_MANIFEST_PREFIX}${details}\n\n${INVALID_MANIFEST_HINT}`;

      case 'wrong_mode':
        return `${WRONG_MODE_WORKER_PREFIX}${details}\n\n${WRONG_MODE_WORKER_HINT}`;

      default:
        return `Error: ${details}`;
    }
  }

  private resolveManifestReadErrorType(errorMessage?: string): 'manifest_not_found' | 'invalid_manifest' {
    if (!errorMessage) {
      return 'manifest_not_found';
    }

    const lower = errorMessage.toLowerCase();
    if (lower.includes('not found or not readable') || lower.includes('environment variable not set')) {
      return 'manifest_not_found';
    }

    if (lower.includes('validation failed') || lower.includes('parse') || lower.includes('normalization failed')) {
      return 'invalid_manifest';
    }

    return 'invalid_manifest';
  }

  /**
   * Auto-update session status to working (does NOT touch user status)
   */
  private async autoUpdateSessionStatus(manifest: MaestroManifest, sessionId: string): Promise<void> {
    try {
      const debugLog = (msg: string) => {
        if (process.env.MAESTRO_DEBUG === 'true') console.error(msg);
      };

      // Fire all API calls in parallel
      const promises: Promise<void>[] = [
        api.patch(`/api/sessions/${sessionId}`, { status: 'working' }).then(() => {}).catch((err: unknown) => {
          debugLog(`[worker-init] Failed to update session status: ${err instanceof Error ? err.message : String(err)}`);
        }),
      ];

      for (const task of manifest.tasks) {
        promises.push(
          api.patch(`/api/tasks/${task.id}`, { status: 'in_progress' }).then(() => {}).catch((err: unknown) => {
            debugLog(`[worker-init] Failed to update task ${task.id} status: ${err instanceof Error ? err.message : String(err)}`);
          }),
          api.patch(`/api/tasks/${task.id}`, {
            sessionStatus: 'working',
            updateSource: 'session',
            sessionId,
          }).then(() => {}).catch((err: unknown) => {
            debugLog(`[worker-init] Failed to update task ${task.id} session status: ${err instanceof Error ? err.message : String(err)}`);
          }),
        );
      }

      await Promise.all(promises);
    } catch (err: unknown) {
      if (process.env.MAESTRO_DEBUG === 'true') {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[worker-init] Failed to update session status: ${message}`);
      }
    }
  }

  /**
   * Execute the worker init command
   */
  async execute(): Promise<void> {
    try {
      // Get manifest path
      const manifestPath = this.getManifestPath();

      // Read and validate manifest
      const result = await readManifestFromEnv();

      if (!result.success || !result.manifest) {
        const details = result.error || manifestPath;
        const errorType = this.resolveManifestReadErrorType(result.error);
        throw new Error(this.formatError(errorType, details));
      }

      const manifest = result.manifest;

      // Validate mode
      if (!this.validateWorkerManifest(manifest)) {
        throw new Error(this.formatError('wrong_mode', manifest.mode));
      }

      // Load command permissions from manifest
      const permissions = getPermissionsFromManifest(manifest);
      setCachedPermissions(permissions);

      // Get session ID
      const sessionId = this.getSessionId();

      // Display init UI
      displayInitUI(manifest, sessionId);

      // Register session with server
      await this.autoUpdateSessionStatus(manifest, sessionId);

      // Auto-activate task-assigned spells so the dispatcher (hook events) sees
      // them live from the first PreToolUse / Stop / etc. fire.
      await autoActivateManifestSpells(manifest, sessionId);

      // Spawn agent
      const spawnResult = await this.spawner.spawn(manifest, sessionId, {
        interactive: true,
      });

      // Wait for process to exit
      const pid = spawnResult.process.pid;
      spawnResult.process.on('exit', async (code) => {
        // H3: When the agent process exits without calling `maestro session report complete`,
        // the session stays in 'working'/'idle' forever. Mark it 'stopped' so the task
        // auto-advance logic (H1) can run and downstream coordinators get notified.
        // Exit code 0 means the agent finished cleanly — it may have already reported
        // complete, in which case the server guard (completed → stopped is a no-op) prevents
        // overwriting. Non-zero exits are crashes/OOM/token-exhaustion — definitely stopped.
        if (code !== null) {
          try {
            await api.patch(`/api/sessions/${sessionId}`, { status: 'stopped' });
          } catch {
            // Best-effort: server may be down or session already deleted.
          }
        }
      });

    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown worker init error');
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
