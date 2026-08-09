# Maestro Server & Trusted-Hub Gateway — Deployment Runbook

End-to-end guide for building, deploying, and operating the Maestro stack on the
EC2 / Tailscale VPS: the single-user **maestro-server**, the multi-user **Trusted-Hub
gateway** (Design A, process-per-user), Firebase auth, the pooled Claude/Codex
subscription, and every auth layer (server password, gateway dev-header, gateway
Firebase login).

> This document is a practical runbook grounded in a real deployment. Commands assume
> the box user `ubuntu` and the checkout at `/home/ubuntu/agent-maestro`. Adjust paths
> for other hosts. Secrets (passwords, service-account keys) are referenced by location,
> never inlined.

---

## 1. Architecture at a glance

Two independent stacks run on the same box, each its own systemd service, fronted by
`tailscale serve` (tailnet-only HTTPS):

| Stack | Port | systemd unit | Serves | Auth |
|---|---|---|---|---|
| **maestro-server** (single-user) | `4570` | `maestro-server.service` | REST `/api`, WS `/`, PTY `/pty`, the SPA from `maestro-ui/dist` | env-gated password (`MAESTRO_AUTH_*`) |
| **maestro-gateway** (Trusted Hub) | `4580` | `maestro-gateway.service` | one `maestro-server` **child per user** on ports `4600–4699`, reverse-proxies `/api /ws /pty`, serves the firebase-gated SPA from `maestro-ui/dist-gateway`, dashboard at `/gateway` | Firebase Google login + email allowlist |

- **maestro-server** is the original app; the browser hits it directly.
- **maestro-gateway** (Design A, *process-per-user*) is the multi-user front door: it
  verifies each user's Firebase identity, spawns/owns ONE unchanged `maestro-server`
  child per uid (own `PORT`/`DATA_DIR`/`SESSION_DIR` under `~/hub/<uid>/`), and
  reverse-proxies to it over loopback. One shared Claude (and optionally Codex)
  subscription is injected into every child. See `docs/trusted-hub/DESIGN-A.md` and
  `maestro-gateway/deploy/DEPLOY.md` for the gateway-specific detail this runbook builds on.

Both read their config from `/etc/maestro/*.env`; data lives outside the code dir, so
code updates never touch user data.

---

## 2. The box: prerequisites & access

**Host:** AWS EC2, **ap-south-1**, **Ubuntu**, systemd, **2 vCPU / 7.6 GB**.

