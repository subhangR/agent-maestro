import * as path from 'path';
import * as os from 'os';

/**
 * Where a caller's identity comes from:
 * - 'firebase': verify a Firebase ID token via firebase-admin (production).
 * - 'dev': trust an `x-maestro-uid` header (M1 local testing only; NEVER expose).
 */
export type AuthMode = 'firebase' | 'dev';

export interface GatewayConfig {
  // Gateway HTTP
  port: number;
  host: string;

  // Where per-user workspaces live: ~/hub/<uid>/{data,sessions,projects}
  hubDir: string;
  registryPath: string;
  allowlistPath: string;

  // Per-user instance port range
  instancePortStart: number;
  instancePortEnd: number;

  // How to launch a per-user maestro-server instance
  serverEntry: string;   // path to maestro-server/dist/server.js
  serverCwd: string;     // cwd for the child (repo root — resolves node_modules)
  nodeBin: string;       // 'node'

  // Browser SPA (maestro-ui/dist) served by the gateway
  uiDistPath: string;

  // Identity
  authMode: AuthMode;
  firebaseProjectId: string;
  /** Path to a firebase-admin service-account JSON (falls back to GOOGLE_APPLICATION_CREDENTIALS / ADC). */
  firebaseCredentials?: string;
  /** When true, allowlist is enforced; when false, any verified identity is admitted. */
  enforceAllowlist: boolean;

  // Shared pooled credentials injected into every instance (A10)
  sharedClaudeConfigDir?: string;
  sharedCodexHome?: string;
  /** Extra fixed env injected into every instance (comma KV: A=1,B=2). */
  extraInstanceEnv: Record<string, string>;

  // Lifecycle
  alwaysOn: boolean;
  healthTimeoutMs: number;
  restartBackoffMinMs: number;
  restartBackoffMaxMs: number;

  // Logging
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logFormat: 'json' | 'pretty';
}

function expand(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function parseKV(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  (raw || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  });
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const hubDir = expand(env.MAESTRO_HUB_DIR || '~/hub');
  const port = parseInt(env.MAESTRO_GATEWAY_PORT || '4580', 10);

  // Default the server entry relative to this package: ../maestro-server/dist/server.js
  const defaultServerEntry = path.resolve(__dirname, '../../maestro-server/dist/server.js');
  const serverEntry = env.MAESTRO_SERVER_ENTRY ? expand(env.MAESTRO_SERVER_ENTRY) : defaultServerEntry;
  // Repo root = two levels up from maestro-server/dist/server.js
  const serverCwd = env.MAESTRO_SERVER_CWD
    ? expand(env.MAESTRO_SERVER_CWD)
    : path.resolve(path.dirname(serverEntry), '../..');

  const uiDistPath = env.MAESTRO_UI_DIST
    ? expand(env.MAESTRO_UI_DIST)
    : path.resolve(serverCwd, 'maestro-ui/dist');

  return {
    port,
    host: env.MAESTRO_GATEWAY_HOST || '127.0.0.1',

    hubDir,
    registryPath: env.MAESTRO_REGISTRY_PATH ? expand(env.MAESTRO_REGISTRY_PATH) : path.join(hubDir, 'registry.json'),
    allowlistPath: env.MAESTRO_ALLOWLIST_PATH ? expand(env.MAESTRO_ALLOWLIST_PATH) : path.join(hubDir, 'allowlist.json'),

    instancePortStart: parseInt(env.MAESTRO_INSTANCE_PORT_START || '4600', 10),
    instancePortEnd: parseInt(env.MAESTRO_INSTANCE_PORT_END || '4699', 10),

    serverEntry,
    serverCwd,
    nodeBin: env.MAESTRO_NODE_BIN || 'node',

    uiDistPath,

    authMode: (env.MAESTRO_GATEWAY_AUTH as AuthMode) || 'dev',
    firebaseProjectId: env.MAESTRO_FIREBASE_PROJECT_ID || 'maestro-5f3fc',
    firebaseCredentials: env.MAESTRO_FIREBASE_CREDENTIALS ? expand(env.MAESTRO_FIREBASE_CREDENTIALS) : undefined,
    enforceAllowlist: env.MAESTRO_ENFORCE_ALLOWLIST !== 'false',

    sharedClaudeConfigDir: env.CLAUDE_CONFIG_DIR ? expand(env.CLAUDE_CONFIG_DIR) : undefined,
    sharedCodexHome: env.CODEX_HOME ? expand(env.CODEX_HOME) : undefined,
    extraInstanceEnv: parseKV(env.MAESTRO_INSTANCE_ENV),

    alwaysOn: env.MAESTRO_ALWAYS_ON !== 'false',
    healthTimeoutMs: parseInt(env.MAESTRO_HEALTH_TIMEOUT_MS || '15000', 10),
    restartBackoffMinMs: parseInt(env.MAESTRO_RESTART_BACKOFF_MIN_MS || '1000', 10),
    restartBackoffMaxMs: parseInt(env.MAESTRO_RESTART_BACKOFF_MAX_MS || '30000', 10),

    logLevel: (env.LOG_LEVEL as GatewayConfig['logLevel']) || 'info',
    logFormat: (env.LOG_FORMAT as GatewayConfig['logFormat']) || 'pretty',
  };
}
