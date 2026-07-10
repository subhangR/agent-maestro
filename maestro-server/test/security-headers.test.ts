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
  });
});
