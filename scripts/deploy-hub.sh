#!/usr/bin/env bash
# One-command deploy of the Hub to the EC2 demo box (maestro.tail28ac62.ts.net).
# Uses Tailscale SSH (keyless — works because you're logged into the same tailnet
# as the box). Safe: excludes secrets/.env, never touches your data (~/.maestro),
# and only restarts the service after a successful build.
#     ./scripts/deploy-hub.sh
set -euo pipefail
TARGET="ubuntu@maestro"          # tailnet hostname; falls back below if needed
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking access to the box (Tailscale SSH)…"
if ! tailscale ssh "$TARGET" true 2>/dev/null; then
  echo "  Tailscale SSH to $TARGET failed."
  echo "  Try: tailscale ssh ubuntu@maestro whoami"
  echo "  (If that also fails, the box may need 'tailscale up --ssh' enabled, or"
  echo "   you deployed it from a different machine/key — tell me and we'll adjust.)"
  exit 1
fi
echo "  OK."

echo "==> [1/2] Syncing code to the demo box (no secrets, no data touched)…"
rsync -az --delete \
  --exclude=node_modules --exclude=dist --exclude=.git \
  --exclude='maestro-ui/src-tauri/target' --exclude='*.log' \
  --exclude='.env' --exclude='.env.*' --exclude='**/.env' --exclude='**/.env.*' --exclude='.firebase' \
  -e "tailscale ssh" \
  ./ "$TARGET:~/maestro/"

echo "==> [2/2] Rebuilding the web UI + restarting (build must pass first)…"
tailscale ssh "$TARGET" \
  'export PATH=$HOME/.bun/bin:$PATH; export NODE_OPTIONS=--max-old-space-size=4096; \
   cd ~/maestro/maestro-ui && bun run build:web && \
   sudo systemctl restart maestro-server && sleep 2 && systemctl is-active maestro-server'

echo ""
echo "==> Done. New build hash on the demo:"
curl -sk https://maestro.tail28ac62.ts.net:8443/ | grep -oE 'assets/index-[A-Za-z0-9]+\.js' | head -1
echo "    Hard-refresh https://maestro.tail28ac62.ts.net:8443/ to see the changes."
