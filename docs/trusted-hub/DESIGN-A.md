# DESIGN A — Process-per-user Gateway (finalized L1 spec)

> Status: **finalized design**, ready to build · 2026-07-22
> Supersedes the slot stub. Decisions below were locked interactively with the owner.
> Companion context: `HANDOFF.md` (§4 Option A), `ARCHITECTURE.md` (Part 0 reframe).

---

## 0. One-paragraph summary

Run today's `maestro-server` **unchanged, once per user**. A new **gateway** (Node/TS
package in the monorepo) is the only always-on box process: it serves the `maestro-ui`
SPA, verifies each user's **own Firebase Google login**, and spawns + owns an **always-on
`maestro-server` child process per `uid`** (its own `PORT` / `DATA_DIR` / `SESSION_DIR`
under `~/hub/<uid>/`), reverse-proxying that user's `/api` + `/ws` + `/pty` to it over
loopback. Isolation = **a process + a directory**. Collaboration is unchanged (existing
Firebase Collab Space). Compute + **one shared Claude + one shared Codex subscription**
are pooled by injecting a single shared config dir into every instance. Perimeter is
**Tailscale** for now.

Why it's small: `maestro-server` already reads *everything* about "which workspace am I"
from env at boot (`Config.ts`), and already merges per-session env at PTY spawn
(`PtyHostService.spawn()` → `env: { ...process.env, ...params.env }`). So multi-user =
multiply the process; credential pooling = one env var. **~Zero changes to the server core.**

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| A1 | **Process-per-user** (Option A), defer Option B | Max reuse, hard isolation for free, sidesteps the global-broadcast realtime leak |
| A2 | **Gateway = new Node/TS package** in the monorepo (`maestro-gateway`) | Same language/repo, reuse patterns, `firebase-admin` + `http-proxy` |
| A3 | **Always-on** per-user instances (no idle-reap) | ~10 users × ~100MB idle ≈ 1GB; removes reap-races that could kill long-running autonomous agents (pillar 4) |
| A4 | **Gateway spawns instances as child processes** | Simplest to build/debug; restart-on-boot reconciliation covers gateway restarts |
| A5 | **Gateway serves the SPA + proxies** | One origin, one login surface; `maestro-web` stays a thin PTY client (ignored for L1) |
| A6 | **Strictly one workspace per `uid`** | Matches the locked journey; team collab happens via Collab Space, not shared compute |
| A7 | **Per-user Google identity; one shared subscription** | Per-user attribution on the front door; pooled Claude/Codex underneath |
| A8 | **Allowlist of emails/uids** gates provisioning | Only the trusted team gets a workspace |
| A9 | **Single OS user, per-uid dirs** (soft isolation, D9) | Trusted team; hard sandboxing deferred |
| A10 | **Shared config dir, read-mostly** for the pooled login | Simplest; refresh-race validated later in the deferred credential exercise; behind a config knob |
| A11 | **Fresh workspace = empty + one default Project** (`workingDir = ~/hub/<uid>/projects`) | Usable, zero-setup landing |
| A12 | **Minimal SPA change**: attach Firebase token + point at gateway origin | Login UI already exists client-side |
| A13 | **Project dirs under `~/hub/<uid>/projects`, confined** | Clean per-user layout; existing fs-route allowlist scopes browsing |
| A14 | **Perimeter = Tailscale for now** | Strong outer wall; public exposure + hardening deferred to "the move" |

---

## 2. Architecture

```
                    Tailnet
                       │
        Browser (maestro-ui SPA + Firebase Google login, per user)
                       │  Authorization: Bearer <firebase-id-token>
                       │  (WS/PTY carry the token as ?token=)
                       ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  GATEWAY  (maestro-gateway — the only always-on box process)   │
   │                                                               │
   │  • Static: serve maestro-ui/dist (the SPA)                    │
   │  • Auth:   firebase-admin verifies ID token → uid + email     │
   │            → allowlist check                                  │
   │  • Registry: uid → { port, pid, dataDir, startedAt }          │
   │            (persisted at ~/hub/registry.json)                 │
   │  • Supervisor: ensure uid's maestro-server child is running;  │
   │            provision ~/hub/<uid>/ on first sight;             │
   │            crash-restart; re-spawn all on gateway boot        │
   │  • Proxy:  /api /ws /pty  →  127.0.0.1:<uid's port>           │
   │  • CredentialSource: inject shared CLAUDE_CONFIG_DIR / codex  │
   │            config into every spawned instance's env           │
   └───────────────────────────────────────────────────────────────┘
                       │ loopback 127.0.0.1 (trusted, no 2nd auth hop)
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   inst(uidA):4600  inst(uidB):4601  inst(uidC):4602     (unchanged maestro-server)
   ~/hub/A/data     ~/hub/B/data     ~/hub/C/data         own DATA_DIR/SESSION_DIR
        └───────── all inject the SAME shared ───────────┘
              CLAUDE_CONFIG_DIR + Codex config (pooled subs)

   COLLAB PLANE (unchanged): Firebase Collab Space (Jira+Slack+sharing),
   same Google identity. Linked later via P6 (server-as-gateway).
```

