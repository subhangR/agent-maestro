#!/usr/bin/env bash
# deploy/deploy-ec2-tailscale.sh — EC2 (Ubuntu) deploy for Agent Maestro behind Tailscale.
#
# Differs from deploy.sh:
#   - Runs privileged steps via sudo (EC2 logs in as a non-root user, e.g. ubuntu)
#   - Binds maestro-server to 127.0.0.1 only (never publicly exposed)
#   - No public nginx on :80. Tailscale Serve terminates HTTPS + WS on the tailnet.
#
# Usage:
#   ./deploy-ec2-tailscale.sh <user@host> -i <key> --password <app_password> [--port <n>]
#
# This script does steps 1-5 (provision -> build -> env -> systemd). Tailscale
# install + `tailscale up` (interactive browser auth) + `tailscale serve` are run
# separately by the operator because `tailscale up` needs a one-time login.
#
# NOTE: Does NOT run `claude login` — do that manually on the box.

set -euo pipefail

SSH_TARGET=""
SSH_KEY_OPT=""
APP_PASSWORD=""
APP_PORT="4570"
ALLOWED_ORIGINS=""

usage() {
  cat <<EOF
Usage: $0 <user@host> -i <key> --password <pass> [--port <n>] [--allowed-origins <csv>]

  --allowed-origins <csv>  Comma-separated browser origins the SPA is served from
                           (e.g. https://maestro.<tailnet>.ts.net). Required for
                           web access so CORS doesn't 500 the SPA's own assets.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i)               SSH_KEY_OPT="-i $2"; shift 2 ;;
    --password)       APP_PASSWORD="$2"; shift 2 ;;
    --port)           APP_PORT="$2"; shift 2 ;;
    --allowed-origins) ALLOWED_ORIGINS="$2"; shift 2 ;;
    -h|--help)  usage ;;
    -*)         echo "Unknown option: $1"; usage ;;
    *)          if [[ -z "$SSH_TARGET" ]]; then SSH_TARGET="$1"; else echo "Unexpected arg: $1"; usage; fi; shift ;;
  esac
done

[[ -z "$SSH_TARGET" ]] && { echo "ERROR: <user@host> required"; usage; }
[[ -z "$APP_PASSWORD" ]] && { echo "ERROR: --password required"; usage; }

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30"
ssh_run()    { ssh $SSH_KEY_OPT $SSH_OPTS "$SSH_TARGET" "$@"; }
ssh_script() { ssh $SSH_KEY_OPT $SSH_OPTS "$SSH_TARGET" bash -s; }

REMOTE_USER="${SSH_TARGET%%@*}"
REMOTE_HOST="${SSH_TARGET##*@}"
REPO_DIR="/home/${REMOTE_USER}/maestro"
ENV_FILE="/etc/maestro/maestro.env"
SERVICE_NAME="maestro-server"
DATA_DIR="/home/${REMOTE_USER}/.maestro/data"
SESSION_DIR="/home/${REMOTE_USER}/.maestro/sessions"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> Deploying Agent Maestro to ${SSH_TARGET} (Tailscale mode)"
echo "    Repo dir : ${REPO_DIR}"
echo "    App port : ${APP_PORT} (bound to 127.0.0.1)"

# --------------------------------------------------------------------------
echo ""; echo "==> [1/5] Provisioning prerequisites (sudo)..."
ssh_script <<'PROVISION'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if ! command -v node &>/dev/null; then
  echo "  Installing Node LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo bash -
  sudo apt-get install -y nodejs
else
  echo "  Node already installed: $(node --version)"
fi

echo "  Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  git build-essential python3 python3-dev rsync curl ca-certificates openssl unzip

if ! command -v bun &>/dev/null; then
  echo "  Installing bun (build-time only)..."
  curl -fsSL https://bun.sh/install | bash
else
  echo "  bun already installed: $(bun --version)"
fi

if ! command -v claude &>/dev/null; then
  echo "  Installing Claude CLI..."
  sudo npm install -g @anthropic-ai/claude-code || echo "  WARN: Claude CLI install failed — install manually"
else
  echo "  Claude CLI already installed"
fi
echo "  Prerequisites OK"
PROVISION

# --------------------------------------------------------------------------
echo ""; echo "==> [2/5] Syncing repo (rsync local feat/web-ui tree)..."
ssh_run "mkdir -p ${REPO_DIR}"
rsync -az --delete \
  --exclude='node_modules' --exclude='dist' --exclude='.git' \
  --exclude='maestro-ui/src-tauri/target' --exclude='*.log' \
  ${SSH_KEY_OPT:+-e "ssh ${SSH_KEY_OPT} ${SSH_OPTS}"} \
  "${REPO_ROOT}/" "${SSH_TARGET}:${REPO_DIR}/"

