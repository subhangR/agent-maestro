import { randomBytes } from 'crypto';
import { CollabError } from './types.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

export type InviteKind = 'link' | 'code';

export function generateInviteId(kind: InviteKind): string {
  if (kind === 'link') return randomBytes(32).toString('base64url');
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export function normalizeInviteId(raw: string): string {
  const compact = raw.replace(/[\s-]/g, '');
  // Link ids are URL-safe base64 and may legitimately contain '-'. Only a
  // 12-character human code is separator/case-insensitive.
  return compact.length === CODE_LENGTH ? compact.toUpperCase() : raw;
}

export function isInviteId(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value) || /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(value);
}

export function parseInviteLink(raw: string): { spaceId: string; inviteId: string } {
  let url: URL;
  try { url = new URL(raw); } catch { throw new CollabError('INVITE_NOT_ACCEPTED', 'Invitation was not accepted.'); }
  const match = url.pathname.match(/^\/space\/([A-Za-z0-9_-]{1,128})\/join\/([^/]+)\/?$/);
  if (!match) throw new CollabError('INVITE_NOT_ACCEPTED', 'Invitation was not accepted.');
  const inviteId = normalizeInviteId(decodeURIComponent(match[2]));
  if (!isInviteId(inviteId)) throw new CollabError('INVITE_NOT_ACCEPTED', 'Invitation was not accepted.');
  return { spaceId: match[1], inviteId };
}

export function buildInviteLink(spaceId: string, inviteId: string, origin = 'https://maestro.app'): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(spaceId) || !isInviteId(inviteId)) {
    throw new CollabError('INVALID_INVITE', 'Invalid invitation values.');
  }
  return new URL(`/space/${encodeURIComponent(spaceId)}/join/${encodeURIComponent(inviteId)}`, origin).toString();
}

export function parseDuration(raw: string | undefined): number {
  if (!raw) return 7 * 24 * 60 * 60 * 1000;
  const match = raw.match(/^(\d+)(m|h|d)$/i);
  if (!match) throw new CollabError('INVALID_DURATION', 'Use a duration such as 30m, 24h, or 7d.');
  const count = Number(match[1]);
  const multiplier = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2].toLowerCase() as 'm' | 'h' | 'd'];
  const result = count * multiplier;
  if (!Number.isSafeInteger(result) || result < 60 * 60 * 1000 || result > 30 * 24 * 60 * 60 * 1000) {
    throw new CollabError('INVALID_DURATION', 'Invite expiry must be between one hour and 30 days.');
  }
  return result;
}
