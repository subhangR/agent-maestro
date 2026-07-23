import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { dirname, join } from 'path';
import { CollabError } from './types.js';

const SERVICE = 'maestro-collab';
const fallbackPath = join(homedir(), '.maestro', 'collab', 'tokens.enc');

function account(profile: string): string { return `profile:${profile}`; }

function nativeRead(profile: string): string | null {
  try {
    if (platform() === 'darwin') return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', account(profile), '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    if (platform() === 'linux') return execFileSync('secret-tool', ['lookup', 'service', SERVICE, 'account', account(profile)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { /* fall through */ }
  return null;
}

function nativeWrite(profile: string, value: string): boolean {
  try {
    if (platform() === 'darwin') {
      execFileSync('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account(profile), '-w', value], { stdio: 'ignore' });
      return true;
    }
    if (platform() === 'linux') {
      execFileSync('secret-tool', ['store', '--label=Maestro Collab token', 'service', SERVICE, 'account', account(profile)], { input: value, stdio: ['pipe', 'ignore', 'ignore'] });
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

function nativeDelete(profile: string): boolean {
  try {
    if (platform() === 'darwin') { execFileSync('security', ['delete-generic-password', '-s', SERVICE, '-a', account(profile)], { stdio: 'ignore' }); return true; }
    if (platform() === 'linux') { execFileSync('secret-tool', ['clear', 'service', SERVICE, 'account', account(profile)], { stdio: 'ignore' }); return true; }
  } catch { return false; }
  return false;
}

function key(): Buffer {
  const raw = process.env.MAESTRO_COLLAB_TOKEN_STORE_KEY;
  if (!raw) throw new CollabError('COLLAB_CREDENTIAL_STORE_UNAVAILABLE', 'No OS credential store is available. Set MAESTRO_COLLAB_TOKEN_STORE_KEY to explicitly enable encrypted file fallback.');
  return createHash('sha256').update(raw, 'utf8').digest();
}

function fallbackReadAll(): Record<string, string> {
  if (!existsSync(fallbackPath)) return {};
  try {
    const payload = JSON.parse(readFileSync(fallbackPath, 'utf8')) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(payload.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]).toString('utf8'));
  } catch (err) {
    if (err instanceof CollabError) throw err;
    throw new CollabError('COLLAB_CREDENTIAL_STORE_UNAVAILABLE', 'Encrypted Collab credential store cannot be read.');
  }
}

function fallbackWriteAll(values: Record<string, string>): void {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);
  const payload = JSON.stringify({ iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: encrypted.toString('base64url') });
  mkdirSync(dirname(fallbackPath), { recursive: true, mode: 0o700 });
  const temp = `${fallbackPath}.${process.pid}.tmp`;
  writeFileSync(temp, payload, { mode: 0o600 });
  renameSync(temp, fallbackPath);
}

export function getRefreshToken(profile: string): string | null {
  const native = nativeRead(profile);
  if (native) return native;
  if (process.platform === 'win32' && !process.env.MAESTRO_COLLAB_TOKEN_STORE_KEY) {
    throw new CollabError('COLLAB_CREDENTIAL_STORE_UNAVAILABLE', 'Windows Credential Manager integration is not available in this build. Set MAESTRO_COLLAB_TOKEN_STORE_KEY to explicitly enable encrypted file fallback.');
  }
  return process.env.MAESTRO_COLLAB_TOKEN_STORE_KEY ? fallbackReadAll()[profile] || null : null;
}

export function saveRefreshToken(profile: string, refreshToken: string): void {
  if (!refreshToken) throw new CollabError('COLLAB_AUTH_FAILED', 'Authentication returned no refresh token.');
  if (!nativeWrite(profile, refreshToken)) {
    if (process.platform === 'win32' && !process.env.MAESTRO_COLLAB_TOKEN_STORE_KEY) {
      throw new CollabError('COLLAB_CREDENTIAL_STORE_UNAVAILABLE', 'Windows Credential Manager integration is not available in this build. Set MAESTRO_COLLAB_TOKEN_STORE_KEY to explicitly enable encrypted file fallback.');
    }
    const values = fallbackReadAll();
    values[profile] = refreshToken;
    fallbackWriteAll(values);
  }
}

export function eraseRefreshToken(profile: string): void {
  const deleted = nativeDelete(profile);
  if (!deleted && process.env.MAESTRO_COLLAB_TOKEN_STORE_KEY) {
    const values = fallbackReadAll();
    delete values[profile];
    fallbackWriteAll(values);
  }
  // A missing credential is a successful logout; do not expose token-store details.
  if (existsSync(fallbackPath) && process.env.MAESTRO_COLLAB_TOKEN_STORE_KEY) {
    const values = fallbackReadAll();
    if (Object.keys(values).length === 0) { try { unlinkSync(fallbackPath); } catch { /* best effort */ } }
  }
}
