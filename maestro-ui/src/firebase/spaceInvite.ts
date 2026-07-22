import { CollabSpaceInviteKind } from './collabSpaceTypes';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINK_BYTES = 32;
const CODE_LENGTH = 12;
/**
 * Used only when a desktop shell has no browser origin. Deployments should set
 * VITE_MAESTRO_PUBLIC_URL to their public browser app URL.
 */
const DESKTOP_INVITE_FALLBACK_ORIGIN = 'https://maestro.app';

export type ParsedCollabInvite = {
  spaceId: string;
  inviteId: string;
};

/** Generates a cryptographically strong opaque Firestore document id. */
export function generateInviteId(kind: CollabSpaceInviteKind): string {
  const bytes = new Uint8Array(kind === 'link' ? LINK_BYTES : CODE_LENGTH);
  crypto.getRandomValues(bytes);
  if (kind === 'code') {
    return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  }
  return bytesToBase64Url(bytes);
}

/** Normalizes a human-entered code without changing its entropy or meaning. */
export function normalizeInviteCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/** Keeps URL tokens case-sensitive while making human-entered codes forgiving. */
export function normalizeInviteId(value: string): string {
  const compact = value.replace(/[\s-]/g, '');
  return compact.length === CODE_LENGTH ? normalizeInviteCode(compact) : compact;
}

export function isInviteId(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(value) || /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(value);
}

/**
 * Resolve a public browser URL without leaking Tauri/custom-scheme origins
 * into share links. Vite injects VITE_MAESTRO_PUBLIC_URL at build time.
 */
export function resolveInvitePublicUrl(
  configuredPublicUrl = import.meta.env.VITE_MAESTRO_PUBLIC_URL,
  browserLocation: Pick<Location, 'origin' | 'protocol'> | null =
    typeof window === 'undefined' ? null : window.location,
): string {
  const configured = asHttpOrigin(configuredPublicUrl);
  if (configured) return configured;
  if (browserLocation && (browserLocation.protocol === 'https:' || browserLocation.protocol === 'http:')) {
    return browserLocation.origin;
  }
  return DESKTOP_INVITE_FALLBACK_ORIGIN;
}

/** A stable browser route; desktop recipients can paste the same URL in Collab. */
export function buildInviteLink(
  spaceId: string,
  inviteId: string,
  baseUrl = resolveInvitePublicUrl(),
): string {
  return new URL(
    '/space/' + encodeURIComponent(spaceId) + '/join/' + encodeURIComponent(inviteId),
    baseUrl,
  ).toString();
}

/**
 * Parses the canonical CLI path route and the legacy query route emitted by
 * early desktop builds, so already-shared links keep working during rollout.
 */
export function parseInviteLink(raw: string): ParsedCollabInvite | null {
  try {
    const url = new URL(raw, currentAppOrigin());
    const pathMatch = url.pathname.match(/^\/space\/([^/]+)\/join\/([^/]+)\/?$/);
    const legacyMatch = url.pathname.match(/^\/space\/([^/]+)\/join\/?$/);
    const match = pathMatch ?? legacyMatch;
    const inviteId = pathMatch?.[2] ?? url.searchParams.get('invite');
    if (!match || !inviteId || !isInviteId(inviteId)) return null;
    const spaceId = decodeURIComponent(match[1]);
    return spaceId && /^[A-Za-z0-9_-]{1,128}$/.test(spaceId) ? { spaceId, inviteId } : null;
  } catch {
    return null;
  }
}

/** Shared by AppLeftPanel's startup effect and focused deep-link tests. */
export function openCollabForInviteDeepLink(rawUrl: string, openCollab: () => void): boolean {
  if (!parseInviteLink(rawUrl)) return false;
  openCollab();
  return true;
}

function currentAppOrigin(): string {
  return typeof window === 'undefined' ? 'https://maestro.app' : window.location.origin;
}

function asHttpOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