# --------------------------------------------------------------------------
echo ""; echo "==> [3/5] Installing deps + building..."
ssh_run bash -s <<BUILDIT
set -euo pipefail
export BUN_INSTALL="\$HOME/.bun"; export PATH="\$BUN_INSTALL/bin:\$PATH"
export NODE_OPTIONS="--max-old-space-size=4096"
cd "${REPO_DIR}"
echo "  bun install..."; bun install --frozen-lockfile 2>/dev/null || bun install
# bun does not compile node-pty's native addon for this platform/Node ABI; rebuild
# it from source (node-gyp) so the server's PTY host loads pty.node at runtime.
echo "  rebuild node-pty native addon (node-gyp)..."; npm rebuild node-pty
chmod +x node_modules/node-pty/build/Release/spawn-helper 2>/dev/null || true
echo "  build maestro-server..."; (cd maestro-server && bun run build)
echo "  build maestro-ui (build:web)..."; (cd maestro-ui && bun run build:web)
[ -f maestro-ui/dist/index.html ] || { echo "ERROR: maestro-ui/dist/index.html missing"; exit 1; }
echo "  build maestro-cli..."; (cd maestro-cli && bun run build)
[ -f maestro-cli/dist/index.js ] || { echo "ERROR: maestro-cli/dist/index.js missing"; exit 1; }
echo "  global CLI install..."; sudo npm install -g ./maestro-cli || echo "  WARN: global CLI install failed"
echo "  Build complete."
BUILDIT

# --------------------------------------------------------------------------
echo ""; echo "==> [4/5] Writing env file (sudo)..."
ssh_run bash -s -- "$ENV_FILE" "$APP_PORT" "$DATA_DIR" "$SESSION_DIR" "$APP_PASSWORD" "$ALLOWED_ORIGINS" <<'ENVFILE'
set -euo pipefail
ENV_FILE="$1"; APP_PORT="$2"; DATA_DIR="$3"; SESSION_DIR="$4"; APP_PASSWORD="$5"; ALLOWED_ORIGINS="$6"
sudo mkdir -p /etc/maestro && sudo chmod 755 /etc/maestro

if [ -f "$ENV_FILE" ] && sudo grep -q "MAESTRO_AUTH_SECRET=" "$ENV_FILE"; then
  AUTH_SECRET=$(sudo grep "MAESTRO_AUTH_SECRET=" "$ENV_FILE" | cut -d= -f2)
else
  AUTH_SECRET=$(openssl rand -hex 32)
fi

sudo tee "$ENV_FILE" >/dev/null <<EOF
NODE_ENV=production
PORT=${APP_PORT}
HOST=127.0.0.1

DATA_DIR=${DATA_DIR}
SESSION_DIR=${SESSION_DIR}

MAESTRO_PTY_HOST=server

MAESTRO_AUTH_ENABLED=true
MAESTRO_AUTH_PASSWORD=${APP_PASSWORD}
MAESTRO_AUTH_SECRET=${AUTH_SECRET}

MAESTRO_ALLOWED_ORIGINS=${ALLOWED_ORIGINS}

MANIFEST_GENERATOR=server
LOG_LEVEL=info
LOG_FORMAT=json
EOF
sudo chmod 600 "$ENV_FILE"
echo "  Env written to $ENV_FILE (chmod 600)"
ENVFILE

# --------------------------------------------------------------------------
echo ""; echo "==> [5/5] Installing systemd service (sudo)..."
NODE_BIN=$(ssh_run "command -v node")
ssh_run bash -s -- "$REMOTE_USER" "$DATA_DIR" "$SESSION_DIR" "$REPO_DIR" "$ENV_FILE" "$SERVICE_NAME" "$NODE_BIN" <<'SERVICE'
set -euo pipefail
REMOTE_USER="$1"; DATA_DIR="$2"; SESSION_DIR="$3"; REPO_DIR="$4"; ENV_FILE="$5"; SERVICE_NAME="$6"; NODE_BIN="$7"
mkdir -p "$DATA_DIR" "$SESSION_DIR"
sudo tee /etc/systemd/system/${SERVICE_NAME}.service >/dev/null <<EOF
[Unit]
Description=Maestro Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${REMOTE_USER}
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${REPO_DIR}/maestro-server/dist/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl reset-failed ${SERVICE_NAME} || true
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}
sleep 2
if sudo systemctl is-active --quiet ${SERVICE_NAME}; then
  echo "  Service running OK"
else
  echo "ERROR: service failed to start"; sudo journalctl -u ${SERVICE_NAME} -n 40 --no-pager; exit 1
fi
SERVICE

echo ""
echo "============================================================"
echo "  Server deployed and running on 127.0.0.1:${APP_PORT}"
echo "============================================================"
echo "  Next (Tailscale): install tailscale, 'sudo tailscale up',"
echo "  then 'sudo tailscale serve --bg ${APP_PORT}'."
echo "  Then on the box: 'claude login'."
