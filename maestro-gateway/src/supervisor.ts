import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { GatewayConfig } from './config';
import { Logger } from './logger';
import { InstanceRegistry } from './registry';
import { CredentialSource } from './credentials';
import { InstanceHandle } from './types';

/**
 * Spawns and owns one maestro-server child process per user (Design A, A4).
 *
 * The server is unchanged: it reads PORT/DATA_DIR/SESSION_DIR from env at boot,
 * so a per-user instance is just the same binary with different env + the shared
 * pooled credential dir injected. Instances bind loopback and run with auth
 * disabled — the gateway is the sole authenticator, and only it can reach them.
 */
export class InstanceSupervisor {
  private children = new Map<string, ChildProcess>();
  private starting = new Map<string, Promise<InstanceHandle>>();
  private intentionalStop = new Set<string>();
  private restartAttempts = new Map<string, number>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly registry: InstanceRegistry,
    private readonly credentials: CredentialSource,
    private readonly logger: Logger,
  ) {}

  /** Base URL to reach a user's instance over loopback. */
  targetFor(handle: InstanceHandle): string {
    return `http://127.0.0.1:${handle.port}`;
  }

  /** All known workspaces (for status/health). */
  listWorkspaces(): InstanceHandle[] {
    return this.registry.list();
  }

  /**
   * Summary of a member's active sessions. Reading the instance's session DTO
   * keeps the dashboard at the gateway boundary; it never reads user files.
   */
  async sessionCounts(handle: InstanceHandle): Promise<{ liveAgentCount: number; runningSessionCount: number }> {
    if (handle.status !== 'live') return { liveAgentCount: 0, runningSessionCount: 0 };
    try {
      const res = await fetch(`${this.targetFor(handle)}/api/sessions?status=spawning,idle,working`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return { liveAgentCount: 0, runningSessionCount: 0 };
      const sessions: unknown = await res.json();
      if (!Array.isArray(sessions)) return { liveAgentCount: 0, runningSessionCount: 0 };
      return {
        // "Live agent" means it is actively starting or doing work. Idle PTYs
        // remain part of the running-session total but do not inflate this number.
        liveAgentCount: sessions.filter((session: any) => session?.status === 'spawning' || session?.status === 'working').length,
        runningSessionCount: sessions.length,
      };
    } catch {
      // A transient count failure must not make the dashboard unavailable.
      return { liveAgentCount: 0, runningSessionCount: 0 };
    }
  }

  /**
   * Guarantee uid's instance is running, provisioning the workspace on first
   * sight. Concurrent callers for the same uid share one start promise.
   */
  async ensure(uid: string, email?: string): Promise<InstanceHandle> {
    const existing = this.registry.get(uid);
    if (existing && existing.status === 'live' && this.children.has(uid)) {
      return existing;
    }
    const inFlight = this.starting.get(uid);
    if (inFlight) return inFlight;

    const p = this.startInstance(uid, email).finally(() => this.starting.delete(uid));
    this.starting.set(uid, p);
    return p;
  }

  private async startInstance(uid: string, email?: string): Promise<InstanceHandle> {
    let handle = this.registry.get(uid);
    if (!handle) {
      handle = this.registry.create(uid, email, Date.now());
      this.logger.info(`provisioning new workspace for uid=${uid}`, { port: handle.port });
    }
    this.provisionDirs(handle);

    const isFirstBoot = !fs.existsSync(handle.dataDir) || this.isEmptyDir(handle.dataDir);

    this.registry.update(uid, { status: 'starting' });
    this.intentionalStop.delete(uid);
    this.spawnChild(handle);

    const ok = await this.waitForHealth(handle);
    if (!ok) {
      this.registry.update(uid, { status: 'crashed' });
      throw new Error(`instance for uid=${uid} failed health check on port ${handle.port}`);
    }
    this.registry.update(uid, { status: 'live', startedAt: Date.now() });
    this.restartAttempts.delete(uid);
    this.logger.info(`instance live uid=${uid}`, { port: handle.port, pid: handle.pid });

    if (isFirstBoot) {
      await this.seedDefaultProject(handle).catch((err) =>
        this.logger.warn(`default-project seed failed for uid=${uid} (non-fatal)`, err),
      );
    }
    return handle;
  }

  private provisionDirs(handle: InstanceHandle): void {
    for (const d of [handle.dataDir, handle.sessionDir, handle.projectsDir]) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  private isEmptyDir(dir: string): boolean {
    try {
      return fs.readdirSync(dir).length === 0;
    } catch {
      return true;
    }
  }

  private spawnChild(handle: InstanceHandle): void {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(handle.port),
      HOST: '127.0.0.1',
      NODE_ENV: process.env.NODE_ENV || 'production',
      MAESTRO_PTY_HOST: 'server',
      MAESTRO_AUTH_ENABLED: 'false', // gateway is the sole authenticator (loopback-trusted)
      DATA_DIR: handle.dataDir,
      SESSION_DIR: handle.sessionDir,
      SERVER_URL: `http://127.0.0.1:${handle.port}`,
      ...this.credentials.resolve(handle.uid),
      ...this.config.extraInstanceEnv,
    };

    const child = spawn(this.config.nodeBin, [this.config.serverEntry], {
      cwd: this.config.serverCwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    handle.pid = child.pid ?? null;
    this.children.set(handle.uid, child);

    const tag = `inst:${handle.uid}`;
    child.stdout?.on('data', (b) => this.logger.debug(`[${tag}] ${b.toString().trimEnd()}`));
    child.stderr?.on('data', (b) => this.logger.warn(`[${tag}] ${b.toString().trimEnd()}`));

    child.on('exit', (code, signal) => {
      this.children.delete(handle.uid);
      handle.pid = null;
      if (this.intentionalStop.has(handle.uid)) {
        this.registry.update(handle.uid, { status: 'stopped' });
        this.logger.info(`instance stopped uid=${handle.uid}`);
        return;
      }
      this.registry.update(handle.uid, { status: 'crashed' });
      this.logger.error(`instance exited uid=${handle.uid}`, { code, signal });
      if (this.config.alwaysOn) this.scheduleRestart(handle.uid);
    });
  }

  private scheduleRestart(uid: string): void {
    const attempt = (this.restartAttempts.get(uid) || 0) + 1;
    this.restartAttempts.set(uid, attempt);
    const delay = Math.min(
      this.config.restartBackoffMinMs * 2 ** (attempt - 1),
      this.config.restartBackoffMaxMs,
    );
    this.logger.warn(`scheduling restart uid=${uid} in ${delay}ms (attempt ${attempt})`);
    setTimeout(() => {
      if (this.intentionalStop.has(uid)) return;
      this.startInstance(uid).catch((err) => this.logger.error(`restart failed uid=${uid}`, err));
    }, delay);
  }

  private async waitForHealth(handle: InstanceHandle): Promise<boolean> {
    const deadline = Date.now() + this.config.healthTimeoutMs;
    const url = `${this.targetFor(handle)}/health`;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (res.ok) return true;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }

  private async seedDefaultProject(handle: InstanceHandle): Promise<void> {
    const res = await fetch(`${this.targetFor(handle)}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My Workspace', workingDir: handle.projectsDir }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`seed POST /api/projects → ${res.status}`);
    this.logger.info(`seeded default project uid=${handle.uid}`, { workingDir: handle.projectsDir });
  }

  /** On gateway boot, re-spawn every known workspace (always-on model, A3). */
  async reconcileOnBoot(): Promise<void> {
    if (!this.config.alwaysOn) return;
    const all = this.registry.list();
    this.logger.info(`reconciling ${all.length} workspaces on boot`);
    await Promise.allSettled(all.map((h) => this.ensure(h.uid, h.email)));
  }

  stop(uid: string): void {
    const child = this.children.get(uid);
    if (!child) return;
    this.intentionalStop.add(uid);
    child.kill('SIGTERM');
  }

  async shutdown(): Promise<void> {
    for (const [uid, child] of this.children) {
      this.intentionalStop.add(uid);
      child.kill('SIGTERM');
    }
  }
}
