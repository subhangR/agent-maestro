import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { GatewayConfig } from './config';
import { Logger } from './logger';
import { InstanceHandle, PersistedInstance } from './types';

/**
 * Owns the uid → instance mapping and per-user port allocation. Persists the
 * durable subset to registry.json (atomic write) so a gateway restart can
 * re-adopt every workspace (always-on model). The live child process handles
 * live in the InstanceSupervisor, not here.
 */
export class InstanceRegistry {
  private byUid = new Map<string, InstanceHandle>();

  constructor(private readonly config: GatewayConfig, private readonly logger: Logger) {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.config.registryPath, 'utf-8'));
      const list: PersistedInstance[] = Array.isArray(raw?.instances) ? raw.instances : [];
      for (const p of list) {
        this.byUid.set(p.uid, {
          ...p,
          pid: null,
          status: 'stopped',
          startedAt: null,
        });
      }
      this.logger.info(`registry loaded (${this.byUid.size} workspaces)`, { path: this.config.registryPath });
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.error('failed to load registry', err);
    }
  }

  private persist(): void {
    const instances: PersistedInstance[] = [...this.byUid.values()].map((h) => ({
      uid: h.uid,
      email: h.email,
      port: h.port,
      dataDir: h.dataDir,
      sessionDir: h.sessionDir,
      projectsDir: h.projectsDir,
      provisionedAt: h.provisionedAt,
    }));
    const payload = JSON.stringify({ version: 1, instances }, null, 2);
    const dir = path.dirname(this.config.registryPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.config.registryPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, payload, 'utf-8');
    fs.renameSync(tmp, this.config.registryPath);
  }

  get(uid: string): InstanceHandle | undefined {
    return this.byUid.get(uid);
  }

  list(): InstanceHandle[] {
    return [...this.byUid.values()];
  }

  /** Create a fresh handle for a new uid (allocates a port + workspace paths). */
  create(uid: string, email: string | undefined, now: number): InstanceHandle {
    const port = this.allocatePort();
    const base = path.join(this.config.hubDir, uid);
    const handle: InstanceHandle = {
      uid,
      email,
      port,
      pid: null,
      dataDir: path.join(base, 'data'),
      sessionDir: path.join(base, 'sessions'),
      projectsDir: path.join(base, 'projects'),
      status: 'provisioning',
      startedAt: null,
      provisionedAt: now,
    };
    this.byUid.set(uid, handle);
    this.persist();
    return handle;
  }

  /** Mutate a handle in place and re-persist the durable subset. */
  update(uid: string, patch: Partial<InstanceHandle>): InstanceHandle | undefined {
    const h = this.byUid.get(uid);
    if (!h) return undefined;
    Object.assign(h, patch);
    // Only durable fields changed → persist; live fields (pid/status) are cheap to skip
    if ('port' in patch || 'email' in patch || 'dataDir' in patch || 'projectsDir' in patch) {
      this.persist();
    }
    return h;
  }

  private allocatePort(): number {
    const used = new Set([...this.byUid.values()].map((h) => h.port));
    for (let p = this.config.instancePortStart; p <= this.config.instancePortEnd; p++) {
      if (!used.has(p)) return p;
    }
    throw new Error(
      `no free instance port in range ${this.config.instancePortStart}-${this.config.instancePortEnd} (all ${used.size} in use)`,
    );
  }
}

/** Best-effort check that a TCP port is currently free to bind on the host. */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}
