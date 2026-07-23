import { parseAuthMode } from './serverConfig';

describe('parseAuthMode', () => {
  it('passes through known modes', () => {
    expect(parseAuthMode('none')).toBe('none');
    expect(parseAuthMode('password')).toBe('password');
    expect(parseAuthMode('firebase')).toBe('firebase');
  });

  it('defaults unknown/missing values to none (back-compat with old servers)', () => {
    expect(parseAuthMode(undefined)).toBe('none');
    expect(parseAuthMode(null)).toBe('none');
    expect(parseAuthMode('bogus')).toBe('none');
    expect(parseAuthMode(42)).toBe('none');
  });
});
