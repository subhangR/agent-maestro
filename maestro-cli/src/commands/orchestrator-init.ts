import type { MaestroManifest } from '../types/manifest.js';
import { isCoordinatorMode } from '../types/manifest.js';
import { readManifestFromEnv } from '../services/manifest-reader.js';
import { AgentSpawner } from '../services/agent-spawner.js';
import { api } from '../api.js';
import { randomBytes } from 'crypto';
import {
  MANIFEST_PATH_NOT_SET,
  MANIFEST_NOT_FOUND_PREFIX,
  MANIFEST_NOT_FOUND_HINT,
  INVALID_MANIFEST_PREFIX,
  INVALID_MANIFEST_HINT,
  WRONG_MODE_ORCHESTRATOR_PREFIX,
  WRONG_MODE_ORCHESTRATOR_HINT,
} from '../prompts/index.js';
import { displayInitUI } from '../ui/init-display.js';
import { autoActivateManifestSpells } from '../services/spell-auto-activator.js';

/**
 * OrchestratorInitCommand - Initialize an orchestrator session from a manifest
 *
 * Reads manifest from MAESTRO_MANIFEST_PATH environment variable,
 * validates it's an orchestrator manifest, and spawns the configured agent tool.
 */
export class OrchestratorInitCommand {
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
   * Validate that manifest is for coordinator mode
   */
  validateOrchestratorManifest(manifest: MaestroManifest): boolean {
    return isCoordinatorMode(manifest.mode);
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
        return `${WRONG_MODE_ORCHESTRATOR_PREFIX}${details}\n\n${WRONG_MODE_ORCHESTRATOR_HINT}`;

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
      for (const task of manifest.tasks) {
        // Update task's main status to in_progress
        try {
          await api.patch(`/api/tasks/${task.id}`, {
            status: 'in_progress',
          });
        } catch (err: unknown) {
          if (process.env.MAESTRO_DEBUG === 'true') {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[orchestrator-init] Failed to update task ${task.id} status: ${message}`);
          }
        }

        // Update task's per-session status to working
        try {
          await api.patch(`/api/tasks/${task.id}`, {
            sessionStatus: 'working',
            updateSource: 'session',
            sessionId,
          });
        } catch (err: unknown) {
          if (process.env.MAESTRO_DEBUG === 'true') {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[orchestrator-init] Failed to update task ${task.id} session status: ${message}`);
          }
        }
      }
    } catch (err: unknown) {
      if (process.env.MAESTRO_DEBUG === 'true') {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[orchestrator-init] Failed to update session status: ${message}`);
      }
    }
  }

  /**
   * Execute the orchestrator init command
   */
  async execute(): Promise<void> {
    try {
      // Step 1: Get manifest path
      const manifestPath = this.getManifestPath();

      // Step 2: Read and validate manifest
      const result = await readManifestFromEnv();

      if (!result.success || !result.manifest) {
        const details = result.error || manifestPath;
        const errorType = this.resolveManifestReadErrorType(result.error);
        throw new Error(this.formatError(errorType, details));
      }

      const manifest = result.manifest;

      // Step 3: Validate mode
      if (!this.validateOrchestratorManifest(manifest)) {
        throw new Error(this.formatError('wrong_mode', manifest.mode));
      }

      // Step 4: Get session ID
      const sessionId = this.getSessionId();

      // Step 5: Display init UI
      displayInitUI(manifest, sessionId);

      // Step 6: Auto-update session status to working
      await this.autoUpdateSessionStatus(manifest, sessionId);

      // Step 6b: Auto-activate any task-assigned spells carried in the manifest.
      await autoActivateManifestSpells(manifest, sessionId);

      // Step 7: Spawn agent
      const spawnResult = await this.spawner.spawn(manifest, sessionId, {
        interactive: true,
      });

      // Wait for process to exit
      spawnResult.process.on('exit', async (code) => {
        // Clean up manifest file (disabled for debugging)
        // try {
        //   const { unlink } = await import('fs/promises');
        //   const manifestPath = process.env.MAESTRO_MANIFEST_PATH;
        //   if (manifestPath) {
        //     await unlink(manifestPath);
        //     console.log('Cleaned up manifest file');
        //   }
        // } catch (error) {
        //   // Ignore cleanup errors
        // }
      });

    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown orchestrator init error');
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
