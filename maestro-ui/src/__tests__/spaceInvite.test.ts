import { describe, expect, it, vi } from 'vitest';
import {
  buildInviteLink,
  generateInviteId,
  isInviteId,
  normalizeInviteId,
  openCollabForInviteDeepLink,
  parseInviteLink,
  resolveInvitePublicUrl,
} from '../firebase/spaceInvite';

describe('private space invite helpers', () => {
  it('generates opaque, URL-safe link ids and human-friendly codes', () => {
    const link = generateInviteId('link');
    const code = generateInviteId('code');
    expect(link).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
    expect(isInviteId(link)).toBe(true);
    expect(isInviteId(code)).toBe(true);
  });

  it('normalizes join-code spacing/case without modifying case-sensitive link ids', () => {
    expect(normalizeInviteId('ab2-cd3 ef4-gh5')).toBe('AB2CD3EF4GH5');
    expect(normalizeInviteId('aBcDeFgHiJkLmNoPqRsTuVwXyZ_1234567890abcd')).toBe(
      'aBcDeFgHiJkLmNoPqRsTuVwXyZ_1234567890abcd',
    );
  });

  it('emits the CLI-compatible path route and accepts legacy query links during migration', () => {
    const link = buildInviteLink('space_1', 'A'.repeat(43), 'https://app.example');
    expect(link).toBe('https://app.example/space/space_1/join/' + 'A'.repeat(43));
    expect(parseInviteLink(link)).toEqual({ spaceId: 'space_1', inviteId: 'A'.repeat(43) });
    expect(parseInviteLink('https://app.example/space/space_1/join?invite=' + 'A'.repeat(43))).toEqual({
      spaceId: 'space_1', inviteId: 'A'.repeat(43),
    });
    expect(parseInviteLink('https://app.example/space/space_1/join?invite=tiny')).toBeNull();
    expect(parseInviteLink('https://app.example/space/space_1/not-join?invite=' + 'A'.repeat(43))).toBeNull();
    expect(parseInviteLink('https://app.example/space/space_1/join/' + encodeURIComponent('A'.repeat(43) + '/x'))).toBeNull();
  });

  it('uses the configured public browser URL, then an http browser origin, never a desktop scheme', () => {
    expect(resolveInvitePublicUrl('https://collab.example/team', {
      origin: 'https://ignored.example', protocol: 'https:',
    })).toBe('https://collab.example');
    expect(resolveInvitePublicUrl(undefined, {
      origin: 'http://localhost:4570', protocol: 'http:',
    })).toBe('http://localhost:4570');
    expect(resolveInvitePublicUrl('tauri://localhost', {
      origin: 'tauri://localhost', protocol: 'tauri:',
    })).toBe('https://maestro.app');
  });

  it('opens the Collab panel only for a valid SPA invite route', () => {
    const open = vi.fn();
    expect(openCollabForInviteDeepLink(
      'https://collab.example/space/space_1/join/' + 'A'.repeat(43),
      open,
    )).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(openCollabForInviteDeepLink('https://collab.example/space/space_1', open)).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('uses cryptographic randomness rather than Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    generateInviteId('link');
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
