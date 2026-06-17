# Planning — API services layer (`services/api/`)

**Author:** 🔌 Conduit · **Scope:** `services/api/` · **Status:** revised post-consensus (v1 = NO AUTH)

This is the REST + connection-configuration layer for maestro-mobile. It owns how the
app discovers the server, builds every URL, and calls the ~120 REST endpoints. The
realtime sockets (entity-sync WS, `/pty`) belong to **Pulse** (`services/realtime/`); I
hand them resolved URLs + an injectable token-getter. The entity/payload/response types
belong to **Lexicon** (`domain/`); I consume them. The persisted host string is owned by
**Ledger**'s `prefsStore`; I own the pure URL derivation + the client.

> **v1 directive (Atlas/user):** **NO AUTH.** The app connects directly to a
> user-typed `host:port` — type address → tap connect → done. No token, no login, no
> cookie, no Bearer, no `?token=`. My earlier auth investigation is preserved below in
> §3 as a **documented FUTURE seam only** (the server supports it; v1 just doesn't use
> it). The client carries an injectable `getToken()` that returns `null` in v1 so the
> seam is wired but inert.

---

## 0. Decisions

| Decision | Choice | One-line why |
|---|---|---|
| HTTP client | **native `fetch` wrapper** (no axios/ky) | RN ships fetch; port maestro-ui's `MaestroClient` 1:1, not a rewrite |
| Method surface | **free-form ported methods**, typed by Lexicon's `contracts/rest/*` | ratified "MaestroClient ported 1:1"; decline the endpoints-catalog for v1 (see CQ-1) |
| URL config | **runtime** (user enters host), not build-time `VITE_*` | a phone can't bake in `localhost`; host is user data |
| Host persistence | **Ledger `prefsStore`** owns it; I own `buildServerConfig` (pure) | one persistence layer (their swappable MMKV/AsyncStorage); I just derive + consume |
| Auth (v1) | **none** | user directive — direct host:port connect |
| Auth (future seam) | `?token=` query param + `expo-secure-store`; **NOT** `Authorization: Bearer` | verified the server never reads the Authorization header (§3) |
| Error model | one `MaestroApiError {status, code, message, body}` thrown by the wrapper | server error shapes are inconsistent; normalize at the boundary |
| Client shape | one `MaestroClient` class, DI'd `(config, opts)`, resource-grouped methods | mirrors `utils/MaestroClient.ts`; re-instantiable when host changes |

---

## 1. The connection-config module (`serverConfig`)

### 1.1 What changes from maestro-ui

maestro-ui's `utils/serverConfig.ts` reads URLs from **build-time** Vite env
(`import.meta.env.VITE_API_URL`) and falls back to `window.location.origin`. **Neither
exists on React Native** — no `import.meta.env`, no `window.location`, and the host is
not known at build time. So URL derivation becomes **runtime**.

The *pure functions* port almost verbatim — they're string/URL math:

- `deriveWsUrl(apiUrl)` — `http→ws`, `https→wss`, host preserved, **no path** (bare
  origin — exactly what the entity-sync bridge wants). **This is the function Pulse
  consumes** (their Q4).
- `deriveServerUrl(apiUrl)` — strip `/api`; display + `/pty` base.
- `normalizeApiBaseUrl(raw)` — trims wrapping quotes, validates protocol, appends `/api`
  if the user typed a bare origin.
- `normalizeWsUrl`, `parseAbsoluteUrl`, `stripWrappingQuotes` — port as-is.

> Keep the quote-stripping + protocol-allowlist hardening. The original comment is
> right: malformed URLs surface as opaque `"The string did not match the expected
> pattern."` errors. On mobile the input is a hand-typed text field, so this matters
> *more*. Install `react-native-url-polyfill` and confirm `new URL()` + `.host`/
> `.protocol` work under Hermes (R-4).

### 1.2 Runtime config shape

```ts
// services/api/config/serverConfig.ts
export interface ServerConfig {
  apiBaseUrl: string;   // http://host:4569/api   (canonical, always ends /api)
  wsUrl: string;        // ws://host:4569         (bare origin, no path)  → Pulse
  ptyWsUrl: string;     // ws://host:4569/pty                              → Pulse
  serverUrl: string;    // http://host:4569       (display + base)
}

export function buildServerConfig(rawHostOrUrl: string): ServerConfig {
  const apiBaseUrl = normalizeApiBaseUrl(rawHostOrUrl);
  const wsUrl = deriveWsUrl(apiBaseUrl);
  return { apiBaseUrl, wsUrl, ptyWsUrl: `${wsUrl}/pty`, serverUrl: deriveServerUrl(apiBaseUrl) };
}
```

