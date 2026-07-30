#!/usr/bin/env bash
# scripts/deploy-hub.sh — Deploy Agent Maestro hub from a developer machine to the EC2 box.
#
# Connects via Tailscale SSH (keyless — you must be on the same tailnet).
# Syncs the local repo, runs a full rebuild of all packages, and (optionally)
# restarts both systemd services.
#
# SAFETY: By default this script ONLY builds — it does NOT restart services.
# Restarting maestro-server kills every in-flight agent session on the hub.
# The restart step is opt-in and requires confirmation that no sessions are active.
#
# Usage:
#   ./scripts/deploy-hub.sh [--skip-ui] [--target ubuntu@maestro] [--restart] [--force]
#
#   --skip-ui             Skip the heavy maestro-ui gateway build (~90s).
#   --target <user@host>  Override the Tailscale SSH target (default: ubuntu@maestro).
#   --restart             ALSO restart both systemd services after building.
#                         Aborts if active agent sessions are detected (see --force).
#   --force               With --restart: override the active-session guard.
#
# IMPORTANT: This syncs your local working tree, NOT the latest GitHub commit.
# To deploy from GitHub instead, SSH into the box and run scripts/deploy-local.sh.

set -euo pipefail

SKIP_UI=0
TARGET="ubuntu@maestro"
RESTART=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --skip-ui)     SKIP_UI=1 ;;
    --target)      shift; TARGET="$1" ;;
    --target=*)    TARGET="${arg#--target=}" ;;
    --restart)     RESTART=1 ;;
    --force)       FORCE=1 ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

if [[ $FORCE -eq 1 && $RESTART -eq 0 ]]; then
  echo "--force has no effect without --restart"; exit 1
fi

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
echo "==> [3/4] Building on $TARGET …"
ssh -o StrictHostKeyChecking=accept-new "$TARGET" bash -s -- "$SKIP_UI" "$RESTART" "$FORCE" <<'REMOTE'
set -euo pipefail
SKIP_UI="$1"
DO_RESTART="$2"
DO_FORCE="$3"
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

if [[ "$DO_RESTART" == "0" ]]; then
  echo "  Skipping service restart (--restart not passed)."
  echo "  Build complete. A human should restart when sessions are clear:"
  echo "    cd ~/agent-maestro && ./scripts/deploy-local.sh --skip-pull --skip-ui --restart"
else
  # Detect server port and check for active sessions before restarting.
  _SERVER_PORT=$(sudo grep -E '^PORT=' /etc/maestro/maestro.env 2>/dev/null | cut -d= -f2 || true)
  if [[ -z "$_SERVER_PORT" ]]; then
    for _p in 4570 4569 4567 3001; do
      if curl -sf --max-time 2 "http://127.0.0.1:${_p}/health" >/dev/null 2>&1; then
        _SERVER_PORT="$_p"; break
      fi
    done
  fi

  if [[ -n "$_SERVER_PORT" ]]; then
    _ACTIVE_JSON=$(curl -sf --max-time 5 \
      "http://127.0.0.1:${_SERVER_PORT}/api/sessions?active=true" 2>/dev/null || echo '[]')
    _ACTIVE_COUNT=$(echo "$_ACTIVE_JSON" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('items',d.get('sessions',[]))))" \
      2>/dev/null || echo 0)

    if [[ "$_ACTIVE_COUNT" -gt 0 && "$DO_FORCE" == "0" ]]; then
      echo ""
      echo "$_ACTIVE_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sessions = data if isinstance(data, list) else data.get('items', data.get('sessions', []))
for s in sessions:
    name = s.get('name') or (s.get('teamMemberSnapshot') or {}).get('name') or 'unnamed'
    print(f\"  [{s.get('status','?'):<8}] {s.get('id','?')[:16]}  {name}\")
" 2>/dev/null || true
      echo "ERROR: ABORT: $_ACTIVE_COUNT active agent session(s) found (listed above)."
      echo "  Restarting would kill them. Options:"
      echo "  • Wait for sessions to complete, then run:"
      echo "      ./scripts/deploy-hub.sh --skip-ui --restart"
      echo "  • Force (DESTRUCTIVE):"
      echo "      ./scripts/deploy-hub.sh --skip-ui --restart --force"
      exit 1
    fi

    if [[ "$_ACTIVE_COUNT" -gt 0 && "$DO_FORCE" == "1" ]]; then
      echo "  WARNING: --force: $_ACTIVE_COUNT active session(s) will be killed:"
      echo "$_ACTIVE_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
sessions = data if isinstance(data, list) else data.get('items', data.get('sessions', []))
for s in sessions:
    name = s.get('name') or (s.get('teamMemberSnapshot') or {}).get('name') or 'unnamed'
    print(f\"  [KILL] {s.get('id','?')[:16]}  {name}\")
" 2>/dev/null || true
      echo "  Proceeding in 5 seconds — Ctrl-C to abort..."
      sleep 5
    fi
  else
    echo "  Maestro server not responding on any known port — assuming down, safe to restart."
  fi

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
fi
REMOTE

echo ""
echo "==> [4/4] Verifying …"
LOCAL_SHA=$(git rev-parse HEAD)

if [[ $RESTART -eq 0 ]]; then
  echo ""
  echo "==========================================="
  echo "  Build-only sync complete (no restart)."
  echo "  Synced SHA  : $LOCAL_SHA"
  echo ""
  echo "  Services on $TARGET are still running the PREVIOUS build."
  echo "  When agent sessions are clear, run ONE of:"
  echo "    ssh $TARGET 'cd ~/agent-maestro && ./scripts/deploy-local.sh --skip-pull --skip-ui --restart'"
  echo "    ./scripts/deploy-hub.sh --skip-ui --restart"
  echo "==========================================="
else
  GW_PORT=$(ssh -o StrictHostKeyChecking=accept-new "$TARGET" \
    "grep -E '^MAESTRO_GATEWAY_PORT=' /etc/maestro/gateway.env 2>/dev/null | cut -d= -f2 || echo 4580")

  # Tunnel: query the gateway health endpoint through SSH.
  HEALTH=$(ssh -o StrictHostKeyChecking=accept-new "$TARGET" \
    "curl -sf http://127.0.0.1:${GW_PORT}/gateway/health 2>/dev/null || echo '{}'")

  LIVE_COMMIT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('commit','unknown'))" 2>/dev/null || echo 'unknown')

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
fi
