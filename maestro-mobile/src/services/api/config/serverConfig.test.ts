import {
  buildServerConfig,
  deriveWsUrl,
  deriveServerUrl,
  normalizeApiBaseUrl,
  normalizeWsUrl,
} from './serverConfig';

describe('normalizeApiBaseUrl', () => {
  it('appends /api to a bare origin', () => {
    expect(normalizeApiBaseUrl('http://localhost:4569')).toBe('http://localhost:4569/api');
  });

  it('treats a protocol-less host:port as http and appends /api', () => {
    expect(normalizeApiBaseUrl('192.168.1.5:4569')).toBe('http://192.168.1.5:4569/api');
  });

  it('preserves an explicit /api path', () => {
    expect(normalizeApiBaseUrl('http://host:3001/api')).toBe('http://host:3001/api');
  });

  it('strips trailing slashes', () => {
    expect(normalizeApiBaseUrl('http://host:3001/')).toBe('http://host:3001/api');
  });

  it('strips wrapping quotes', () => {
    expect(normalizeApiBaseUrl('"http://host:4569"')).toBe('http://host:4569/api');
  });

  it('returns null for empty/garbage input', () => {
    expect(normalizeApiBaseUrl('')).toBeNull();
    expect(normalizeApiBaseUrl('   ')).toBeNull();
    expect(normalizeApiBaseUrl(null)).toBeNull();
    expect(normalizeApiBaseUrl('ftp://host')).toBeNull();
  });
});

describe('deriveWsUrl', () => {
  it('http → ws, bare origin, no path', () => {
    expect(deriveWsUrl('http://localhost:4569/api')).toBe('ws://localhost:4569');
  });

  it('https → wss', () => {
    expect(deriveWsUrl('https://maestro.example.ts.net/api')).toBe('wss://maestro.example.ts.net');
  });

  it('preserves host + port', () => {
    expect(deriveWsUrl('http://192.168.1.5:3001/api')).toBe('ws://192.168.1.5:3001');
  });

  it('returns null for garbage', () => {
    expect(deriveWsUrl('not a url')).toBeNull();
  });
});

describe('deriveServerUrl', () => {
  it('strips the /api path', () => {
    expect(deriveServerUrl('http://localhost:4569/api')).toBe('http://localhost:4569');
  });

  it('maps ws back to http', () => {
    expect(deriveServerUrl('ws://localhost:4569')).toBe('http://localhost:4569');
  });
});

describe('normalizeWsUrl', () => {
  it('passes ws through with path + search', () => {
    expect(normalizeWsUrl('ws://host:4569/pty?id=abc', 'http://host:4569/api')).toBe(
      'ws://host:4569/pty?id=abc',
    );
  });

  it('converts http → ws', () => {
    expect(normalizeWsUrl('http://host:4569', 'http://host:4569/api')).toBe('ws://host:4569');
  });

  it('falls back to deriving from the api base when raw is unusable', () => {
    expect(normalizeWsUrl('', 'http://host:4569/api')).toBe('ws://host:4569');
  });
});

describe('buildServerConfig', () => {
  it('derives the full bundle from a bare host:port', () => {
    expect(buildServerConfig('192.168.1.5:4569')).toEqual({
      apiBaseUrl: 'http://192.168.1.5:4569/api',
      wsUrl: 'ws://192.168.1.5:4569',
      ptyWsUrl: 'ws://192.168.1.5:4569/pty',
      serverUrl: 'http://192.168.1.5:4569',
    });
  });

  it('derives wss/https for a TLS host (e.g. tailscale serve)', () => {
    expect(buildServerConfig('https://maestro.example.ts.net')).toEqual({
      apiBaseUrl: 'https://maestro.example.ts.net/api',
      wsUrl: 'wss://maestro.example.ts.net',
      ptyWsUrl: 'wss://maestro.example.ts.net/pty',
      serverUrl: 'https://maestro.example.ts.net',
    });
  });

  it('throws on an unparseable host (no localhost default on a phone)', () => {
    expect(() => buildServerConfig('')).toThrow();
    expect(() => buildServerConfig('::::')).toThrow();
  });
});
