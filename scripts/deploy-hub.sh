#!/usr/bin/env bash
# One-command deploy of the Hub to the EC2 demo box (maestro.tail28ac62.ts.net).
# Safe: excludes secrets/.env, never touches your data (~/.maestro), and only
# restarts the service after a successful build. Run it from your Mac:
#     ./scripts/deploy-hub.sh
set -euo pipefail
KEY="$HOME/.ssh/maestro_deploy"
TARGET="ubuntu@100.101.22.61"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> [1/2] Syncing code to the demo box (no secrets, no data touched)…"
rsync -az --delete \
  --exclude=node_modules --exclude=dist --exclude=.git \
  --exclude='maestro-ui/src-tauri/target' --exclude='*.log' \
  --exclude='.env' --exclude='.env.*' --exclude='**/.env' --exclude='**/.env.*' --exclude='.firebase' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  ./ "$TARGET:~/maestro/"

echo "==> [2/2] Rebuilding the web UI + restarting (build must pass first)…"
ssh -i "$KEY" "$TARGET" \
  'export PATH=$HOME/.bun/bin:$PATH; export NODE_OPTIONS=--max-old-space-size=4096; \
   cd ~/maestro/maestro-ui && bun run build:web && \
   sudo systemctl restart maestro-server && sleep 2 && systemctl is-active maestro-server'

echo ""
echo "==> Done. New build hash on the demo:"
curl -sk https://maestro.tail28ac62.ts.net:8443/ | grep -oE 'assets/index-[A-Za-z0-9]+\.js' | head -1
echo "    Hard-refresh https://maestro.tail28ac62.ts.net:8443/ to see the changes."
