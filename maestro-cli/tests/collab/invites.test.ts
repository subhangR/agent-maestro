import { describe, expect, it } from 'vitest';
import { buildInviteLink, generateInviteId, isInviteId, normalizeInviteId, parseDuration, parseInviteLink } from '../../src/collab/invites.js';
import { redactValues } from '../../src/services/command-tracker.js';

describe('Collab invite capabilities', () => {
  it('creates and parses only the path-based private route', () => {
    const id = generateInviteId('link');
    const link = buildInviteLink('space_1', id, 'https://app.example');
    expect(link).toBe(`https://app.example/space/space_1/join/${id}`);
    expect(parseInviteLink(link)).toEqual({ spaceId: 'space_1', inviteId: id });
    expect(() => parseInviteLink(`https://app.example/space/space_1/join?invite=${id}`)).toThrow('Invitation was not accepted');
  });

  it('uses 256-bit links and normalizes only human codes', () => {
    const link = generateInviteId('link');
    expect(link).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isInviteId(link)).toBe(true);
    expect(normalizeInviteId('ab2-cd3 ef4-gh5')).toBe('AB2CD3EF4GH5');
  });

  it('bounds invite expiry to the policy range', () => {
    expect(parseDuration(undefined)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000);
    expect(() => parseDuration('31d')).toThrow('between one hour and 30 days');
  });

  it('redacts codes and path-based bearer links before command tracking', () => {
    const id = generateInviteId('link');
    expect(redactValues(['collab', 'join', buildInviteLink('space_1', id)])).toEqual(['collab', 'join', '***']);
    expect(redactValues(['collab', 'join', '--code', 'AB2CD3EF4GH5'])).toEqual(['collab', 'join', '--code', '***']);
  });
});
