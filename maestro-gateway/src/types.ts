/**
 * Shared types for the Trusted-Team Hub gateway (Design A).
 */

/** Lifecycle status of a per-user maestro-server instance. */
export type InstanceStatus = 'provisioning' | 'starting' | 'live' | 'crashed' | 'stopped';

/**
 * A single per-user maestro-server instance owned by the gateway.
 * One of these exists per Firebase uid. Persisted (minus the live child handle)
 * to the registry file so the gateway can reconcile after a restart.
 */
export interface InstanceHandle {
  uid: string;
  email?: string;
  port: number;
  /** OS pid of the current child process (null when not running). */
  pid: number | null;
  dataDir: string;
  sessionDir: string;
  projectsDir: string;
  status: InstanceStatus;
  /** epoch ms when this instance last transitioned to `live`. */
  startedAt: number | null;
  /** epoch ms when the workspace was first provisioned. */
  provisionedAt: number;
}

/** The subset of an InstanceHandle that is safe/useful to persist. */
export type PersistedInstance = Omit<InstanceHandle, 'pid' | 'status' | 'startedAt'>;

/** Result of verifying a caller's identity at the gateway edge. */
export interface AuthResult {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

/** Safe, server-level view returned by the authenticated gateway dashboard API. */
export interface GatewayMemberOverview {
  email: string;
  uid: string | null;
  workspaceStatus: InstanceStatus | 'not_provisioned';
  liveAgentCount: number;
  runningSessionCount: number;
}

export interface GatewayServerOverview {
  cpuUsagePercent: number | null;
  cpuCores: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  memoryUsedPercent: number;
  runningInstances: number;
  totalInstances: number;
  runningSessionCount: number;
  liveAgentCount: number;
}

/** Thrown by an AuthVerifier when a request must be rejected. */
export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