**Tooling (install once):**
- **Node** v24.x (`/usr/bin/node`) — runs the built `dist/` output.
- **bun** 1.3.x (`~/.bun/bin/bun`) — installs deps and runs the builds.
- **git** + **gh** (authenticated, so `git pull`/`git push` work over HTTPS).
- **tailscale** (`tailscaled` service) — the only VPN/perimeter.
- **Claude Code** CLI (`/usr/bin/claude`) — the pooled agent runtime.
- **Firebase CLI** — NOT required on the box; the RTDB-rules deploy runs from any
  Firebase-authenticated machine (e.g. the owner's Mac).

**Access:**
- SSH: `ssh -i <key.pem> ubuntu@<host>`.
- The box has **no Elastic IP** — the **public IP rotates on every reboot**. SSH/22 is
  the only public port and works as a fallback (e.g. it was `3.111.40.229`). Prefer the
  **Tailscale IP** when your machine is on the same tailnet; otherwise use the current
  public IP (check the AWS console after a reboot).
- On macOS, the SSH key must live **outside `~/Downloads`** (that folder is TCC-blocked
  for automation processes) — keep it at e.g. `~/Desktop/<key>.pem`, `chmod 400`.

**One-time swap** (the web build OOMs at Node's 2 GB default heap on this 2-core box):
```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Repository & branches

- Checkout: `/home/ubuntu/agent-maestro` (a real git clone; `gh` authed as the repo owner).
- Deploy from a branch that contains the feature you're shipping — currently **`staging`**
  carries the Trusted-Hub gateway + dashboard. (`/home/ubuntu/maestro` is a stale,
  non-git snapshot — ignore it.)
- The systemd units point `ExecStart`/`WorkingDirectory` at `/home/ubuntu/agent-maestro`,
  so **updating = `git pull` + rebuild + restart** in that one checkout.

---

## 4. Building

```bash
cd /home/ubuntu/agent-maestro
export PATH="$HOME/.bun/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=6144"   # avoids the web-build OOM

bun install                     # workspace deps
bun run build:server            # tsc -> maestro-server/dist/
bun run build:gateway           # tsc -> maestro-gateway/dist/
# CLI (only if agents run the maestro CLI from this checkout):
bun run build:cli               # tsc -> maestro-cli/dist/
```

**Web builds — two separate outputs, do not mix them up:**
```bash
cd maestro-ui
# (a) single-server SPA served by :4570  -> maestro-ui/dist
NODE_OPTIONS=--max-old-space-size=6144 bun run build:web
# (b) gateway SPA (firebase login gate baked in) -> maestro-ui/dist-gateway
NODE_OPTIONS=--max-old-space-size=6144 bun run build:web:gateway
```
- `build:web` = `VITE_APP_MODE=browser vite build` → `maestro-ui/dist`.
- `build:web:gateway` = same **plus `VITE_MAESTRO_AUTH_MODE=firebase`**, output
  `--outDir dist-gateway`. The firebase flag is **build-time**: the resulting bundle
  ALWAYS shows the Google-login gate, so it must live in its own dir and only the
  gateway may serve it (never let :4570 serve `dist-gateway`, or the single-server UI
  gets gate-locked).

### ⚠️ node-pty native binary (mandatory check after every `bun install`)
`node-pty` ships prebuilds only for **darwin/win32** — there is **no linux prebuild**.
The server won't start without a linux `pty.node`. Verify and restore if missing:
```bash
ls node_modules/node-pty/build/Release/pty.node   # must exist
node -e "require('node-pty'); console.log('node-pty OK')"
# If missing, copy a matching-version (1.1.0) compiled binary into place, e.g. from a
# previous working checkout, then re-verify:
#   mkdir -p node_modules/node-pty/build/Release
#   cp <known-good>/pty.node node_modules/node-pty/build/Release/pty.node
```
(No `spawn-helper` is needed on Linux — that's a macOS-only artifact.)

### ⚠️ Build heap
Every `build:web*` OOMs at Node's default ~2 GB heap. Always export
`NODE_OPTIONS=--max-old-space-size=6144`. With swap present it's safe; the step pegs
both cores for ~90 s.

---

## 5. maestro-server (single-user, :4570)

### 5.1 Config — `/etc/maestro/maestro.env`
```ini
NODE_ENV=production
PORT=4570
HOST=127.0.0.1

DATA_DIR=/home/ubuntu/.maestro/data
SESSION_DIR=/home/ubuntu/.maestro/sessions

MAESTRO_PTY_HOST=server            # server hosts the terminal PTYs (headless box)
MANIFEST_GENERATOR=server

MAESTRO_AUTH_ENABLED=true          # password gate for the web UI/API
MAESTRO_AUTH_PASSWORD=<secret>     # keep out of git
MAESTRO_AUTH_SECRET=<secret>       # session-signing secret

MAESTRO_ALLOWED_ORIGINS=https://<your-tailnet-host>   # e.g. https://maestro.tail28ac62.ts.net
LOG_LEVEL=info
LOG_FORMAT=json
```
- `MAESTRO_PTY_HOST=server` is the make-or-break flag for a headless box: the server
  process itself hosts every terminal PTY (spawns `claude` under it). Without it, spawn
  only emits an event nobody acts on.
- `MAESTRO_ALLOWED_ORIGINS` must match the exact HTTPS host the browser uses. **If the
  tailnet hostname changes (e.g. after a Tailscale account switch), update this and
  restart the server.**

### 5.2 systemd unit — `/etc/systemd/system/maestro-server.service`
```ini
[Unit]
Description=Maestro Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/agent-maestro
EnvironmentFile=/etc/maestro/maestro.env
ExecStart=/usr/bin/node /home/ubuntu/agent-maestro/maestro-server/dist/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=maestro-server

[Install]
WantedBy=multi-user.target
```
Install / (re)start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now maestro-server
sudo systemctl status maestro-server --no-pager
```

### 5.3 Verify
```bash
systemctl is-active maestro-server
curl -s http://127.0.0.1:4570/health                 # -> 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4570/          # SPA -> 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4570/api/projects
```
The server serves the SPA from `maestro-ui/dist` (relative to the checkout), the REST
API at `/api`, the entity-sync WebSocket at `/`, and PTYs at `/pty?sessionId=<id>`.

---

## 6. Claude auth (the pooled subscription)

Claude Code stores its login under a **config dir**:
- **Credentials/token:** `<CLAUDE_CONFIG_DIR>/.credentials.json`
- **Settings/state:** `<CLAUDE_CONFIG_DIR>/.claude.json` (onboarding flags, trusted
  projects, etc.). When `CLAUDE_CONFIG_DIR` is **unset**, the default config file is
  `~/.claude.json` (home) while credentials still live in `~/.claude/.credentials.json`.

### 6.1 Initial login (once, as `ubuntu`)
Run `claude` interactively over SSH and complete the Google/OAuth login. This writes
`~/.claude/.credentials.json` (+ `~/.claude.json`). The single-server `:4570` uses this
by default (it sets no `CLAUDE_CONFIG_DIR`).

### 6.2 Shared pool for the gateway
Every per-user gateway instance is launched with **`CLAUDE_CONFIG_DIR=/home/ubuntu/.claude`**
so they all share ONE logged-in Claude identity (the pooled subscription). The
`PtyHostService` merges `{...process.env, ...}` into each spawned PTY, so the injected
`CLAUDE_CONFIG_DIR` reaches the `claude` child.

**Gotcha (handled in code):** with `CLAUDE_CONFIG_DIR=~/.claude`, Claude reads
`~/.claude/.claude.json` — which is *not* the box's full home config (`~/.claude.json`).
Left fresh, interactive `claude` re-runs first-run onboarding. The gateway's
`prepareSharedClaudeConfig()` seeds `~/.claude/.claude.json` at startup
(`hasCompletedOnboarding=true` + theme + trusted projects) so pooled instances skip
onboarding. Auth itself always works because the token in `.credentials.json` is reachable.

---

## 7. Codex auth (optional, Claude-only by default)

Not configured by default (`~/.codex` absent). To add a shared Codex pool:
1. `codex login` once as `ubuntu` → writes `~/.codex`.
2. Uncomment `CODEX_HOME=/home/ubuntu/.codex` in `/etc/maestro/gateway.env`.
3. Restart the gateway. The gateway's credential source injects `CODEX_HOME` into every
   per-user instance the same way it does `CLAUDE_CONFIG_DIR`.

---

## 8. Tailscale (perimeter + HTTPS)

The app is **tailnet-only**; `tailscale serve` terminates HTTPS and proxies to the
loopback ports.

```bash
# Enable HTTPS/Serve for the tailnet once (Tailscale admin console: DNS → HTTPS certs).
# Then map the ports:
sudo tailscale serve --bg --https=443  http://127.0.0.1:4570   # single-server
sudo tailscale serve --bg --https=8443 http://127.0.0.1:4580   # gateway (side port)
sudo tailscale serve status                                    # verify both mappings
```
- The public URL is `https://<node>.<tailnet>.ts.net` (e.g. `maestro.tail28ac62.ts.net`),
  which resolves via **MagicDNS only for devices signed into that same tailnet/account**.
- **Switching the Tailscale account** (different Google login) renames the tailnet
  (new `*.ts.net` host + new `100.x` IP). After a switch you MUST:
  1. re-create the `tailscale serve` mappings on the new tailnet,
  2. update `MAESTRO_ALLOWED_ORIGINS` and restart `maestro-server`,
  3. add the new host to Firebase **Authorized domains** (§9.4),
  4. ensure each browsing device is signed into the new account's tailnet.
  Do the switch over the **public-IP SSH** (the tailnet IP dies mid-switch), and if peer
  connectivity is flaky afterwards, `sudo systemctl restart tailscaled` (see §12).

---

## 9. maestro-gateway (Trusted Hub) — full setup

The canonical step-by-step lives in **`maestro-gateway/deploy/DEPLOY.md`**; this section
is the operational summary + the auth model.

### 9.1 Config — `/etc/maestro/gateway.env`
Copy the template and edit:
```bash
sudo mkdir -p /etc/maestro
sudo cp maestro-gateway/deploy/gateway.env.example /etc/maestro/gateway.env
```
Key vars:
```ini
MAESTRO_GATEWAY_PORT=4580
MAESTRO_GATEWAY_HOST=127.0.0.1
MAESTRO_HUB_DIR=/home/ubuntu/hub
MAESTRO_INSTANCE_PORT_START=4600
MAESTRO_INSTANCE_PORT_END=4699
MAESTRO_SERVER_ENTRY=/home/ubuntu/agent-maestro/maestro-server/dist/server.js
MAESTRO_SERVER_CWD=/home/ubuntu/agent-maestro
MAESTRO_UI_DIST=/home/ubuntu/agent-maestro/maestro-ui/dist          # Phase 1
CLAUDE_CONFIG_DIR=/home/ubuntu/.claude                             # pooled Claude
# CODEX_HOME=/home/ubuntu/.codex                                   # optional pooled Codex
NODE_ENV=production
LOG_LEVEL=info
```
The gateway injects into every child instance: `PORT` (from the 4600–4699 range),
`HOST=127.0.0.1`, `MAESTRO_PTY_HOST=server`, `MAESTRO_AUTH_ENABLED=false` (the gateway
is the sole authenticator on loopback), per-user `DATA_DIR`/`SESSION_DIR`, plus the
shared `CLAUDE_CONFIG_DIR`/`CODEX_HOME`.

### 9.2 systemd unit — `/etc/systemd/system/maestro-gateway.service`
```bash
sudo cp maestro-gateway/deploy/maestro-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now maestro-gateway
```
`KillMode=control-group` means a `restart`/`stop` tears down every per-user child too;
`reconcileOnBoot` respawns them on the next start (brief, expected).

### 9.3 Phase 1 — dev auth (tailnet-only bring-up, no Firebase)
`gateway.env` defaults: `MAESTRO_GATEWAY_AUTH=dev`, `MAESTRO_ENFORCE_ALLOWLIST=false`.
Dev auth **trusts the `x-maestro-uid` header** — only acceptable because the gateway
binds loopback behind Tailscale. Smoke test:
```bash
curl -s http://127.0.0.1:4580/gateway/health
curl -s -H "x-maestro-uid: tester1" http://127.0.0.1:4580/api/projects   # provisions tester1
ls -la /home/ubuntu/hub                                                   # tester1/ + registry.json
```
Each uid gets an isolated `~/hub/<uid>/{data,sessions,projects}` with a seeded
"My Workspace" project; `registry.json` maps uid → port.

**Pooled-subscription live check:** spawn a PTY through the gateway and confirm `claude`
comes up on the shared login:
```bash
curl -s -X POST http://127.0.0.1:4580/api/pty/spawn \
  -H "x-maestro-uid: tester1" -H "Content-Type: application/json" \
  -d '{"sessionId":"livecheck","command":"claude","cwd":"/home/ubuntu/hub/tester1/projects"}'
# then confirm the claude child is under the tester's instance and has CLAUDE_CONFIG_DIR:
#   ps -ef | grep claude ;  cat /proc/<pid>/environ | tr '\0' '\n' | grep CLAUDE_CONFIG_DIR
```
(Server-hosted PTY is a two-step flow: `POST /api/sessions/spawn` creates the session
record; `POST /api/pty/spawn {sessionId,command,cwd}` launches the actual PTY, attachable
over `/pty?sessionId=<id>`.)

### 9.4 Phase 2 — Firebase Google login + allowlist
1. **Service-account key** (NOT in git — gitignored). Deliver the
   `maestro-5f3fc-firebase-adminsdk-*.json` to the box out-of-band and place it:
   ```bash
   sudo mv ~/firebase-sa.json /etc/maestro/firebase-sa.json
   sudo chmod 600 /etc/maestro/firebase-sa.json
   ```
   (On macOS, copy it out of `~/Downloads` first — TCC-blocked — then `scp` it over.)
2. **Allowlist** — who may provision a workspace (hot-reloads, no restart):
   ```bash
   cat > /home/ubuntu/hub/allowlist.json <<'JSON'
   {"emails":["you@gmail.com","teammate@gmail.com"]}
   JSON
   ```
3. **Switch env to firebase** in `/etc/maestro/gateway.env`:
   ```ini
   MAESTRO_GATEWAY_AUTH=firebase
   MAESTRO_FIREBASE_PROJECT_ID=maestro-5f3fc
   MAESTRO_FIREBASE_CREDENTIALS=/etc/maestro/firebase-sa.json
   MAESTRO_ENFORCE_ALLOWLIST=true
   MAESTRO_UI_DIST=/home/ubuntu/agent-maestro/maestro-ui/dist-gateway   # separate build
   ```
4. **Build the gateway SPA** (separate dir) and restart:
   ```bash
   cd maestro-ui && NODE_OPTIONS=--max-old-space-size=6144 bun run build:web:gateway
   sudo systemctl restart maestro-gateway
   sudo journalctl -u maestro-gateway -n 30 --no-pager   # expect: firebase-admin initialized,
                                                         # allowlist loaded (N entries)
   ```
5. **Firebase Authorized domains** (owner, in the console): add the tailnet host under
   **Authentication → Settings → Authorized domains**, else `signInWithPopup` fails with
   `auth/unauthorized-domain`.

### 9.5 Gateway dashboard + presence (Firebase Realtime Database)
The dashboard at **`/gateway`** shows the allowlisted roster, live browser presence, and a
per-member working-agent count. Presence is stored in **Firebase Realtime Database**
(`gatewayPresence/<uid>`) so Firebase auto-removes a member when their browser disconnects.
1. Firebase Console → **Build → Realtime Database** → create the default DB for `maestro-5f3fc`.
2. Deploy the repo's RTDB rules from any **Firebase-authenticated** machine (the box has no
   Firebase CLI):
   ```bash
   firebase deploy --only database --project maestro-5f3fc
   ```
   Rules (`database.rules.json`): authenticated users may read presence; each user may
   only write/remove their own `gatewayPresence/<uid>` record.
3. If using a non-default RTDB instance, set `VITE_FIREBASE_DATABASE_URL` at gateway
   SPA build time.

### 9.6 Side-port test, then domain flip
```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:4580   # test; :443 still -> :4570
# Browse https://<host>:8443 → "Continue with Google" → allowlisted account → private workspace.
# A non-allowlisted account must 403. When proven:
sudo tailscale serve --https=443 http://127.0.0.1:4580         # domain now = gateway
sudo tailscale serve --https=8443 off
```

### 9.7 Hub auth flow (how a request is routed)
1. Browser loads the firebase SPA (from `dist-gateway`); user signs in with Google →
   Firebase ID token.
2. Every request carries the token: REST `Authorization: Bearer <token>`, WS/PTY
   `?token=<token>` (WebSockets can't set headers).
3. Gateway verifies the token with `firebase-admin` → email; checks the **allowlist**
   (403 if absent); maps uid → that user's `maestro-server` instance (spawning it if
   needed), then reverse-proxies `/api /ws /pty` to it on loopback.
4. The child instance runs with `MAESTRO_AUTH_ENABLED=false` (it only ever sees
   authenticated, loopback traffic) and the injected pooled Claude config. The gateway
   **strips the `Origin` header** before proxying, so per-instance CORS never rejects the
   public host.

---

## 10. Updating / redeploying

```bash
cd /home/ubuntu/agent-maestro
git fetch origin && git checkout <branch> && git pull --ff-only
export PATH="$HOME/.bun/bin:$PATH"; export NODE_OPTIONS="--max-old-space-size=6144"
bun install
# verify node-pty linux binary (§4) after install!
bun run build:server
bun run build:gateway
cd maestro-ui && bun run build:web:gateway         # (or build:web for the :4570 SPA)
cd .. && sudo systemctl restart maestro-gateway    # restarting the gateway respawns instances
# maestro-server (:4570) only needs a restart if you changed server behavior it should pick up.
```
Data (`~/.maestro/data`, `~/hub/<uid>/`) is independent of the code dir, so updates never
lose user data.

---

## 11. Verify / operate

```bash
# services
systemctl is-active maestro-server maestro-gateway
# gateway health + mode + workspace count
curl -s http://127.0.0.1:4580/gateway/health          # {"status":"ok","mode":"firebase","workspaces":N}
# logs
sudo journalctl -u maestro-gateway -n 50 --no-pager
sudo journalctl -u maestro-server  -n 50 --no-pager
# per-user instances listening
ss -ltn | grep -E ':46[0-9][0-9]'
# from a tailnet device (both should be 200):
curl -sk -o /dev/null -w '%{http_code}\n' https://<host>:8443/
curl -sk -o /dev/null -w '%{http_code}\n' https://<host>:8443/gateway
```

**Rollback (gateway):** `sudo systemctl stop maestro-gateway` (tears down all children).
Re-point serve to the single server if it was moved:
`sudo tailscale serve --https=443 http://127.0.0.1:4570`. The single server and its data
are never touched by the gateway.

---

## 12. Troubleshooting (issues seen in practice)

| Symptom | Cause | Fix |
|---|---|---|
| Server won't start: `Failed to load native module: pty.node` | `node-pty` has no linux prebuild; `bun install` didn't leave a linux binary | Restore `node_modules/node-pty/build/Release/pty.node` (v1.1.0), re-verify (§4) |
| `build:web*` dies: `JavaScript heap out of memory` | Node's ~2 GB default heap | `export NODE_OPTIONS=--max-old-space-size=6144` (+ swap, §2) |
| `build:server` fails `TS2451: Cannot redeclare ...` | merge artifact (duplicate const) | remove the duplicate declaration; rebuild |
| Browser at `:8443` shows the login wall on the **single-server** URL too | firebase SPA built into the shared `maestro-ui/dist` | build with `build:web:gateway` (separate `dist-gateway`); point only the gateway's `MAESTRO_UI_DIST` at it |
| Session-spawn 403 / CORS: instance rejects `Origin https://<host>` | per-instance CORS allowlist lacks the public host | gateway strips `Origin` before proxying (ensure you're on the fixed build) |
| Google popup: `auth/unauthorized-domain` | tailnet host not in Firebase Authorized domains | add the host in Firebase Console → Auth → Settings → Authorized domains |
| Gateway 401 with a valid token right after load | app fired API calls before Firebase restored the token | fixed in client (auth-wait before startup fetches); ensure latest `dist-gateway` |
| Gateway 401/allowlist confusion | a non-token request 401s **before** the allowlist check runs, so it won't log `allowlist loaded` | that's expected; the reload logs on the next token-bearing request |
| Interactive `claude` re-runs onboarding in a workspace | `~/.claude/.claude.json` fresh vs. home `~/.claude.json` | gateway seeds it at startup (`prepareSharedClaudeConfig`); auth still works via `.credentials.json` |
| After Tailscale **account switch**: page "loads nothing", `tailscale ping` works but TCP/curl times out | `tailscaled` left in a half-established state (stale old-tailnet-IP listener; one-way peer data plane) | `sudo systemctl restart tailscaled` on the box (SSH via public IP); re-verify serve + `MAESTRO_ALLOWED_ORIGINS` |
| Can't SSH via the old public IP after a reboot | no Elastic IP; public IP rotated | use the current public IP (AWS console) or the Tailscale IP |
| macOS: can't read the `.pem` / SA key | `~/Downloads` is TCC-blocked for the process | copy the file to `~/Desktop` (or another allowed dir) first |

---

## 13. Security notes

- The whole stack is **tailnet-only**; no ports but SSH/22 are public. Dev-header gateway
  auth (`MAESTRO_GATEWAY_AUTH=dev`) is ONLY safe because the gateway binds loopback behind
  Tailscale — never expose it publicly in dev mode.
- Secrets live in `/etc/maestro/*` (chmod 600 for the SA key), never in git. The Firebase
  service-account JSON is gitignored by design.
- Per-user isolation is **soft** (single OS user, separate data/session/project dirs under
  `~/hub/<uid>/`). The Firebase allowlist gates who can provision a workspace at all.
- One shared Claude/Codex subscription is pooled across all users by design (Design A);
  all instances read the same `CLAUDE_CONFIG_DIR`.

---

*Related: `maestro-gateway/deploy/DEPLOY.md` (gateway step-by-step), `docs/trusted-hub/DESIGN-A.md`
(architecture), `CLAUDE.md` (repo overview & dual-environment dev).*
