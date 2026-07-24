import express from 'express';
import supertest from 'supertest';
import { createSecurityHeaders } from '../src/api/middleware/securityHeaders';

describe('browser security headers', () => {
  it('keeps cross-origin auth popups connected to the SPA opener', async () => {
    const app = express();
    app.use(createSecurityHeaders());
    app.get('/', (_req, res) => res.send('ok'));

    const response = await supertest(app).get('/').expect(200);

    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
  });

  it('retains the Firebase and Google CSP allowlist', async () => {
    const app = express();
    app.use(createSecurityHeaders());
    app.get('/', (_req, res) => res.send('ok'));

    const response = await supertest(app).get('/').expect(200);
    const csp = response.headers['content-security-policy'];

    expect(csp).toContain('https://identitytoolkit.googleapis.com');
    expect(csp).toContain('https://accounts.google.com');
    expect(csp).toContain('https://*.firebaseapp.com');
    expect(csp).toMatch(/script-src[^;]*https:\/\/accounts\.google\.com/);
  });

  it('ships an explicit CSP (never disables it) and covers the web UI needs', async () => {
    const app = express();
    app.use(createSecurityHeaders());
    app.get('/', (_req, res) => res.send('ok'));

    const response = await supertest(app).get('/').expect(200);
    const csp = response.headers['content-security-policy'];

    expect(csp).toBeDefined();
    // Same-origin + any-host WebSocket for /ws and /pty.
    expect(csp).toContain('ws:');
    expect(csp).toContain('wss:');
    // xterm.js / Monaco inline styles and blob workers.
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('worker-src \'self\' blob:');
    // data:/blob: images and fonts.
    expect(csp).toMatch(/img-src[^;]*data:/);
    expect(csp).toMatch(/img-src[^;]*blob:/);
    expect(csp).toMatch(/font-src[^;]*data:/);
  });

  it('folds MAESTRO_ALLOWED_ORIGINS-derived origins (and their ws/wss equivalents) into connect-src', async () => {
    const app = express();
    app.use(createSecurityHeaders(['https://maestro.example.com', 'http://100.64.0.1:4567']));
    app.get('/', (_req, res) => res.send('ok'));

    const response = await supertest(app).get('/').expect(200);
    const csp = response.headers['content-security-policy'];

    expect(csp).toContain('https://maestro.example.com');
    expect(csp).toContain('wss://maestro.example.com');
    expect(csp).toContain('http://100.64.0.1:4567');
    expect(csp).toContain('ws://100.64.0.1:4567');
  });

  it('drops upgrade-insecure-requests only when MAESTRO_DISABLE_CSP_UPGRADE=1', async () => {
    const originalEnv = process.env.MAESTRO_DISABLE_CSP_UPGRADE;
    try {
      process.env.MAESTRO_DISABLE_CSP_UPGRADE = '1';
      const app = express();
      app.use(createSecurityHeaders());
      app.get('/', (_req, res) => res.send('ok'));

      const response = await supertest(app).get('/').expect(200);
      const csp = response.headers['content-security-policy'];

      expect(csp).not.toContain('upgrade-insecure-requests');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MAESTRO_DISABLE_CSP_UPGRADE;
      } else {
        process.env.MAESTRO_DISABLE_CSP_UPGRADE = originalEnv;
      }
    }
  });

  it('fully disables CSP only when MAESTRO_DISABLE_CSP=true (escape hatch, not the default)', async () => {
    const originalEnv = process.env.MAESTRO_DISABLE_CSP;
    try {
      process.env.MAESTRO_DISABLE_CSP = 'true';
      const app = express();
      app.use(createSecurityHeaders());
      app.get('/', (_req, res) => res.send('ok'));

      const response = await supertest(app).get('/').expect(200);

      expect(response.headers['content-security-policy']).toBeUndefined();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MAESTRO_DISABLE_CSP;
      } else {
        process.env.MAESTRO_DISABLE_CSP = originalEnv;
      }
    }
  });
});
