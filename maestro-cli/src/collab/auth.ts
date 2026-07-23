import { createServer } from 'http';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { CollabError, CollabIdentity, CollabProfile } from './types.js';
import { eraseRefreshToken, getRefreshToken, saveRefreshToken } from './token-store.js';

const execFileAsync = promisify(execFile);

interface TokenResponse { id_token: string; refresh_token: string; expires_in: string; user_id: string; }

export async function exchangeRefreshToken(profile: CollabProfile, refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(profile.firebase.apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  if (!response.ok) throw new CollabError('COLLAB_AUTH_REQUIRED', 'Collab login has expired. Run `maestro collab auth login`.');
  const json = await response.json() as Partial<TokenResponse>;
  if (!json.id_token || !json.refresh_token || !json.expires_in || !json.user_id) throw new CollabError('COLLAB_AUTH_FAILED', 'Firebase returned an invalid authentication response.');
  return json as TokenResponse;
}

function decodeClaims(idToken: string): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')); } catch { throw new CollabError('COLLAB_AUTH_FAILED', 'Firebase returned an invalid identity token.'); }
}

export async function currentIdentity(profileName: string, profile: CollabProfile): Promise<{ token: string; identity: CollabIdentity }> {
  const refreshToken = getRefreshToken(profileName);
  if (!refreshToken) throw new CollabError('COLLAB_AUTH_REQUIRED', 'Not logged in. Run `maestro collab auth login`.');
  try {
    const result = await exchangeRefreshToken(profile, refreshToken);
    if (result.refresh_token !== refreshToken) saveRefreshToken(profileName, result.refresh_token);
    const claims = decodeClaims(result.id_token);
    return { token: result.id_token, identity: { uid: result.user_id, displayName: typeof claims.name === 'string' ? claims.name : null, email: typeof claims.email === 'string' ? claims.email : null, expiresAt: new Date(Date.now() + Number(result.expires_in) * 1000).toISOString() } };
  } catch (error) {
    if (error instanceof CollabError && error.code === 'COLLAB_AUTH_REQUIRED') eraseRefreshToken(profileName);
    throw error;
  }
}

/**
 * Secure local browser hand-off. The callback only accepts same-origin JSON
 * from the exact loopback origin and a one-time random state. The returned
 * refresh token is never written to stdout or command tracking.
 */
export async function loginWithLoopback(profileName: string, profile: CollabProfile): Promise<CollabIdentity> {
  const state = randomBytes(32).toString('base64url');
  let settled = false;
  const result = await new Promise<{ refreshToken: string }>((resolve, reject) => {
    let timeout: NodeJS.Timeout;
    const finish = (value?: { refreshToken: string }, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      if (error) reject(error); else resolve(value!);
    };
    const server = createServer((req, res) => {
      const host = req.headers.host || '';
      const origin = req.headers.origin || '';
      const ownOrigin = `http://${host}`;
      const fail = (status: number) => { res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end('Invalid login callback.'); };
      if (!/^\[?::1\]?(:\d+)?$/.test(host) && !/^127\.0\.0\.1(:\d+)?$/.test(host)) return fail(403);
      if (req.method === 'GET' && req.url?.startsWith('/')) {
        const html = loopbackHtml(profile.firebase, state);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src https://www.gstatic.com; connect-src https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.googleapis.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" });
        return res.end(html);
      }
      if (req.method !== 'POST' || req.url !== '/callback' || origin !== ownOrigin) return fail(403);
      let body = '';
      req.on('data', (chunk) => { body += String(chunk); if (body.length > 10_000) req.destroy(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as { state?: string; refreshToken?: string };
          if (settled || payload.state !== state || typeof payload.refreshToken !== 'string' || payload.refreshToken.length < 20) return fail(403);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<p>Maestro Collab login complete. You may close this tab.</p>');
          finish({ refreshToken: payload.refreshToken });
        } catch { fail(400); }
      });
    });
    timeout = setTimeout(() => finish(undefined, new CollabError('COLLAB_LOGIN_EXPIRED', 'Browser login expired after five minutes.')), 5 * 60_000);
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
      try { await execFileAsync(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', url] : [url]); } catch { /* terminal still prints the local URL */ }
      process.stderr.write(`Open this local URL to sign in: ${url}\n`);
    });
  });
  saveRefreshToken(profileName, result.refreshToken);
  return (await currentIdentity(profileName, profile)).identity;
}

function loopbackHtml(config: CollabProfile['firebase'], state: string): string {
  const safe = JSON.stringify({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, appId: config.appId || '' }).replace(/</g, '\\u003c');
  const safeState = JSON.stringify(state);
  return `<!doctype html><meta charset="utf-8"><title>Maestro Collab login</title><p>Sign in with your configured Firebase provider.</p><button id="google">Sign in with Google</button><form id="email"><input id="address" type="email" autocomplete="email" placeholder="Email" required><input id="password" type="password" autocomplete="current-password" placeholder="Password" required><button>Sign in with email</button></form><p id="error" role="alert"></p><script type="module">import{initializeApp}from'https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js';import{getAuth,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword}from'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';const auth=getAuth(initializeApp(${safe}));const done=async r=>{await fetch('/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:${safeState},refreshToken:r.user.refreshToken})});document.body.textContent='Login complete. You may close this tab.'};const fail=e=>document.querySelector('#error').textContent=e?.message||'Sign-in failed';document.querySelector('#google').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).then(done).catch(fail);document.querySelector('#email').onsubmit=e=>{e.preventDefault();signInWithEmailAndPassword(auth,document.querySelector('#address').value,document.querySelector('#password').value).then(done).catch(fail)};</script>`;
}
