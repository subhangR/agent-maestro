#!/usr/bin/env bash
# scripts/deploy-local.sh — Idempotent on-box deploy for the EC2/Tailscale hub.
#
# Run ON the EC2 host to pull the latest code from GitHub, rebuild all packages,
# restart both systemd services, and verify the new revision is actually being
# served.  Exits non-zero and prints a clear error if any step fails or the
# post-deploy health check returns the wrong commit.
#
# Usage:
#   cd /home/ubuntu/agent-maestro
#   ./scripts/deploy-local.sh [--skip-pull] [--skip-ui]
#
#   --skip-pull   Use the current working tree instead of pulling from GitHub.
#   --skip-ui     Skip the heavy maestro-ui gateway build (~90s, needs swap).
#                 Use this if only the server/CLI/gateway code changed.
#
# Prerequisites (already true on this host):
#   - git, bun, node available in PATH
#   - Both maestro-server.service and maestro-gateway.service installed
#   - /etc/maestro/gateway.env present with MAESTRO_GATEWAY_PORT set
#   - The user has passwordless sudo for systemctl (or run with sudo)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

SKIP_PULL=0
SKIP_UI=0

for arg in "$@"; do
  case "$arg" in
    --skip-pull) SKIP_PULL=1 ;;
    --skip-ui)   SKIP_UI=1 ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

export PATH="$HOME/.bun/bin:$PATH"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
die()   { echo -e "${RED}[deploy] ERROR:${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
info "=== Maestro Hub On-Box Deploy ==="
info "Repo : $REPO_ROOT"
info "Time : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# ---------------------------------------------------------------------------
info "[1/6] Git"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Branch: $BRANCH"

if [[ $SKIP_PULL -eq 0 ]]; then
  if ! git diff --quiet HEAD; then
    die "Uncommitted changes to tracked files. Stash or commit them first."
  fi
  if git status --short | grep -q '^??'; then
    warn "Untracked files present (leaving them alone):"
    git status --short | grep '^??' | sed 's/^/  /'
  fi
  info "Fetching origin/$BRANCH ..."
  git fetch origin
  BEHIND=$(git rev-list HEAD..origin/"$BRANCH" --count 2>/dev/null || echo 0)
  if [[ "$BEHIND" -gt 0 ]]; then
    git merge --ff-only "origin/$BRANCH" \
      || die "Fast-forward pull failed — local branch has diverged from origin."
    info "Advanced $BEHIND commit(s)."
  else
    info "Already up to date."
  fi
fi

TARGET_SHA=$(git rev-parse HEAD)
info "Building commit: $TARGET_SHA"

# ---------------------------------------------------------------------------
info "[2/6] Install dependencies"
bun install --frozen-lockfile 2>/dev/null || bun install

# ---------------------------------------------------------------------------
info "[3/6] Build packages"

if [[ $SKIP_UI -eq 0 ]]; then
  info "  Building UI gateway bundle (this takes ~90s on a 2-vCPU box)..."
  NODE_OPTIONS=--max-old-space-size=6144 bun run build:web:gateway \
    || die "maestro-ui build:web:gateway failed"
  [[ -f maestro-ui/dist-gateway/index.html ]] \
    || die "maestro-ui/dist-gateway/index.html missing after build"
  info "  UI bundle OK ($(ls maestro-ui/dist-gateway/assets/*.js 2>/dev/null | wc -l) JS assets)"
else
  warn "  Skipping UI build (--skip-ui passed)"
fi

info "  Building maestro-server..."
bun run build:server || die "maestro-server build failed"

info "  Building maestro-cli..."
bun run build:cli || die "maestro-cli build failed"

info "  Building maestro-gateway..."
bun run build:gateway || die "maestro-gateway build failed"

STAMP=$(cat maestro-gateway/dist/.git-sha 2>/dev/null || echo 'unknown')
if [[ "$STAMP" != "$TARGET_SHA" ]]; then
  warn "SHA stamp ($STAMP) doesn't match expected ($TARGET_SHA)"
fi
info "  Build complete. Stamp: $STAMP"

# ---------------------------------------------------------------------------
info "[4/6] Update global CLI"
npm install -g ./maestro-cli 2>/dev/null \
  && info "  Global maestro CLI updated" \
  || warn "  Global CLI install failed (agents may use the old version)"

# ---------------------------------------------------------------------------
info "[5/6] Restart services"
# NOTE: Restarting will briefly drop in-flight sessions.
# Confirm with the coordinator that no critical work is running first.

sudo systemctl restart maestro-server
sleep 2
sudo systemctl is-active --quiet maestro-server \
  || { sudo journalctl -u maestro-server -n 30 --no-pager; die "maestro-server failed to restart"; }
info "  maestro-server active"

sudo systemctl restart maestro-gateway
sleep 3
sudo systemctl is-active --quiet maestro-gateway \
  || { sudo journalctl -u maestro-gateway -n 30 --no-pager; die "maestro-gateway failed to restart"; }
info "  maestro-gateway active"

# ---------------------------------------------------------------------------
info "[6/6] Health check"
GW_PORT=$(grep -E '^MAESTRO_GATEWAY_PORT=' /etc/maestro/gateway.env 2>/dev/null \
  | cut -d= -f2 || echo 4580)
HEALTH_URL="http://127.0.0.1:${GW_PORT}/gateway/health"

HEALTH_RESPONSE=""
for i in $(seq 1 15); do
  HEALTH_RESPONSE=$(curl -sf "$HEALTH_URL" 2>/dev/null) && break
  sleep 1
done

[[ -n "${HEALTH_RESPONSE:-}" ]] \
  || die "Gateway health endpoint $HEALTH_URL did not respond after 15s"

LIVE_COMMIT=$(echo "$HEALTH_RESPONSE" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('commit','unknown'))" 2>/dev/null \
  || echo 'parse_error')

echo ""
echo "==========================================="
info "Deploy complete."
echo "  Target commit : $TARGET_SHA"
echo "  Live commit   : $LIVE_COMMIT"
if [[ "$LIVE_COMMIT" == "$TARGET_SHA" ]]; then
  echo -e "  Match         : ${GREEN}YES ✓${NC}"
else
  echo -e "  Match         : ${RED}NO ✗${NC}"
  die "Live commit ($LIVE_COMMIT) does not match target ($TARGET_SHA). Check build and restart."
fi
echo "==========================================="
echo ""
info "Useful commands:"
echo "  journalctl -u maestro-gateway -f"
echo "  journalctl -u maestro-server -f"
echo "  curl -s http://127.0.0.1:${GW_PORT}/gateway/health | python3 -m json.tool"
