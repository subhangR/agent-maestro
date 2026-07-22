import * as http from 'http';
import { loadConfig } from './config';
import { Logger } from './logger';
import { createAuthVerifier, Allowlist } from './auth';
import { InstanceRegistry } from './registry';
import { SharedCredentialSource, prepareSharedClaudeConfig } from './credentials';
import { InstanceSupervisor } from './supervisor';
import { Proxy } from './proxy';
import { Gateway } from './gateway';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.logFormat);

  logger.info('starting maestro-gateway', {
    port: config.port,
    authMode: config.authMode,
    hubDir: config.hubDir,
    instancePorts: `${config.instancePortStart}-${config.instancePortEnd}`,
    serverEntry: config.serverEntry,
    sharedClaude: config.sharedClaudeConfigDir || '(none)',
  });

  if (config.authMode === 'dev') {
    logger.warn('AUTH MODE = dev — trusting x-maestro-uid header. Do NOT expose beyond loopback/Tailscale.');
  }

  const auth = createAuthVerifier(config, logger);
  const allowlist = new Allowlist(config.allowlistPath, logger);
  const registry = new InstanceRegistry(config, logger);
  const credentials = new SharedCredentialSource(config);

  // Ensure the shared pooled config skips Claude's first-run onboarding wizard.
  prepareSharedClaudeConfig(config, logger);
  const supervisor = new InstanceSupervisor(config, registry, credentials, logger);
  const proxy = new Proxy(logger);
  const gateway = new Gateway(config, logger, auth, allowlist, supervisor, proxy);

  const server = http.createServer(gateway.app);

  // Route /ws and /pty upgrades through the gateway (auth + per-user proxy).
  server.on('upgrade', (req, socket, head) => {
    gateway.handleUpgrade(req, socket as any, head).catch((err) => {
      logger.error('upgrade handler error', err);
      socket.destroy();
    });
  });

  server.listen(config.port, config.host, () => {
    logger.info(`gateway listening on http://${config.host}:${config.port}`);
  });

  // Always-on: re-spawn every known workspace after the listener is up.
  supervisor.reconcileOnBoot().catch((err) => logger.error('reconcileOnBoot failed', err));

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) process.exit(1);
    shuttingDown = true;
    logger.info('shutting down gateway…');
    const force = setTimeout(() => process.exit(1), 8000);
    try {
      await supervisor.shutdown();
      proxy.close();
      server.close(() => {
        clearTimeout(force);
        process.exit(0);
      });
    } catch {
      clearTimeout(force);
      process.exit(1);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('gateway failed to start:', err);
  process.exit(1);
});
