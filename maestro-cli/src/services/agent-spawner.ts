import type { MaestroManifest, AgentTool } from '../types/manifest.js';
import { ClaudeSpawner, type SpawnResult, type SpawnOptions } from './claude-spawner.js';
import { CodexSpawner } from './codex-spawner.js';
import { GeminiSpawner } from './gemini-spawner.js';
import { HermesSpawner } from './hermes-spawner.js';
import { KimiSpawner } from './kimi-spawner.js';
import { GlmSpawner } from './glm-spawner.js';
import { randomBytes } from 'crypto';
import { AGENT_TOOL_DISPLAY_NAMES } from '../prompts/index.js';

/**
 * Common spawner interface that both ClaudeSpawner and CodexSpawner implement
 */
export interface IAgentSpawner {
  spawn(manifest: MaestroManifest, sessionId: string, options?: SpawnOptions): Promise<SpawnResult>;
  prepareEnvironment(manifest: MaestroManifest, sessionId: string): Record<string, string>;
  generateSessionId(): string;
}

// Re-export shared environment preparation utility
export { prepareSpawnerEnvironment } from './spawner-env.js';

/**
 * AgentSpawner - Factory that creates the appropriate spawner based on the manifest's agentTool
 *
 * Defaults to ClaudeSpawner when agentTool is not specified.
 */
export class AgentSpawner implements IAgentSpawner {
  private _claudeSpawner?: ClaudeSpawner;
  private _codexSpawner?: CodexSpawner;
  private _geminiSpawner?: GeminiSpawner;
  private _hermesSpawner?: HermesSpawner;
  private _kimiSpawner?: KimiSpawner;
  private _glmSpawner?: GlmSpawner;

  /**
   * Get the appropriate spawner for a manifest (lazy-initialized)
   */
  private getSpawner(manifest: MaestroManifest): ClaudeSpawner | CodexSpawner | GeminiSpawner | HermesSpawner | KimiSpawner | GlmSpawner {
    const agentTool = manifest.agentTool || 'claude-code';

    switch (agentTool) {
      case 'codex':
        return (this._codexSpawner ??= new CodexSpawner());
      case 'gemini':
        return (this._geminiSpawner ??= new GeminiSpawner());
      case 'hermes':
        return (this._hermesSpawner ??= new HermesSpawner());
      case 'kimi':
        return (this._kimiSpawner ??= new KimiSpawner());
      case 'glm':
        return (this._glmSpawner ??= new GlmSpawner());
      case 'claude-code':
      default:
        return (this._claudeSpawner ??= new ClaudeSpawner());
    }
  }

  /**
   * Get the display name for the agent tool
   */
  static getToolDisplayName(agentTool?: AgentTool): string {
    return AGENT_TOOL_DISPLAY_NAMES[agentTool || 'claude-code'] || AGENT_TOOL_DISPLAY_NAMES['claude-code'];
  }

  /**
   * Spawn an agent session using the appropriate tool
   */
  async spawn(
    manifest: MaestroManifest,
    sessionId: string,
    options: SpawnOptions = {}
  ): Promise<SpawnResult> {
    const spawner = this.getSpawner(manifest);
    return spawner.spawn(manifest, sessionId, options);
  }

  /**
   * Prepare environment variables
   */
  prepareEnvironment(
    manifest: MaestroManifest,
    sessionId: string
  ): Record<string, string> {
    const spawner = this.getSpawner(manifest);
    return spawner.prepareEnvironment(manifest, sessionId);
  }

  /**
   * Generate unique session ID
   */
  generateSessionId(): string {
    return `session-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }
}

/**
 * Default instance
 */
export const defaultAgentSpawner = new AgentSpawner();
