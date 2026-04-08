import * as path from 'path';
import * as os from 'os';
import { ConfigError } from '../../domain/common/Errors';

/**
 * Database configuration options.
 */
export interface DatabaseConfig {
  type: 'filesystem' | 'postgres';
  postgres?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    max?: number;
  };
}

/**
 * CORS configuration options.
 */
export interface CorsConfig {
  enabled: boolean;
  origins: string[];
  credentials?: boolean;
}

/**
 * Manifest generator configuration.
 */
export interface ManifestGeneratorConfig {
  type: 'cli' | 'server';
  cliPath?: string;
}

/**
 * Logging configuration.
 */
export interface LogConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'pretty';
  file?: string;
}

/**
 * Complete configuration options.
 */
export interface ConfigOptions {
  // Server
  port: number;
  host: string;
  serverUrl: string;

  // Storage paths
  dataDir: string;
  sessionDir: string;
  skillsDir: string;

  // Database
  database: DatabaseConfig;

  // Features
  manifestGenerator: ManifestGeneratorConfig;
  cors: CorsConfig;

  // Operational
  debug: boolean;
  log: LogConfig;

  // Environment
  nodeEnv: 'development' | 'production' | 'test';
}

/**
 * Expand ~ to home directory in paths.
 */
function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Centralized configuration class.
 * Loads configuration from environment variables with sensible defaults.
 */
export class Config implements Readonly<ConfigOptions> {
  private readonly config: ConfigOptions;

  constructor() {
    this.config = this.loadFromEnvironment();
    this.validate();
  }

  private loadFromEnvironment(): ConfigOptions {
    const port = parseInt(process.env.PORT || '4567', 10);
    const host = process.env.HOST || '0.0.0.0';

    return {
      // Server
      port,
      host,
      serverUrl: process.env.SERVER_URL || `http://localhost:${port}`,

      // Storage paths
      dataDir: expandPath(process.env.DATA_DIR || '~/.maestro/data'),
      sessionDir: expandPath(process.env.SESSION_DIR || '~/.maestro/sessions'),
      skillsDir: expandPath(process.env.SKILLS_DIR || '~/.claude/skills'),

      // Database
      database: {
        type: (process.env.DATABASE_TYPE as 'filesystem' | 'postgres') || 'filesystem',
        postgres: process.env.DATABASE_URL ? this.parsePostgresUrl(process.env.DATABASE_URL) : undefined
      },

      // Manifest generator
      manifestGenerator: {
        type: (process.env.MANIFEST_GENERATOR as 'cli' | 'server') || 'cli',
        cliPath: process.env.MAESTRO_CLI_PATH || 'maestro'
      },

      // CORS
      cors: {
        enabled: process.env.CORS_ENABLED !== 'false',
        origins: process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || ['*'],
        credentials: process.env.CORS_CREDENTIALS === 'true'
      },

      // Operational
      debug: process.env.DEBUG === 'true',
      log: {
        level: (process.env.LOG_LEVEL as LogConfig['level']) || 'info',
        format: (process.env.LOG_FORMAT as LogConfig['format']) || 'pretty',
        file: process.env.LOG_FILE
      },

      // Environment
      nodeEnv: (process.env.NODE_ENV as ConfigOptions['nodeEnv']) || 'development'
    };
  }

  private parsePostgresUrl(url: string): DatabaseConfig['postgres'] {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '5432', 10),
        database: parsed.pathname.slice(1),
        user: parsed.username,
        password: parsed.password,
        ssl: parsed.searchParams.get('ssl') === 'true',
        max: parseInt(parsed.searchParams.get('max') || '10', 10)
      };
    } catch {
      throw new ConfigError(`Invalid DATABASE_URL: ${url}`);
    }
  }

  /**
   * Validate configuration values.
   * @throws {ConfigError} if configuration is invalid
   */
  validate(): void {
    // Port validation
    if (this.config.port < 1 || this.config.port > 65535) {
      throw new ConfigError('PORT must be between 1 and 65535');
    }

    // Database type validation
    if (!['filesystem', 'postgres'].includes(this.config.database.type)) {
      throw new ConfigError('DATABASE_TYPE must be "filesystem" or "postgres"');
    }

    // Postgres config required if type is postgres
    if (this.config.database.type === 'postgres' && !this.config.database.postgres) {
      throw new ConfigError('DATABASE_URL required when DATABASE_TYPE is "postgres"');
    }

    // Manifest generator type validation
    if (!['cli', 'server'].includes(this.config.manifestGenerator.type)) {
      throw new ConfigError('MANIFEST_GENERATOR must be "cli" or "server"');
    }

    // Log level validation
    if (!['error', 'warn', 'info', 'debug'].includes(this.config.log.level)) {
      throw new ConfigError('LOG_LEVEL must be "error", "warn", "info", or "debug"');
    }

    // Node env validation
    if (!['development', 'production', 'test'].includes(this.config.nodeEnv)) {
      throw new ConfigError('NODE_ENV must be "development", "production", or "test"');
    }
  }

  // Readonly accessors
  get port(): number { return this.config.port; }
  get host(): string { return this.config.host; }
  get serverUrl(): string { return this.config.serverUrl; }
  get dataDir(): string { return this.config.dataDir; }
  get sessionDir(): string { return this.config.sessionDir; }
  get skillsDir(): string { return this.config.skillsDir; }
  get database(): DatabaseConfig { return this.config.database; }
  get manifestGenerator(): ManifestGeneratorConfig { return this.config.manifestGenerator; }
  get cors(): CorsConfig { return this.config.cors; }
  get debug(): boolean { return this.config.debug; }
  get log(): LogConfig { return this.config.log; }
  get nodeEnv(): ConfigOptions['nodeEnv'] { return this.config.nodeEnv; }

  /**
   * Check if running in development mode.
   */
  get isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  /**
   * Check if running in production mode.
   */
  get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  /**
   * Check if running in test mode.
   */
  get isTest(): boolean {
    return this.config.nodeEnv === 'test';
  }

  /**
   * Create a Config instance from an object (useful for testing).
   */
  static fromObject(overrides: Partial<ConfigOptions>): Config {
    const config = new Config();
    Object.assign(config.config, overrides);
    config.validate();
    return config;
  }

  /**
   * Get configuration as plain object.
   */
  toJSON(): ConfigOptions {
    return { ...this.config };
  }

  /**
   * Get a summary string for logging.
   */
  toString(): string {
    return [
      `Config:`,
      `  port: ${this.port}`,
      `  dataDir: ${this.dataDir}`,
      `  sessionDir: ${this.sessionDir}`,
      `  skillsDir: ${this.skillsDir}`,
      `  database.type: ${this.database.type}`,
      `  manifestGenerator.type: ${this.manifestGenerator.type}`,
      `  nodeEnv: ${this.nodeEnv}`,
      `  debug: ${this.debug}`
    ].join('\n');
  }
}
