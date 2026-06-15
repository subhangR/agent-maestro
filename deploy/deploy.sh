#!/usr/bin/env bash
# deploy/deploy.sh — One-command VPS deployment for Agent Maestro
# Usage: ./deploy.sh <user@host> [-i <ssh_key>] [--password <app_password>] [--domain <fqdn>] [--port <n>]
#
# What this does (all steps are idempotent):
#   1. Provisions the VM: Node LTS, git, build toolchain, rsync, nginx, claude CLI
#   2. Syncs the repo (rsync or git clone of feat/web-ui-deploy)
#   3. Builds: maestro-server (tsc), maestro-ui (build:web), maestro-cli (tsc)
#   4. Writes /etc/maestro/maestro.env with runtime + auth env vars
#   5. Installs and starts a systemd service running under node (NOT bun)
#   6. Configures nginx reverse proxy with WS upgrade for /ws and /pty
#
# NOTE: Does NOT run 'claude login' — the user must do that manually on the VM.
# NOTE: End-to-end live-VM testing requires an actual SSH target + key.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
SSH_TARGET=""
SSH_KEY_OPT=""
APP_PASSWORD=""
DOMAIN=""
APP_PORT="4570"
REPO_URL=""           # optional: git remote to clone from

usage() {
  cat <<EOF
Usage: $0 <user@host> [OPTIONS]

Options:
  -i <ssh_key>          Path to SSH private key
  --password <pass>     App password for MAESTRO_AUTH_PASSWORD (prompted if omitted)
  --domain <fqdn>       FQDN for nginx server_name (defaults to server IP)
  --port <n>            Port for maestro-server to listen on (default: 4570)
  --repo-url <url>      Git remote URL to clone from (default: rsync local tree)
  -h, --help            Show this help
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i)           SSH_KEY_OPT="-i $2"; shift 2 ;;
    --password)   APP_PASSWORD="$2"; shift 2 ;;
    --domain)     DOMAIN="$2"; shift 2 ;;
    --port)       APP_PORT="$2"; shift 2 ;;
    --repo-url)   REPO_URL="$2"; shift 2 ;;
    -h|--help)    usage ;;
    -*)           echo "Unknown option: $1"; usage ;;
    *)
      if [[ -z "$SSH_TARGET" ]]; then SSH_TARGET="$1"
      else echo "Unexpected argument: $1"; usage; fi
      shift ;;
  esac
done

if [[ -z "$SSH_TARGET" ]]; then
  echo "ERROR: <user@host> is required"
  usage
fi

# Prompt for password if not provided
if [[ -z "$APP_PASSWORD" ]]; then
  echo -n "Enter Maestro app password (MAESTRO_AUTH_PASSWORD): "
  read -rs APP_PASSWORD
  echo
  if [[ -z "$APP_PASSWORD" ]]; then
    echo "ERROR: App password cannot be empty"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Helper: run a command over SSH
# ---------------------------------------------------------------------------
ssh_run() {
  # shellcheck disable=SC2086
  ssh $SSH_KEY_OPT -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "$@"
}

# Helper: run a here-doc script on the remote
ssh_script() {
  # shellcheck disable=SC2086
  ssh $SSH_KEY_OPT -o StrictHostKeyChecking=accept-new "$SSH_TARGET" bash -s
}

REMOTE_USER="${SSH_TARGET%%@*}"
REMOTE_HOST="${SSH_TARGET##*@}"
REPO_DIR="/home/${REMOTE_USER}/maestro"
ENV_FILE="/etc/maestro/maestro.env"
SERVICE_NAME="maestro-server"

echo "==> Deploying Agent Maestro to ${SSH_TARGET}"
echo "    Repo dir  : ${REPO_DIR}"
echo "    App port  : ${APP_PORT}"
echo "    Domain    : ${DOMAIN:-<server IP>}"

# ---------------------------------------------------------------------------
# STEP 1: Provision prerequisites (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "==> [1/6] Provisioning prerequisites..."

ssh_script <<'PROVISION'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ---- Node LTS via NodeSource ----
if ! command -v node &>/dev/null; then
  echo "  Installing Node LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
else
  echo "  Node already installed: $(node --version)"
fi

# ---- npm corepack / bun for build steps ----
if ! command -v bun &>/dev/null; then
  echo "  Installing bun (build-time only)..."
  curl -fsSL https://bun.sh/install | bash
  # Make bun available in PATH for subsequent commands in this session
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
else
  echo "  bun already installed: $(bun --version)"
fi

