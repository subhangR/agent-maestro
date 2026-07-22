# Deploying the Trusted-Team Hub gateway on the VPS

Target box: AWS ap-south-1, Ubuntu, systemd, Node v24, bun 1.3, 2 vCPU / 7.6GB.
Repo checkout: `/home/ubuntu/agent-maestro`. Existing `maestro-server.service` on
`:4570` stays **untouched** through Phase 1 — the gateway runs alongside it.

## Prereqs (once)

```bash
# 0. Add swap — box has 0B and build:web OOMs at Node's 2GB default heap.
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 1. Pull the branch + build server, ui, and gateway.
cd /home/ubuntu/agent-maestro
git fetch origin && git checkout feat/trusted-hub-gateway && git pull
bun install
bun run build:server         # dist the server the gateway will spawn
bun run build:gateway        # dist the gateway
# (maestro-ui/dist should already exist from the earlier build:web; rebuild if stale)
```

## Phase 1 — bring up on Tailscale, dev auth, no Firebase

```bash
sudo mkdir -p /etc/maestro
sudo cp maestro-gateway/deploy/gateway.env.example /etc/maestro/gateway.env
# (Phase 1 defaults are already correct: dev auth, allowlist off, CLAUDE_CONFIG_DIR=~/.claude)

sudo cp maestro-gateway/deploy/maestro-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now maestro-gateway
sudo systemctl status maestro-gateway --no-pager

# Smoke test ON-BOX (does not touch the existing :4570 server or the :443 serve):
curl -s http://127.0.0.1:4580/gateway/health
curl -s -H "x-maestro-uid: tester1" http://127.0.0.1:4580/api/projects   # provisions tester1
curl -s -H "x-maestro-uid: tester2" http://127.0.0.1:4580/api/projects   # provisions tester2
ls -la /home/ubuntu/hub                                                   # tester1/ tester2/ + registry.json
```

Expect: each tester gets an isolated workspace under `/home/ubuntu/hub/<uid>/` with a
seeded "My Workspace" project; `gateway/health` shows the workspace count.

### Verify a real agent runs on the pooled subscription
Spawn a session in a tester workspace (via the API/CLI against `:4580` with the
`x-maestro-uid` header) and confirm the `claude` PTY starts using `~/.claude`. This is
the live check that the shared-subscription injection works for a gateway-spawned instance.

## Phase 2 — real Google login + domain cutover (when Phase 1 is proven)

Order matters: configure + rebuild + test on a SIDE port first, then flip `:443`.
Everything here is reversible (see Rollback).

### 2.1 Server-side Firebase verification (firebase-admin + SA key)
```bash
cd /home/ubuntu/agent-maestro
git pull                                  # get the login-gate + M4 client commits
bun install                               # installs firebase-admin (gateway dep)
bun run build:gateway

# Service-account key: the repo already ships one at the repo root
# (maestro-5f3fc-firebase-adminsdk-*.json). Point the gateway at it, or copy to
# /etc/maestro/firebase-sa.json (chmod 600). NOTE: this key is committed to git —
# acceptable ONLY behind Tailscale; ROTATE + purge from history before any public move.
sudo cp maestro-5f3fc-firebase-adminsdk-*.json /etc/maestro/firebase-sa.json
sudo chmod 600 /etc/maestro/firebase-sa.json
```

### 2.2 Allowlist (who may provision a workspace)
```bash
# Only these Google accounts get a workspace. Hot-reloads — add teammates anytime.
cat > /home/ubuntu/hub/allowlist.json <<'JSON'
{ "emails": ["manzilshaik95@gmail.com"] }
JSON
```

### 2.3 Switch gateway to Firebase auth
Edit `/etc/maestro/gateway.env`: comment the Phase-1 two lines, uncomment the Phase-2
block (`MAESTRO_GATEWAY_AUTH=firebase`, `MAESTRO_FIREBASE_PROJECT_ID=maestro-5f3fc`,
`MAESTRO_FIREBASE_CREDENTIALS=/etc/maestro/firebase-sa.json`, `MAESTRO_ENFORCE_ALLOWLIST=true`).
Then `sudo systemctl restart maestro-gateway` and check `journalctl -u maestro-gateway`
shows `firebase-admin initialized`.

### 2.4 Rebuild the SPA with the gateway-auth flag
This bakes in the Google login gate + per-request token attachment (M4).
```bash
cd /home/ubuntu/agent-maestro/maestro-ui
# NODE_OPTIONS bumps the heap — build:web OOMs at Node's 2GB default on this box.
NODE_OPTIONS=--max-old-space-size=6144 VITE_MAESTRO_AUTH_MODE=firebase bun run build:web
# base URLs resolve to same-origin (= the gateway), so no VITE_API_URL/VITE_WS_URL needed.
```
Watch the 2-core/swap box here — build:web is the heaviest step (~90s, ~2GB heap).

### 2.5 Test on a side port BEFORE flipping :443
```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:4580   # :443 still -> :4570
```
Open `https://maestro.tail6cfd2b.ts.net:8443` in a browser → expect the "Continue with
Google" gate → sign in with an allowlisted account → land in a fresh private workspace.
A non-allowlisted account must be rejected (403).

### 2.6 Flip the domain
```bash
sudo tailscale serve --https=443 http://127.0.0.1:4580   # domain now = gateway
sudo tailscale serve --https=8443 off
```

### ⚠️ Owner-only gotchas (I can't do these from here)
- **Firebase authorized domains**: `signInWithPopup` from `maestro.tail6cfd2b.ts.net`
  requires that host in Firebase Console → Authentication → Settings → Authorized domains.
  If Collab already logs in from this domain it's set; else the popup fails with
  `auth/unauthorized-domain`.
- **Owner's existing data**: after cutover you log in and get a FRESH empty
  `~/hub/<your-uid>/` workspace — your old projects on `:4570`/`~/.maestro/data` are NOT
  gone, just not shown in the new workspace. Migrate later by copying `~/.maestro/data`
  into `~/hub/<your-uid>/data` (stop that instance first), or keep `:4570` reachable.

## Rollback
`sudo systemctl stop maestro-gateway` (KillMode=control-group tears down all per-user
instances). Re-point serve to `:4570` if it was moved: `sudo tailscale serve --https=443
http://127.0.0.1:4570`. The existing server and its data are never touched by Phase 1.

## Notes / watch-items on this box
- **2 vCPU** bottlenecks under concurrent agents/builds. Keep active users low; a single
  `build:web` pegs both cores ~90s.
- **Disk**: confirm free space before onboarding many users; per-user `projects/` clones
  can grow. Grow the EBS volume if headroom is thin.
- Instances share the one node_modules (with the manually-fixed linux `node-pty`), so new
  users cost only data/session dirs — cheap to provision.