---

## 3. The gateway package (`maestro-gateway`)

New workspace package. Modules:

### 3.1 `AuthVerifier`
- Uses **`firebase-admin`** (new dep) initialized against project `maestro-5f3fc`.
- `verify(idToken) → { uid, email, emailVerified }`; rejects on bad signature / expiry /
  wrong `aud` / wrong issuer / `email_verified === false`.
- **`Allowlist`**: `email ∈ allowlist` (config file / env) → else 403, no provisioning.
- Applied to every REST request and every WS/PTY upgrade. **Nothing from the Tailnet side is trusted** beyond a valid, allowlisted token. (The instance's own loopback-trust is a *separate*, inner trust boundary — see §5.)

### 3.2 `InstanceRegistry`
- In-memory map `uid → InstanceHandle { port, pid, dataDir, sessionDir, startedAt, status }`.
- Persisted to `~/hub/registry.json` (atomic write) so gateway restarts can reconcile.
- Port allocation from a range (default `4600–4699`); skips ports already in the registry
  or in use.

### 3.3 `InstanceSupervisor`
- `ensure(uid)`:
  1. If registry has a *live* handle → return it.
  2. Else **provision** (first login): create `~/hub/<uid>/{data,sessions,projects}`,
     seed one default Project (`workingDir = ~/hub/<uid>/projects`) — via a tiny seed
     writer or a one-shot REST call after boot.
  3. **Spawn** `node dist/server.js` (prod) / `bun run dev` (dev) as a child process with env:
     ```
     PORT=<allocated>
     HOST=127.0.0.1
     DATA_DIR=~/hub/<uid>/data
     SESSION_DIR=~/hub/<uid>/sessions
     MAESTRO_PTY_HOST=server
     MAESTRO_AUTH_ENABLED=false        # gateway is the sole authenticator; instance trusts loopback
     CLAUDE_CONFIG_DIR=<shared pooled config dir>     # A10
     CODEX_*=<shared pooled codex config>             # A10
     ```
  4. Wait for `GET /health` on the port, then mark live + persist registry.
- `crash-restart`: on child `exit`, if `always-on` and not intentionally stopped → respawn
  (with backoff) to preserve long-running work continuity.
- `reconcileOnBoot()`: on gateway start, read `registry.json` and re-spawn every known uid
  (always-on model). Data survives on disk, so a re-spawn resumes the workspace.

### 3.4 `Proxy`
- `http-proxy` (or `http-proxy-middleware`) forwards `/api/*` to the resolved instance.
- **WS + PTY**: handle HTTP `upgrade` — route `/ws` and `/pty` to the instance's WS
  servers. Token is read from `?token=` (already supported server-side) and verified before
  upgrade; then proxied to loopback.
- Routing key: `token → uid → InstanceRegistry.port`.

### 3.5 `CredentialSource` (seam, ship the shared impl)
- Interface: `resolve(uid) → { CLAUDE_CONFIG_DIR, codex config }`.
- L1 impl: **`SharedCredentialSource`** — returns the one shared pooled config path for
  everyone (A10). Future impls (`PerInstanceCopy`, `SeatPool`) drop in behind the same seam
  without touching the supervisor. This is where the deferred multi-subscription router lands.

---

## 4. Identity & auth flow

1. Browser loads SPA from the gateway origin; user signs in with **their own** Google
   account (existing `maestro-ui/src/firebase/auth.ts`).
2. SPA attaches the Firebase **ID token** to every REST call (`Authorization: Bearer`) and
   every WS/PTY connect (`?token=`).
3. Gateway `AuthVerifier` verifies + allowlist-checks → `uid`.
4. `InstanceSupervisor.ensure(uid)` guarantees the user's instance is up.
5. Gateway proxies the request to `127.0.0.1:<port>`.
6. Same Google identity is what Collab Space uses → **one login, both planes** (D5).

---

## 5. Trust boundaries

- **Outer (public/Tailnet → gateway):** hostile until proven. Every request/upgrade must
  carry a valid, allowlisted Firebase token. No bypass.
- **Inner (gateway → instance, loopback):** trusted. Instances run `MAESTRO_AUTH_ENABLED=false`
  and rely on `isTrustedLocalRequest` (loopback) — the gateway is the only thing that can
  reach them, and only after it has authenticated the user. Instances bind `127.0.0.1` only.
- **Soft isolation (D9):** all instances run as one OS user; a user's agent *can* read
  another user's `~/hub/<uid>/` and the shared credential dir. Accepted for a trusted team;
  hard sandboxing deferred.

---

## 6. Filesystem layout

```
~/hub/
  registry.json                 # uid → instance handle (gateway-owned)
  <uid>/
    data/                       # DATA_DIR — entities (projects, tasks, sessions, ...)
    sessions/                   # SESSION_DIR — session logs + manifests
    projects/                   # default project workingDir; user code / git repos
  _shared/
    claude-config/              # the one pooled Claude login (CLAUDE_CONFIG_DIR)
    codex-config/               # the one pooled Codex login
```

The existing fs-routes allowlist (home + each project's `workingDir` and parent) already
confines the browser file explorer; per-uid `projects/` keeps browsing scoped (A13).

---

## 7. What changes in `maestro-server`

**Core: essentially nothing.** It already:
- reads `PORT`/`DATA_DIR`/`SESSION_DIR` from env at boot (`Config.ts`),
- merges per-session env at spawn (`PtyHostService.spawn()` L262),
- writes `server-url` into `DATA_DIR` so the in-session `maestro` CLI auto-discovers its
  own instance (agents hit loopback:port directly, not the gateway),
- serves `maestro-ui/dist` when present (the SPA the gateway will serve instead).

The only *possible* small touches (verify during build, keep minimal):
- Confirm `MAESTRO_AUTH_ENABLED=false` + loopback bind is a clean, supported instance mode.
- Confirm the shared `CLAUDE_CONFIG_DIR` actually flows through to the agent process env
  (it should, via `params.env`).

---

## 8. Client (`maestro-ui`) changes — minimal (A12)

- API client: attach `Authorization: Bearer <firebase-id-token>` to every request; refresh
  the token on 401.
- WS/PTY client: append `?token=<id-token>` on connect.
- Point the base URL at the **gateway origin** (not a specific server).
- Login UI already exists; reuse `useFirebaseAuthStore`.
- (Deferred UX polish — provisioning state, account menu, rejected screen — is out of L1.)

---

## 9. Lifecycle summary

| Event | Behavior |
|---|---|
| First login for a uid | Provision `~/hub/<uid>/…` + seed default Project + spawn instance |
| Subsequent request | Registry hit → proxy straight through |
| User closes laptop mid-agent | Instance **stays up** (always-on) — long agents keep running (pillar 4) |
| Instance crashes | Supervisor respawns with backoff; data intact on disk |
| Gateway restarts | `reconcileOnBoot()` re-spawns all known uids from `registry.json` |
| Stop a workspace | Manual/admin only (no auto-reap in L1) |

---

## 10. Deferred (explicitly out of L1, tracked)

| Item | When |
|---|---|
| **Public exposure + hardening** (token verify on every channel audit, DoS, blast-radius) | "The move" off Tailscale |
| **Rotate + purge the committed `firebase-adminsdk` SA key** | Before any public exposure |
| **Credential crux exercise** — concurrent-refresh isolation, multi-subscription router (`SeatPool`) | When one subscription is no longer enough |
| **Idle-reap / RAM optimization** | If instance count actually hurts |
| **Option B (single multi-tenant process)** | When process count hurts |
| **P6 Collab wiring** (server-as-gateway for task/spell sharing) | After the compute plane is solid |
| **Hard sandboxing** (container/microVM per session) | If the team stops being fully trusted |

---

## 11. Milestone ladder (build order)

- **M1 — Gateway skeleton (no auth):** gateway spawns 2 hardcoded instances on 2 ports/data
  dirs, proxies `/api` + `/pty`. *Prove two isolated workspaces on one box through one port.*
- **M2 — Firebase verify + allowlist:** `firebase-admin` token verify → uid → allowlist;
  provision-on-first-login. Same Google login as Collab.
- **M3 — Supervisor hardening:** registry persistence, crash-restart, `reconcileOnBoot`,
  default-project seed.
- **M4 — SPA wiring:** attach token + point at gateway; full browser flow end-to-end.
- **M5 — Credential injection:** shared config dir wired through `CredentialSource`; agents
  in any user's instance authenticate via the pooled subscription.
- **M6 — Deploy on the Tailscale box:** systemd unit for the gateway; smoke test with 2–3
  real team accounts.

M1 is the first thing that runs and shows something real. No M0 credential spike needed for
L1 (single shared subscription) — deferred per A10/§10.

---

## 12. Open implementation defaults (chosen; veto any)

- Port range `4600–4699`; registry at `~/hub/registry.json`.
- Proxy lib: `http-proxy-middleware` for REST, raw `http-proxy` for WS/PTY upgrades.
- Instance launch: `node dist/server.js` in prod, `bun run dev:server`-style in dev.
- Health gate: poll `GET /health` up to ~10s before marking an instance live.
- Crash-restart backoff: exponential, capped (e.g. 1s→30s).
- Allowlist source: `~/hub/allowlist.json` (list of emails), hot-reloadable.
</content>
</invoke>
