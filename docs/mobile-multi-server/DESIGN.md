# Mobile Multi-Server / Server-Switching — Design Brief

Status: **IMPLEMENTED** on branch `feat/mobile-multi-server` (commit `2ad8cd4`, off staging),
worktree `~/Desktop/Projects/maestro/mobile-multiserver-wt`. Design agreed 2026-07-22. Scope: let the
mobile app connect to **different kinds of maestro servers** — a solo **standalone server** or the
multi-user **Hub (gateway)** — and switch between them, while the in-app experience
(projects/sessions/tasks/terminals) stays identical.

## Implementation status
Shipped in this branch (tsc clean across mobile/server/gateway; 21 new unit tests pass):
- **server** `/health` → `authMode: 'none' | 'password'`.
- **gateway** unauthenticated `/health` → `authMode: 'firebase'` (ahead of the /api proxy + SPA).
- **mobile** `serverProfilesStore` (MMKV, migrates legacy `lastHost`), `probeHealthInfo()`,
  `hubToken` seam, authMode-aware `bootstrap` + `addServerAndConnect`/`switchToProfile`, connect-screen
  type detection, Settings "Servers" list (switch/add/remove/disconnect).

**Depends on the Collab session** landing `src/services/firebaseAuth/` (Google sign-in +
`@react-native-firebase`, all deps/native config/bootstrap-init). To activate `firebase` profiles,
that module wires the seam ONCE, post-merge:
```ts
// MERGE-TIME step: setHubFirebaseAuth is on feat/mobile-multi-server,
// signInAndGetIdToken on feat/mobile-collab — compiles only once both are on
// staging. Add at app boot, after the module's initFirebaseAuth().
import { getIdToken, signInAndGetIdToken } from '@/services/firebaseAuth';
import { setHubFirebaseAuth } from '@/services/api';
setHubFirebaseAuth({ getIdToken, signIn: signInAndGetIdToken });
```
On-device auth (a `firebase` profile OR Collab) also needs the real
`google-services.json` / `GoogleService-Info.plist` (from the `maestro-5f3fc` console) and
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — placeholders are in `app.json` today.
Until then, standalone/password profiles work fully; `firebase` profiles surface
`HubSignInRequiredError` at connect.

---

## 1. Background — how the pieces work today

### Standalone server (`maestro-server`)
- One process = one workspace = one data dir (`~/.maestro/data` or `~/.maestro-staging/data`).
  Single-tenant; no user concept. The whole server **is** the workspace.
- Clients speak: `http://host:port/api` (REST), `ws://host:port` (entity-sync), `ws://host:port/pty`
  (terminals). Default **no-auth** (Tailscale/loopback trust); optional password → JWT that rides as
  `?token=`.
- Needs `MAESTRO_PTY_HOST=server` for server-side terminals (mobile requirement).

### The Hub / gateway (`maestro-gateway`, branch `feat/trusted-hub-gateway`, Design A)
- A **reverse proxy + multiplexer** on one public origin. Authenticates a **Firebase Google ID token**
  (`Authorization: Bearer` for REST, `?token=` for WS/PTY), maps `uid → per-user maestro-server child
  process`, proxies to `127.0.0.1:<that user's port>`.
- Each user gets their **own isolated standard maestro-server** (own data dir + port). Same server
  code, same workspace semantics — just fenced per user. Backends run auth-disabled; the gateway is the
  sole authenticator. Firebase project: `maestro-5f3fc` (same as Collab Space).
- To a client the hub **looks like a normal maestro-server** — same `/api`, `/ws`, `/pty` — gated by
  Firebase auth, reached through one shared URL.

### Mobile (`maestro-mobile`, Expo/RN, branch `feat/mobile-app`)
- Connection screen takes a bare `host:port`, health-probes `/health`, stores a **single `lastHost`** in
  MMKV. Loads workspace over REST, live updates over entity-sync + PTY WebSockets.
