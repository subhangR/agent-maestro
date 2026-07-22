import * as fs from 'fs';
import { GatewayConfig } from './config';
import { Logger } from './logger';
import { AuthResult, AuthError } from './types';

/** Normalized identity material extracted from an HTTP request or WS upgrade. */
export interface AuthInput {
  /** Firebase ID token from `Authorization: Bearer <token>` or `?token=`. */
  bearerToken?: string;
  /** Dev-mode identity headers (auth mode 'dev' only). */
  devUid?: string;
  devEmail?: string;
}

export interface AuthVerifier {
  readonly mode: string;
  verify(input: AuthInput): Promise<AuthResult>;
}

/**
 * Email allowlist — only these Google accounts get a workspace (A8). Hot-reloads
 * from a JSON file: `{ "emails": ["a@x.com", ...] }` or a bare `["a@x.com"]`.
 * Missing file → empty list (deny-all when enforced).
 */
export class Allowlist {
  private emails = new Set<string>();
  private mtimeMs = -1;

  constructor(private readonly path: string, private readonly logger: Logger) {
    this.reload();
  }

  private reload(): void {
    try {
      const stat = fs.statSync(this.path);
      if (stat.mtimeMs === this.mtimeMs) return;
      this.mtimeMs = stat.mtimeMs;
      const raw = JSON.parse(fs.readFileSync(this.path, 'utf-8'));
      const list: string[] = Array.isArray(raw) ? raw : Array.isArray(raw?.emails) ? raw.emails : [];
      this.emails = new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean));
      this.logger.info(`allowlist loaded (${this.emails.size} entries)`, { path: this.path });
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        if (this.mtimeMs !== -2) {
          this.logger.warn('allowlist file not found — nobody is allowed until it exists', { path: this.path });
          this.mtimeMs = -2;
        }
      } else {
        this.logger.error('failed to read allowlist', err);
      }
      this.emails = new Set();
    }
  }

  isAllowed(email: string | undefined): boolean {
    this.reload();
    if (!email) return false;
    return this.emails.has(email.trim().toLowerCase());
  }
}

/**
 * DEV auth (M1 / local testing only). Trusts an `x-maestro-uid` header — there is
 * NO cryptographic verification. Never enable behind a public perimeter.
 */
export class DevHeaderAuthVerifier implements AuthVerifier {
  readonly mode = 'dev';
  constructor(private readonly logger: Logger) {}

  async verify(input: AuthInput): Promise<AuthResult> {
    if (!input.devUid) {
      throw new AuthError(401, 'dev auth: missing x-maestro-uid header');
    }
    return {
      uid: input.devUid,
      email: input.devEmail || `${input.devUid}@dev.local`,
      emailVerified: true,
    };
  }
}

/**
 * Production auth — verifies a Firebase ID token via firebase-admin against the
 * Collab project (default maestro-5f3fc), so it's the same Google login as Collab.
 * firebase-admin is loaded lazily so the gateway can run in dev mode without it.
 */
export class FirebaseAuthVerifier implements AuthVerifier {
  readonly mode = 'firebase';
  private auth: any;

  constructor(config: GatewayConfig, private readonly logger: Logger) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let admin: any;
    try {
      admin = require('firebase-admin');
    } catch {
      throw new Error(
        "auth mode 'firebase' requires the firebase-admin package — run `bun install` in maestro-gateway",
      );
    }

    if (admin.apps.length === 0) {
      const credential = config.firebaseCredentials
        ? admin.credential.cert(require(config.firebaseCredentials))
        : admin.credential.applicationDefault();
      admin.initializeApp({ credential, projectId: config.firebaseProjectId });
      this.logger.info('firebase-admin initialized', { projectId: config.firebaseProjectId });
    }
    this.auth = admin.auth();
  }

  async verify(input: AuthInput): Promise<AuthResult> {
    if (!input.bearerToken) {
      throw new AuthError(401, 'missing Firebase ID token');
    }
    try {
      const decoded = await this.auth.verifyIdToken(input.bearerToken, true);
      return {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified === true,
      };
    } catch (err: any) {
      throw new AuthError(401, `invalid Firebase ID token: ${err?.message || 'verification failed'}`);
    }
  }
}

export function createAuthVerifier(config: GatewayConfig, logger: Logger): AuthVerifier {
  return config.authMode === 'firebase'
    ? new FirebaseAuthVerifier(config, logger)
    : new DevHeaderAuthVerifier(logger);
}
