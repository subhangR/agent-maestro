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

## Phase 2 — cut over the domain + real login (when Phase 1 is proven)

```bash
# Point the Tailscale serve at the gateway instead of the old :4570 server.
sudo tailscale serve --https=443 http://127.0.0.1:4580
# (verify: tailscale serve status  → 443 maps to 4580)
```

Then switch `/etc/maestro/gateway.env` to the Phase 2 block (Firebase auth + allowlist),
add the service-account JSON + `allowlist.json`, `bun add firebase-admin`, rebuild,
`systemctl restart maestro-gateway`. Optionally migrate the owner's existing
`~/.maestro/data` into `/home/ubuntu/hub/<owner-uid>/data` and retire
`maestro-server.service`.

**Rebuild the SPA with the gateway-auth flag** so the browser attaches each user's
Firebase ID token to REST/WS/PTY (M4, gated — off by default):

```bash
cd /home/ubuntu/agent-maestro/maestro-ui
VITE_MAESTRO_AUTH_MODE=firebase bun run build:web
# The gateway serves this dist at the box origin; base URLs resolve to same-origin
# (= the gateway), so no VITE_API_URL/VITE_WS_URL is needed.
```

Without this flag the client is the normal single-server build (no token attached);
with it, every request carries the signed-in user's token for uid→instance routing.

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