# ---- System packages ----
echo "  Installing system packages..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  git \
  build-essential \
  python3 \
  python3-dev \
  rsync \
  nginx \
  curl \
  ca-certificates

# ---- Claude CLI (best-effort) ----
if ! command -v claude &>/dev/null; then
  echo "  Installing Claude CLI..."
  npm install -g @anthropic-ai/claude-code || echo "  WARNING: Claude CLI install failed — install manually and run 'claude login'"
else
  echo "  Claude CLI already installed: $(claude --version 2>/dev/null || echo 'unknown')"
fi

echo "  Prerequisites OK"
PROVISION

# ---------------------------------------------------------------------------
# STEP 2: Sync the repo
# ---------------------------------------------------------------------------
echo ""
echo "==> [2/6] Syncing repository..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -n "$REPO_URL" ]]; then
  # Clone/update from git remote
  ssh_run bash -s <<SYNCGIT
set -euo pipefail
if [ -d "${REPO_DIR}/.git" ]; then
  echo "  Updating existing clone..."
  git -C "${REPO_DIR}" fetch origin
  git -C "${REPO_DIR}" checkout feat/web-ui-deploy 2>/dev/null || git -C "${REPO_DIR}" checkout -b feat/web-ui-deploy origin/feat/web-ui-deploy
  git -C "${REPO_DIR}" reset --hard origin/feat/web-ui-deploy
else
  echo "  Cloning repository..."
  git clone --branch feat/web-ui-deploy --single-branch "${REPO_URL}" "${REPO_DIR}"
fi
SYNCGIT
else
  # Rsync local working tree
  echo "  Rsyncing local tree to ${SSH_TARGET}:${REPO_DIR} ..."
  # shellcheck disable=SC2086
  ssh $SSH_KEY_OPT -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "mkdir -p ${REPO_DIR}"
  rsync -az --delete \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.git' \
    --exclude='maestro-ui/src-tauri/target' \
    --exclude='*.log' \
    ${SSH_KEY_OPT} \
    "${REPO_ROOT}/" \
    "${SSH_TARGET}:${REPO_DIR}/"
fi

# ---------------------------------------------------------------------------
# STEP 3: Install deps and build
# ---------------------------------------------------------------------------
echo ""
echo "==> [3/6] Installing dependencies and building..."

ssh_run bash -s <<BUILDIT
set -euo pipefail
export BUN_INSTALL="\$HOME/.bun"
export PATH="\$BUN_INSTALL/bin:\$PATH"
cd "${REPO_DIR}"

echo "  Running bun install..."
bun install --frozen-lockfile 2>/dev/null || bun install

echo "  Building maestro-server (tsc)..."
cd maestro-server
bun run build
cd ..

echo "  Building maestro-ui (build:web)..."
cd maestro-ui
bun run build:web
if [ ! -f dist/index.html ]; then
  echo "ERROR: maestro-ui/dist/index.html not found after build:web!"
  exit 1
fi
cd ..

echo "  Building maestro-cli (tsc)..."
cd maestro-cli
bun run build
if [ ! -f dist/index.js ]; then
  echo "ERROR: maestro-cli/dist/index.js not found after build!"
  exit 1
fi
cd ..

echo "  Installing maestro CLI globally..."
npm install -g ./maestro-cli || echo "  WARNING: global CLI install failed; sessions may not work without it"

echo "  Build complete."
BUILDIT

# ---------------------------------------------------------------------------
# STEP 4: Write env file
# ---------------------------------------------------------------------------
echo ""
echo "==> [4/6] Writing environment file..."

# Generate a 32-byte hex secret, or reuse if env file already exists
AUTH_SECRET_CMD='
if grep -q "MAESTRO_AUTH_SECRET=" '"${ENV_FILE}"' 2>/dev/null; then
  grep "MAESTRO_AUTH_SECRET=" '"${ENV_FILE}"' | cut -d= -f2
else
  openssl rand -hex 32
fi'

AUTH_SECRET=$(ssh_run "bash -c '${AUTH_SECRET_CMD}'" 2>/dev/null || openssl rand -hex 32)

DATA_DIR="/home/${REMOTE_USER}/.maestro/data"
SESSION_DIR="/home/${REMOTE_USER}/.maestro/sessions"

ssh_run bash -s <<ENVFILE
set -euo pipefail
mkdir -p /etc/maestro
chmod 755 /etc/maestro