- Single active connection; switching = teardown + re-enter host (teardown/rebind path already exists,
  commit `2c2dc1f`). Password→`?token=` seam exists (`3682965`). **No Firebase / Google sign-in** —
  confirmed absent from deps and code.

**Gap:** mobile↔standalone works. The hub is a *different server type* with *different auth* and a
shared public URL. Supporting it means the app must handle multiple server types/auth and switch
between them cleanly.

---

## 2. Decisions (agreed with user)

1. **Workspace model — "same app, separate data per server."** Same protocol/APIs everywhere; each
   server keeps its own data. Switching just re-points the app at another backend. **No** cross-server
   data sync. (The hub still isolates per-user, so hub-you and standalone-you are simply different
   backends.)
2. **Switching UX — saved server profiles + quick switch.** A list of servers you've added; tap to
   switch instantly.
3. **Auth — add Google sign-in to mobile now**, as part of this work (not deferred). Mobile keeps its
   **own** Firebase Auth session (a web/desktop session can't be shared into the native process). One
   sign-in, reused for the hub now and Collab Space later — same `maestro-5f3fc` identity as web.
   - **Tech locked (with Collab session `sess_1784740413749_knvbbcni8`): `@react-native-firebase/auth`
     + `@react-native-google-signin` — NOT Expo AuthSession token-only.** Collab is Firebase-direct (RN
     hits Firestore under security rules) so it needs a *live authenticated Firebase session*, not just
     a raw ID token. `signInWithCredential(GoogleAuthProvider.credential(...))` yields **both**: the live
     session (Collab's need) and `getIdToken()` (the Hub Bearer/`?token=` need). Requires a dev build
     (already using `expo-dev-client`).
4. **Type detection — auto-detect via `/health`.** Add an `authMode` field to `/health` on **both** the
   standalone server and the gateway. App reads it and shows the right login.

---

## 3. Target architecture

### Server profile = the unit of connection
```
ServerProfile {
  id: string
  label: string            // "Home", "Team Hub", "VPS staging"
  baseUrl: string          // http(s)://host:port  (origin; /api, /ws, /pty derived as today)
  authMode: 'none' | 'password' | 'firebase'   // discovered via /health, cached
  // auth material stored separately in secure storage, keyed by profile id:
  //   password  -> JWT
  //   firebase  -> Firebase ID token (refreshable)
}
```
All profiles speak the identical protocol. A profile is just `{ label, baseUrl, type, auth }`. The hub
is "a server that happens to require a Firebase token and routes you to your per-user backend."

### Connection lifecycle
1. Add/select profile → probe `GET /health` → read `{ authMode }` (cache on profile).
2. Run the matching login: `none` → nothing; `password` → password sheet → JWT; `firebase` → Google
   sign-in → Firebase ID token.
3. Build `ServerConfig` from `baseUrl`, inject token into REST (Bearer/`?token=`) + WS/PTY (`?token=`).
4. `teardown()` old client + realtime, rebind `MaestroClient` and realtime to new base URL (path
   already exists), clear entity store, refetch workspace.

### Auto-detect contract (server change)
- Standalone `/health` → `{ status:'ok', authMode: 'none' | 'password', ... }`.
- Gateway health → `{ status:'ok', authMode: 'firebase', ... }`.
- `/health` stays unauthenticated so the probe works before login.

---

## 4. Work breakdown (by package)

### `maestro-mobile`
- **Server profiles store** (MMKV): list of `ServerProfile`, `activeProfileId`; migrate existing
  single `lastHost` into a first profile.
- **Profiles UI**: server list + quick switch (settings), add-server flow, per-profile auth state.
- **Auto-detect**: read `authMode` from `/health` on connect; route to the correct login.
- **Firebase Google sign-in**: the **shared `src/services/firebaseAuth/` module** (see §4a). Obtain ID
  token; **secure storage** (`expo-secure-store`) for tokens (today tokens sit in plain MMKV — upgrade).
- **Token plumbing**: `getToken()` seam per active profile → Bearer for REST, `?token=` for WS/PTY
  (double-`?` fix `a607387` already handles the PTY case).
- **Switch = teardown + rebind + clear entities** (reuse `2c2dc1f`/`42a99fa`).

### `maestro-server`
- Add `authMode` to `/health` payload (`'none'` or `'password'` based on whether password auth is
  enabled). Small, additive.

### `maestro-gateway`
- Health/`/health` returns `authMode: 'firebase'` (so the same probe works through the proxy).
- Confirm the gateway forwards/handles the mobile `?token=` on WS/PTY upgrades (it already authenticates
  Bearer + `?token=`; verify PTY upgrade path for RN WebSocket).

### 4a. Shared mobile Firebase auth module (OWNED by Collab session)
Agreed contract with `sess_1784740413749_knvbbcni8` (spec: `planning/MOBILE_COLLAB_SPEC.md`).
**OWNERSHIP FLIP (user directive):** the **Collab session OWNS and LANDS** `src/services/firebaseAuth/`
+ Firebase native config + npm deps + bootstrap Firebase init, on its own worktree (`feat/mobile-collab`),
landing FIRST. **This (Hub) session CONSUMES it** — adds NO Firebase deps, NO native config. The Hub only
needs the module-level `getIdToken(forceRefresh?)` accessor (connect-time + socket re-auth), wired into
the existing `MaestroClient { getToken }` seam via an injectable provider so this session's code compiles
and standalone/password profiles work before `firebaseAuth/` exists in this branch.
```
src/services/firebaseAuth/          (shared, foundation-owned by Hub session)
  useFirebaseAuth(): { user, status, signInWithGoogle(), signOut() }   // Collab: live auth for Firestore
  getIdToken(forceRefresh?): Promise<string|null>                      // Hub: Bearer / ?token=  (non-hook accessor)
  onIdTokenChanged → refresh; token cached in expo-secure-store
  backed by @react-native-firebase/auth + @react-native-google-signin
```
- **Collab** consumes `user` / live Firebase session (Firestore under security rules).
- **Hub** consumes `getIdToken()` at connect-time and on socket re-auth (must be callable outside React).

### Joint-ownership / sequencing (both sessions)
Shared edits — sequence to avoid collisions:
- `package.json` deps (`@react-native-firebase/*`, `@react-native-google-signin`, `expo-secure-store`).
- Native config: `google-services.json`, `app.json`/Info.plist, dev-build (`expo-dev-client`).
- `bootstrap` Firebase app init.
- Secure storage.

Disjoint — no overlap:
- **This session only**: server-profiles store, `/health` `authMode`, connection transport, settings
  server-switcher.
- **Collab session only**: `(tabs)/(spaces)` route group, `CustomTabBar` 5th tab, `src/services/collab/`
  Firestore layer, Collab Zustand stores (separate from `entityStore`), `@react-native-firebase/messaging`
  + FCM sender in `functions/`.

### Cross-cutting
- Standalone deployments that mobile uses still need `MAESTRO_PTY_HOST=server` and to run under **node**
  (node-pty + bun incompatibility).

---

## 5. Open items / risks
- **Token refresh**: Firebase ID tokens expire (~1h); mobile must refresh and re-attach to long-lived
  WS/PTY sockets (reconnect with fresh token). Define refresh-on-401 + socket re-auth.
- **Secure storage migration**: move `authToken` off plain MMKV to `expo-secure-store`.
- **Gateway PTY through-proxy**: validate RN WebSocket `?token=` upgrade end-to-end against the gateway
  (not just a standalone server).
- **Google OAuth client config** for the RN app (iOS/Android client IDs in the `maestro-5f3fc` project).
- Collab Space on mobile is out of scope here but shares the same Firebase session once added.