**Ownership boundary:** Ledger's `prefsStore` persists the raw host string (their
swappable `StateStorage`, MMKV/AsyncStorage). On boot/connect the host string is read
from prefs → passed through my `buildServerConfig` → the resulting `ServerConfig` is
injected into `MaestroClient` and handed to Pulse. Changing servers = re-build config +
re-instantiate client + Pulse reconnects. (Resolves my old CQ-1: Ledger owns
persistence, I own derivation.)

### 1.3 No default that "works"

No `localhost` default — on a phone that's the phone. Boot with no host → Compass's
connect/onboarding screen. I own the validate-and-save logic: `GET {serverUrl}/health`
must return 200 before a host is accepted (cheap, unauthenticated, outside `/api`).

---

## 2. The REST client (`MaestroClient`)

### 2.1 Library decision — native `fetch` wrapper

**Chosen: a thin class around `fetch`.** maestro-ui's `MaestroClient` is already a
~30-line fetch wrapper + ~120 one-line methods; the port is mechanical. `fetch` is
first-class in RN/Hermes (JSON, `AbortSignal` timeouts, custom headers). Zero
dependency, zero bundle cost, no native module.

**Rejected:**

- **axios** — ~15KB + XHR adapter; its only real win (auto-JSON + throw-on-non-2xx) is
  10 lines to replicate, and it diverges from the proven maestro-ui code.
- **ky** — lovely, but `fetch`-based ESM tuned for browsers; RN/Hermes compatibility is
  a gamble for a wrapper we'd write anyway.
- **TanStack Query / RTK Query** — server-state *caching* layers, not HTTP clients, and
  a different architectural layer that's Ledger's call. **Ratified: NO TanStack Query**
  — Ledger's fetch-actions call my client directly. Resolved.

### 2.2 The wrapper (v1, no auth)

Port the maestro-ui `fetch<T>()` core, simplified for the no-auth directive:

```ts
private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = this.getToken?.() ?? null;            // FUTURE SEAM; null in v1
  const url = this.withToken(`${this.config.apiBaseUrl}${endpoint}`, token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), this.timeoutMs); // ~20s
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      // no `credentials`, no Cookie, no Authorization — v1 talks to an open server
    });
    if (!res.ok) throw await MaestroApiError.fromResponse(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new TimeoutError(endpoint);
    throw e;            // network errors bubble (TypeError: Network request failed)
  } finally { clearTimeout(timeout); }
}
```

Key deltas from web:

- **No auth machinery in v1.** No `credentials:'include'`, no Cookie header, no token,
  no 401→login overlay. A 401 (shouldn't happen against an open server) is just a
  `MaestroApiError`. `getToken()` is an injected optional that returns `null` now; when
  auth lands (§3) it returns the stored token and `withToken()` appends `?token=`.
- **Timeout via `AbortController`** — RN fetch has no timeout; mobile networks stall.
- **204 handling** — mutation endpoints may return `{success:true}` or empty bodies.
- **No store/UI imports** — the layer stays free of Ledger/Compass; any 401-handling
  hook is injected, not imported (keeps the boundary clean and the code testable).

### 2.3 Method surface

One class, methods grouped by resource per the REST checklist in
`MOBILE_APP_BUILD_ANALYSIS.md §3.2`: projects, tasks, sessions (read + control),
modals, team-members, teams, task-lists, task-graphs, spells, skills, model-profiles,
ensembles, master, git, ordering, workflow-templates, agent-logs. (Auth endpoints
deferred.) ~120 methods.

**Types come entirely from Lexicon.** I import request payloads + responses from
`domain/contracts/rest/requests.ts` + `responses.ts` (`CreateTaskPayload`,
`SpawnSessionPayload`, `SpawnSessionResponse`, `SessionStatsResponse`, `GitDiffSummary`,
etc.) and entities from `domain/entities/*`. I do **not** redefine shapes. This resolves
my prior hard-blocker — Lexicon's domain plan explicitly exports these.

**Spawn** (`spawnSessionSchema` is `.strict`): always `spawnSource:'ui'`, include
measured `cols/rows` (supplied by the caller — Relay measures), use
`launchConfig{provider,model,...}`. I optionally validate the outbound body with
Lexicon's `schemas/spawn.ts` before the round-trip to turn the server's opaque 400 into
a precise client error.

### 2.4 Query-param building

`buildQuery(params)` skips `undefined`, `encodeURIComponent`s values; used for
`GET /tasks?projectId&status&parentId`, `GET /sessions?...&fields=full|summary`. The
token param (future) is appended **last** by `withToken()` so it composes with existing
queries.

---

## 3. Auth — DEFERRED to post-v1 (documented future seam)

> **v1 ships with no auth.** This section is the verified contract for when auth is
> added, so nobody re-investigates. The seam (`getToken()` + `withToken()` +
> `expo-secure-store` + an `AuthSession` module) is designed but not built in v1.

### 3.1 The corrected server contract (verified in source)

> ⚠️ **The brief and `MOBILE_APP_BUILD_ANALYSIS.md` are WRONG on one point.** They claim
> the server accepts `Authorization: Bearer`. **It does not.** Verified directly in
> `maestro-server/src/api/middleware/authMiddleware.ts`, `api/authRoutes.ts`,
> `infrastructure/auth/AuthService.ts`: the middleware reads **only** the `maestro_auth`
> cookie and the **`?token=` query param** — no `Authorization` parsing anywhere. When
> auth is added, Pulse's WS upgrade and my REST calls must use **`?token=`**.

- **`GET /api/auth/status`** (public) → `{authEnabled, authenticated}`; `authenticated`
  is computed **from the cookie only** (ignores `?token=`) — so use it to learn
  `authEnabled`, not to validate a `?token=` token.
- **`POST /api/auth/login {password}`** → `{ok:true}` **and** sets the token **only via
  a `Set-Cookie: maestro_auth=<token>` header** — the token is **never in the body**.
  Bad password → 401; rate-limited → 429; auth-disabled → `{ok:true}`.
- **Middleware:** when enabled, every `/api/*` (except `/api/auth/*`, `/health`,
  `/ws-status`, trusted-loopback) needs a valid `cookieToken || queryToken`.
- **Trusted-loopback bypass does NOT apply to mobile** (remote goes through
  `tailscale serve`, which adds `X-Forwarded-*`). Mobile must authenticate when enabled.
- **Token format:** `<base64url({exp})>.<hmac-sha256>`, 7-day expiry — decodable
  client-side to read `exp` for proactive refresh.

### 3.2 Future handshake & the load-bearing trick

```
GET /api/auth/status → authEnabled? → POST /auth/login {password}
  → read Set-Cookie response header → extract maestro_auth=<token>
  → store in expo-secure-store → append ?token= to every REST + WS URL
```

> **RISK R-1 (verify when auth work begins):** browsers forbid JS from reading
> `Set-Cookie`; **RN's fetch generally exposes it** via `headers.get('set-cookie')`, but
> this must be spiked on real iOS+Android. Fallback: read RN's native cookie jar via
> `@react-native-cookies/cookies` and lift `maestro_auth` into secure-store.

### 3.3 Future module surface

`services/api/auth/AuthSession.ts` — `status/login/logout/getToken/tokenExpiry`, backed
by `expo-secure-store` (Keychain/Keystore; the right home for a 7-day server credential;
host URL is non-secret and stays in Ledger's prefs). `MaestroClient` already accepts the
injectable `getToken`, so adding auth is additive — no rewrite.

---

## 4. Error model

Server error shapes are **inconsistent** (verified): entity routes return
`{error:true, code, message}`; auth returns `{error:'Unauthorized'}` (string `error`,
no `code`); validation returns `400 {error:true, code:'VALIDATION_ERROR', ...}`; some
failures are plain text. Normalize all of it at the boundary:

```ts
export class MaestroApiError extends Error {
  constructor(readonly status: number, readonly code: string|null,
              message: string, readonly body?: unknown) { super(message); }
  static async fromResponse(res: Response): Promise<MaestroApiError> {
    const text = await res.text().catch(() => '');
    try {
      const j = JSON.parse(text);
      const code = typeof j.code === 'string' ? j.code : null;
      const message = typeof j.error === 'string' ? j.error : (j.message ?? text ?? res.statusText);
      return new MaestroApiError(res.status, code, message, j);
    } catch { return new MaestroApiError(res.status, null, text || res.statusText); }
  }
}
export class TimeoutError extends Error {}
```

Callers (Ledger's fetch-actions, Forge) switch on `status` (HTTP semantics), `code`
(server domain codes like `VALIDATION_ERROR`), `message` (display). An upgrade over
maestro-ui, which throws bare `Error(\`HTTP ${status}: ${text}\`)` and forces
string-matching downstream. Aligns with Lexicon's `ErrorEnvelope` type.

---

## 5. Folder structure (`services/api/`)

```
services/api/
├── index.ts                 # public surface: maestroClient factory/singleton, errors, ServerConfig
├── config/
│   ├── serverConfig.ts      # buildServerConfig + deriveWsUrl/normalize* pure fns (ported)
│   └── serverConfig.test.ts # URL-derivation unit tests (port maestro-ui cases)
├── http/
│   ├── MaestroClient.ts     # the class: request<T>() + ~120 resource methods
│   ├── buildQuery.ts        # query-string helper (skips undefined, encodes, token-last)
│   └── errors.ts            # MaestroApiError, TimeoutError
├── constants.ts             # timeouts, default-port hints, storage keys (future)
└── auth/                    # FUTURE (post-v1) — empty/stubbed in v1
    └── AuthSession.ts       # status/login/logout/getToken/tokenExpiry (see §3)
```

**Instantiation / DI:** a configured singleton from `index.ts`, but the class takes
`(config: ServerConfig, opts?: { getToken?, timeoutMs? })` so it's testable and
re-creatable on host change. **No module-level frozen URL constants** (unlike
maestro-ui's import-time `API_BASE_URL`) — the host is runtime data.

---

## 6. Best practices for this layer

- **Pure URL functions stay pure & unit-tested** — port maestro-ui's serverConfig cases;
  cheapest bug-catchers we have.
- **No store/UI imports in `services/api`** — boundary is injected config + callbacks.
  Avoids the circular-dep dance maestro-ui does with its lazy `import(useAuthStore)`.
- **All types from Lexicon** — never redeclare an entity/payload here.
- **Every request times out** (AbortController). Mobile radios stall silently.
- **Idempotent reads, explicit mutations** — `get*/list*` vs
  `create*/update*/delete*/spawn/resume/prompt`.
- **`fields=summary` default for session lists** to cut mobile-data payload; `full`
  opt-in (Ledger decides the default — they flagged the summary-vs-full merge risk).
- **(future) token never logged** — scrub `?token=` from any logged URL.

---

## 7. Risks

| ID | Risk | Mitigation |
|---|---|---|
| **R-4** | `new URL()`/`.host` under Hermes may be partial. | Install `react-native-url-polyfill`; unit-test derivation on-device. |
| **R-5** | Runtime host change must re-derive config + re-instantiate client + reconnect Pulse. | Single `buildServerConfig` + a "reconfigure" action; coordinate teardown order with Pulse. |
| **R-7** | RN implicit native cookie jar could shadow behavior even with no explicit cookies. | Don't set `credentials`; v1 server is open so irrelevant; revisit at auth. |
| **R-1** | *(future, auth)* Can RN read `Set-Cookie` for the token? | Spike iOS+Android when auth work starts; `@react-native-cookies/cookies` fallback. |
| **R-2** | *(future, auth)* Docs claim Bearer works; it doesn't. | Corrected in §3; broadcast. Use `?token=`. |

---

## 8. Cross-team status (boundaries reviewed)

**Resolved / aligned:**

- **Lexicon (`domain/`)** — exports request/response types (`contracts/rest/requests.ts`
  + `responses.ts`) + `schemas/spawn.ts`. **Resolves my prior hard blocker.** I consume
  these; I do not redefine shapes.
- **Ledger (`state/`)** — owns the fetch *actions* (loading/error/ordering bookkeeping)
  and calls my typed REST methods inside them (their Q7). ✓ Matches. Ledger's
  `prefsStore` persists the host string; I own derivation. ✓
- **Pulse (`services/realtime/`)** — consumes my `ServerConfig.wsUrl`/`ptyWsUrl` + an
  injected `getToken()` (their Q4). ✓ I export these; `getToken()` returns `null` in v1.
- **TanStack Query** — ratified out; my client is called directly. ✓
- **Auth** — ratified out of v1 (user directive). My auth work becomes a documented
  future seam (§3); the client carries the inert `getToken` hook.

**Open question I'm answering (Lexicon Q1 — endpoints catalog):**

- **CQ-1 / answer:** I **decline the typed `endpoints.ts` route catalog for v1** and
  keep **free-form ported methods** typed by Lexicon's `requests.ts`/`responses.ts`.
  Rationale: consensus already ratified "MaestroClient ported 1:1"; the 1:1 port is the
  fastest, lowest-risk path and threading 120 methods through a catalog/generator is
  upfront work with little v1 payoff. I still import every request/response **type**
  from `contracts/rest/*`, so signatures are centrally checked. The catalog stays a
  reasonable post-v1 refactor if method drift becomes a maintenance problem.

**No remaining boundary conflicts in my scope.**