# Preserve existing MAESTRO_AUTH_SECRET if present
if [ -f "${ENV_FILE}" ] && grep -q "MAESTRO_AUTH_SECRET=" "${ENV_FILE}"; then
  AUTH_SECRET=\$(grep "MAESTRO_AUTH_SECRET=" "${ENV_FILE}" | cut -d= -f2)
else
  AUTH_SECRET=\$(openssl rand -hex 32)
fi

cat > "${ENV_FILE}" <<EOF
# Maestro Server — Runtime environment
# Written by deploy.sh — edit carefully

NODE_ENV=production
PORT=${APP_PORT}
HOST=0.0.0.0

# Storage
DATA_DIR=${DATA_DIR}
SESSION_DIR=${SESSION_DIR}

# PTY host: server means maestro-server spawns PTYs directly (required for VPS)
MAESTRO_PTY_HOST=server

# Auth (set by deploy.sh)
MAESTRO_AUTH_ENABLED=true
MAESTRO_AUTH_PASSWORD=${APP_PASSWORD}
MAESTRO_AUTH_SECRET=\${AUTH_SECRET}

# Manifest generator
MANIFEST_GENERATOR=server

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
EOF

chmod 600 "${ENV_FILE}"
echo "  Env file written to ${ENV_FILE}"
ENVFILE

# ---------------------------------------------------------------------------
# STEP 5: Install systemd service
# ---------------------------------------------------------------------------
echo ""
echo "==> [5/6] Installing systemd service..."

NODE_BIN=$(ssh_run "which node")
DEPLOY_DIR="${REPO_DIR}"

ssh_run bash -s <<SERVICE
set -euo pipefail
mkdir -p "${DATA_DIR}"
mkdir -p "${SESSION_DIR}"
chown -R "${REMOTE_USER}:${REMOTE_USER}" "/home/${REMOTE_USER}/.maestro" || true

# Write the service unit (from template, with resolved paths)
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Maestro Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${REMOTE_USER}
WorkingDirectory=${DEPLOY_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${DEPLOY_DIR}/maestro-server/dist/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

sleep 2
systemctl is-active --quiet ${SERVICE_NAME} && echo "  Service running OK" || (echo "ERROR: service failed to start"; journalctl -u ${SERVICE_NAME} -n 30 --no-pager; exit 1)
SERVICE

# ---------------------------------------------------------------------------
# STEP 6: Configure nginx
# ---------------------------------------------------------------------------
echo ""
echo "==> [6/6] Configuring nginx..."

SERVER_NAME="${DOMAIN:-_}"

ssh_run bash -s <<NGINX
set -euo pipefail

cat > /etc/nginx/sites-available/${SERVICE_NAME} <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    # Increase timeouts for long-lived terminal WebSocket connections
    proxy_read_timeout     3600s;
    proxy_send_timeout     3600s;
    proxy_connect_timeout  60s;

    # WebSocket upgrade headers (applied globally — covers /ws and /pty)
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\\$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \\\$host;
    proxy_set_header X-Real-IP \\\$remote_addr;
    proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\\$scheme;
    proxy_cache_bypass \\\$http_upgrade;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
    }

    # --- TLS (certbot) ---
    # To enable HTTPS, run:
    #   certbot --nginx -d ${SERVER_NAME}
    # Then reload nginx. Auth over plain HTTP is insecure — enable TLS in production.
}
EOF

ln -sf /etc/nginx/sites-available/${SERVICE_NAME} /etc/nginx/sites-enabled/${SERVICE_NAME}
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
echo "  nginx configured and reloaded"
NGINX

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Agent Maestro deployed successfully!"
echo "============================================================"
echo ""
echo "  URL      : http://${REMOTE_HOST}${DOMAIN:+  (also: http://${DOMAIN})}"
echo "  Service  : systemctl status ${SERVICE_NAME}"
echo "  Logs     : journalctl -u ${SERVICE_NAME} -f"
echo "  Env file : ${ENV_FILE}  (chmod 600)"
echo ""
echo "  NEXT STEPS:"
echo "  1. SSH into the VM and run: claude login"
echo "     (The CLI is installed but auth must be done manually)"
echo "  2. Migrate your local data:  ./migrate-data.sh ${SSH_TARGET}${SSH_KEY_OPT:+ ${SSH_KEY_OPT}}"
echo "  3. Enable TLS:  certbot --nginx -d <your-domain>"
echo "     Auth over plain HTTP is insecure — enable HTTPS in production."
echo ""
echo "  NOTE: End-to-end live-VM testing requires your SSH key and target."
echo "        This script was validated with 'bash -n' but not run against a live VM."
echo ""
