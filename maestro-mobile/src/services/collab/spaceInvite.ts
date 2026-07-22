// src/services/collab/spaceInvite.ts — invite id generation + link parsing,
// kept wire-compatible with maestro-ui/src/firebase/spaceInvite.ts and the CLI so
// a link/code minted anywhere redeems everywhere. The invite id IS the bearer
// secret (never stored plaintext in a field), so it must be unguessable.
import { CollabSpaceInviteKind } from './types';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no ambiguous 0/o/1/l
const LINK_ID_LEN = 24;
const CODE_ID_LEN = 10;

function randomId(len: number): string {
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function generateInviteId(kind: CollabSpaceInviteKind): string {
  return randomId(kind === 'code' ? CODE_ID_LEN : LINK_ID_LEN);
}

/** Normalizes user-typed codes (trim, lowercase, strip separators/spaces). */
export function normalizeInviteId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '');
}

export function isInviteId(id: string): boolean {
  const n = normalizeInviteId(id);
  return n.length >= CODE_ID_LEN && [...n].every((c) => ALPHABET.includes(c));
}

/**
 * Builds a shareable deep link. Uses the https universal-link host desktop/web
 * emit so one link opens the app (if installed) or the web join page.
 */
export function buildInviteLink(spaceId: string, inviteId: string): string {
  return `https://maestro.dev/space/${spaceId}/join/${inviteId}`;
}

export interface ParsedInvite {
  spaceId: string;
  inviteId: string;
}

/**
 * Parses a full invite link (https or maestro:// scheme) into its parts.
 * Returns null for anything that isn't a recognizable /space/:id/join/:invite.
 */
export function parseInviteLink(input: string): ParsedInvite | null {
  const raw = input.trim();
  const match = raw.match(/space\/([^/\s?#]+)\/join\/([^/\s?#]+)/i);
  if (!match || !match[1] || !match[2]) return null;
  const spaceId = match[1];
  const inviteId = normalizeInviteId(match[2]);
  if (!spaceId || !isInviteId(inviteId)) return null;
  return { spaceId, inviteId };
}
