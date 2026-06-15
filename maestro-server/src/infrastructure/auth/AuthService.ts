import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry {
  failures: number;
  lockedUntil?: number;
}

export class AuthService {
  private secret: Buffer;
  private password: string;
  private rateLimitMap = new Map<string, RateLimitEntry>();
  private authEnabled: boolean;

  constructor(dataDir: string) {
    this.authEnabled = process.env.MAESTRO_AUTH_ENABLED === 'true';

    if (this.authEnabled) {
      const password = process.env.MAESTRO_AUTH_PASSWORD;
      if (!password) {
        throw new Error(
          '[Auth] MAESTRO_AUTH_ENABLED is true but MAESTRO_AUTH_PASSWORD is not set. Refusing to start.'
        );
      }
      this.password = password;
      this.secret = this.loadOrGenerateSecret(dataDir);
    } else {
      this.password = '';
      this.secret = Buffer.alloc(32);
    }
  }

  get enabled(): boolean {
    return this.authEnabled;
  }

  private loadOrGenerateSecret(dataDir: string): Buffer {
    const secretEnv = process.env.MAESTRO_AUTH_SECRET;
    if (secretEnv) {
      return Buffer.from(secretEnv, 'utf8');
    }

    const secretPath = join(dataDir, '.auth-secret');
    if (existsSync(secretPath)) {
      const hex = readFileSync(secretPath, 'utf8').trim();
      return Buffer.from(hex, 'hex');
    }

    const secret = randomBytes(32);
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(secretPath, secret.toString('hex'), { mode: 0o600 });
    return secret;
  }

  verifyPassword(input: string): boolean {
    const expected = Buffer.from(this.password);
    const actual = Buffer.from(input);
    // Always run a comparison of the same length to avoid timing leaks
    const padded = Buffer.alloc(Math.max(expected.length, actual.length));
    actual.copy(padded);
    const paddedExpected = Buffer.alloc(Math.max(expected.length, actual.length));
    expected.copy(paddedExpected);
    const match = timingSafeEqual(paddedExpected, padded);
    return match && expected.length === actual.length;
  }

  issueToken(): string {
    const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  verifyToken(token: string): boolean {
    try {
      const dotIdx = token.indexOf('.');
      if (dotIdx === -1) return false;
      const payload = token.slice(0, dotIdx);
      const sig = token.slice(dotIdx + 1);
      if (!payload || !sig) return false;

      const expectedSig = createHmac('sha256', this.secret).update(payload).digest('base64url');
      const expectedBuf = Buffer.from(expectedSig);
      const actualBuf = Buffer.from(sig);
      if (expectedBuf.length !== actualBuf.length) return false;
      if (!timingSafeEqual(expectedBuf, actualBuf)) return false;

      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return typeof data.exp === 'number' && Math.floor(Date.now() / 1000) < data.exp;
    } catch {
      return false;
    }
  }

  checkRateLimit(ip: string): boolean {
    const entry = this.rateLimitMap.get(ip);
    if (!entry) return true;
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) return false;
    return true;
  }

  recordFailure(ip: string): void {
    const entry = this.rateLimitMap.get(ip) || { failures: 0 };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = Date.now() + LOCKOUT_WINDOW_MS;
      entry.failures = 0;
    }
    this.rateLimitMap.set(ip, entry);
  }

  recordSuccess(ip: string): void {
    this.rateLimitMap.delete(ip);
  }

  extractTokenFromCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('maestro_auth=')) {
        return trimmed.slice('maestro_auth='.length);
      }
    }
    return null;
  }
}
