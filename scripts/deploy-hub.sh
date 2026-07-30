#!/usr/bin/env bash
# scripts/deploy-hub.sh — Deploy Agent Maestro hub from a developer machine to the EC2 box.
#
# Connects via Tailscale SSH (keyless — you must be on the same tailnet).
# Syncs the local repo, runs a full rebuild of all packages, restarts both
# systemd services, and verifies the live revision via the gateway health endpoint.
#
# Usage:
#   ./scripts/deploy-hub.sh [--skip-ui] [--target ubuntu@maestro]
#
#   --skip-ui             Skip the heavy maestro-ui gateway build (~90s).
#   --target <user@host>  Override the Tailscale SSH target (default: ubuntu@maestro).
#
# IMPORTANT: This syncs your local working tree, NOT the latest GitHub commit.
# To deploy from GitHub instead, SSH into the box and run scripts/deploy-local.sh.

set -euo pipefail

SKIP_UI=0
TARGET="ubuntu@maestro"

for arg in "$@"; do
  case "$arg" in
    --skip-ui)     SKIP_UI=1 ;;
    --target)      shift; TARGET="$1" ;;
    --target=*)    TARGET="${arg#--target=}" ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> [1/4] Checking Tailscale SSH access to $TARGET …"
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "$TARGET" true 2>/dev/null; then
  echo "ERROR: SSH to $TARGET failed."
  echo "  Ensure tailscale is up and the box has SSH enabled."
  exit 1
fi
echo "  OK."

echo ""
echo "==> [2/4] Syncing repo to $TARGET:~/agent-maestro/ (no secrets, no node_modules/dist) …"
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='dist-gateway' \
  --exclude='.git' \
  --exclude='maestro-ui/src-tauri/target' \
  --exclude='*.log' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='**/.env' \
  --exclude='**/.env.*' \
  -e "ssh -o StrictHostKeyChecking=accept-new" \
  ./ "$TARGET:~/agent-maestro/"

echo ""
echo "==> [3/4] Building and restarting on $TARGET …"
ssh -o StrictHostKeyChecking=accept-new "$TARGET" bash -s -- "$SKIP_UI" <<'REMOTE'
set -euo pipefail
SKIP_UI="$1"
export PATH="$HOME/.bun/bin:$PATH"
cd ~/agent-maestro

echo "  Installing dependencies …"
bun install --frozen-lockfile 2>/dev/null || bun install

if [[ "$SKIP_UI" == "0" ]]; then
  echo "  Building UI gateway bundle (may take ~90s) …"
  NODE_OPTIONS=--max-old-space-size=6144 bun run build:web:gateway
  [[ -f maestro-ui/dist-gateway/index.html ]] || { echo "ERROR: dist-gateway/index.html missing"; exit 1; }
fi

echo "  Building server + cli + gateway …"
bun run build:server
bun run build:cli
bun run build:gateway

STAMP=$(cat maestro-gateway/dist/.git-sha 2>/dev/null || echo 'unknown')
echo "  Build stamp: $STAMP"

echo "  Restarting services …"
sudo systemctl restart maestro-server
sleep 2
sudo systemctl is-active --quiet maestro-server \
  || { sudo journalctl -u maestro-server -n 20 --no-pager; echo "ERROR: maestro-server restart failed"; exit 1; }

sudo systemctl restart maestro-gateway
sleep 2
sudo systemctl is-active --quiet maestro-gateway \
  || { sudo journalctl -u maestro-gateway -n 20 --no-pager; echo "ERROR: maestro-gateway restart failed"; exit 1; }

echo "  Services running."
REMOTE

echo ""
echo "==> [4/4] Verifying live revision …"
GW_PORT=$(ssh -o StrictHostKeyChecking=accept-new "$TARGET" \
  "grep -E '^MAESTRO_GATEWAY_PORT=' /etc/maestro/gateway.env 2>/dev/null | cut -d= -f2 || echo 4580")

# Tunnel: query the gateway health endpoint through SSH to avoid needing the tailnet port open.
HEALTH=$(ssh -o StrictHostKeyChecking=accept-new "$TARGET" \
  "curl -sf http://127.0.0.1:${GW_PORT}/gateway/health 2>/dev/null || echo '{}'")

LIVE_COMMIT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('commit','unknown'))" 2>/dev/null || echo 'unknown')
LOCAL_SHA=$(git rev-parse HEAD)

echo ""
echo "==========================================="
echo "  Deploy complete."
echo "  Local SHA   : $LOCAL_SHA"
echo "  Live commit : $LIVE_COMMIT"
if [[ "$LIVE_COMMIT" == "$LOCAL_SHA" ]]; then
  echo "  Match       : YES ✓"
else
  echo "  WARNING: Live commit does not match local SHA."
  echo "  The synced tree may be dirty or the build stamp may be stale."
fi
echo "==========================================="
echo ""
echo "  To deploy from GitHub instead (canonical):"
echo "    ssh $TARGET 'cd ~/agent-maestro && ./scripts/deploy-local.sh'"
