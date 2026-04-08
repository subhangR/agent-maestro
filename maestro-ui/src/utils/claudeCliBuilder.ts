export interface ClaudeCliConfig {
  mode: 'interactive' | 'non-interactive';
  model?: 'sonnet' | 'sonnet[1m]' | 'opus' | 'opus[1m]' | 'haiku';
  systemPrompt?: string;
  appendSystemPrompt?: string;
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';
  tools?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  sessionId?: string;
  mcpConfig?: string[];
  pluginDirs?: string[];

  // NEW: Skills support (maps to --plugin-dir for each skill)
  skillDirs?: string[];              // Array of skill plugin directories
  disableAllSkills?: boolean;        // Maps to --disable-slash-commands

  maxBudgetUsd?: number;
  jsonSchema?: object;
  outputFormat?: 'text' | 'json' | 'stream-json';
  inputFormat?: 'text' | 'stream-json';
  dangerouslySkipPermissions?: boolean;
  agents?: object;
}

export class ClaudeCliBuilder {
  private config: ClaudeCliConfig;

  constructor(config: ClaudeCliConfig) {
    this.config = config;
  }

  /**
   * Build Claude CLI command and arguments
   */
  buildCommand(): { command: string; args: string[] } {
    const args: string[] = [];

    // Mode
    if (this.config.mode === 'non-interactive') {
      args.push('--print');
    }

    // Model
    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    // System prompts
    if (this.config.systemPrompt) {
      args.push('--system-prompt', this.config.systemPrompt);
    }
    if (this.config.appendSystemPrompt) {
      args.push('--append-system-prompt', this.config.appendSystemPrompt);
    }

    // Permission mode
    if (this.config.permissionMode) {
      args.push('--permission-mode', this.config.permissionMode);
    }

    // Tools
    if (this.config.tools && this.config.tools.length > 0) {
      args.push('--tools', this.config.tools.join(','));
    }
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      args.push('--allowedTools', this.config.allowedTools.join(','));
    }
    if (this.config.disallowedTools && this.config.disallowedTools.length > 0) {
      args.push('--disallowedTools', this.config.disallowedTools.join(','));
    }

    // Session management
    if (this.config.sessionId) {
      args.push('--session-id', this.config.sessionId);
    }

    // MCP servers
    if (this.config.mcpConfig && this.config.mcpConfig.length > 0) {
      args.push('--mcp-config', ...this.config.mcpConfig);
    }

    // Plugins (generic)
    if (this.config.pluginDirs && this.config.pluginDirs.length > 0) {
      for (const pluginDir of this.config.pluginDirs) {
        args.push('--plugin-dir', pluginDir);
      }
    }

    // NEW: Skills (Maestro-specific, maps to --plugin-dir)
    if (this.config.skillDirs && this.config.skillDirs.length > 0) {
      for (const skillDir of this.config.skillDirs) {
        args.push('--plugin-dir', skillDir);
      }
    }

    // Disable all skills
    if (this.config.disableAllSkills) {
      args.push('--disable-slash-commands');
    }

    // Budget
    if (this.config.maxBudgetUsd) {
      args.push('--max-budget-usd', String(this.config.maxBudgetUsd));
    }

    // JSON Schema
    if (this.config.jsonSchema) {
      args.push('--json-schema', JSON.stringify(this.config.jsonSchema));
    }

    // Output/Input formats
    if (this.config.outputFormat) {
      args.push('--output-format', this.config.outputFormat);
    }
    if (this.config.inputFormat) {
      args.push('--input-format', this.config.inputFormat);
    }

    // Dangerous permissions
    if (this.config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // Agents
    if (this.config.agents) {
      args.push('--agents', JSON.stringify(this.config.agents));
    }

    return {
      command: 'claude',
      args,
    };
  }

  /**
   * Parse CLI args from environment variable
   */
  static fromEnvironment(envVars: Record<string, string>): ClaudeCliConfig {
    const config: ClaudeCliConfig = {
      mode: (envVars.CLAUDE_CLI_MODE as any) || 'interactive',
    };

    // Parse CLAUDE_CLI_ARGS if present
    if (envVars.CLAUDE_CLI_ARGS) {
      const argsString = envVars.CLAUDE_CLI_ARGS;
      // Simple parsing (in production, use a proper CLI parser)
      const argParts = argsString.split(/\s+/);

      for (let i = 0; i < argParts.length; i++) {
        const arg = argParts[i];

        if (arg === '--model' && i + 1 < argParts.length) {
          config.model = argParts[++i] as any;
        } else if (arg === '--permission-mode' && i + 1 < argParts.length) {
          config.permissionMode = argParts[++i] as any;
        } else if (arg === '--tools' && i + 1 < argParts.length) {
          config.tools = argParts[++i].split(',');
        }
        // ... parse other arguments
      }
    }

    // Agent config
    if (envVars.MAESTRO_AGENT_CONFIG) {
      try {
        const agentConfig = JSON.parse(envVars.MAESTRO_AGENT_CONFIG);
        config.model = agentConfig.model;
      } catch {
      }
    }

    return config;
  }
}
