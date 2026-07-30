#!/usr/bin/env bash
# scripts/deploy-local.sh — Idempotent on-box deploy for the EC2/Tailscale hub.
#
# Run ON the EC2 host to pull the latest code from GitHub, rebuild all packages,
# and (optionally) restart both systemd services.
#
# SAFETY: By default this script ONLY builds — it does NOT restart services.
# Restarting maestro-server kills every in-flight agent session on this host,
# including the agent that runs this script. The restart step is opt-in.
#
# Usage:
#   cd /home/ubuntu/agent-maestro
#   ./scripts/deploy-local.sh [options]
#
#   --skip-pull   Use the current working tree instead of pulling from GitHub.
#   --skip-ui     Skip the heavy maestro-ui gateway build (~90s, needs swap).
#                 Use this if only the server/CLI/gateway code changed.
#   --restart     ALSO restart both systemd services after building.
#                 Aborts if active agent sessions are detected (see --force).
#   --force       With --restart: override the active-session guard and restart
#                 even if sessions are running (they will lose their work).
#
# Typical safe agent workflow:
#   Step 1 (agent runs): ./scripts/deploy-local.sh [--skip-ui]
#   Step 2 (human runs): ./scripts/deploy-local.sh --skip-pull --skip-ui --restart
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
RESTART=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --skip-pull) SKIP_PULL=1 ;;
    --skip-ui)   SKIP_UI=1 ;;
    --restart)   RESTART=1 ;;
    --force)     FORCE=1 ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

if [[ $FORCE -eq 1 && $RESTART -eq 0 ]]; then
  echo "--force has no effect without --restart"; exit 1
fi

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
if [[ $RESTART -eq 0 ]]; then
  warn "  Skipping service restart (--restart not passed — this is intentional)."
  warn "  Build is complete. When no agent sessions are running, a human should run:"
  warn "    $0 --skip-pull --skip-ui --restart"
  warn "  To override the active-session guard (DESTRUCTIVE — kills running sessions):"
  warn "    $0 --skip-pull --skip-ui --restart --force"
else
  # Guard: enumerate ALL per-user maestro-server instances via the gateway process tree.
  # Agent sessions live in gateway child processes (ports 4600-4699), NOT in the standalone
  # maestro-server.service on 4570. Probing 4570 would always report 0 and give false safety.
  # This guard is FAIL-CLOSED: any instance that cannot be reached or parsed is treated as UNSAFE.
  info "  Checking for active agent sessions across all gateway instances..."

  _gw_status=$(systemctl is-active maestro-gateway 2>/dev/null || echo "unknown")
  _gw_pid=$(systemctl show maestro-gateway --property=MainPID --value 2>/dev/null | tr -d '[:space:]')
  _total_sessions=0
  _guard_errors=0
  _session_lines=""

  if [[ "$_gw_status" != "active" ]]; then
    warn "  Gateway is $_gw_status — no per-user instances running, safe to restart"
  elif [[ -z "$_gw_pid" || "$_gw_pid" == "0" ]]; then
    # Gateway is active but we can't get its PID — refuse unless --force
    if [[ $FORCE -eq 0 ]]; then
      die "ABORT: maestro-gateway is active but MainPID could not be determined.
Cannot safely check for sessions. Use --force to bypass (DESTRUCTIVE)."
    fi
    warn "  --force: cannot determine gateway PID, proceeding anyway"
  else
    _child_pids=$(pgrep -P "$_gw_pid" 2>/dev/null || true)
    if [[ -z "$_child_pids" ]]; then
      warn "  Gateway (PID $_gw_pid) has no child instances — no active sessions"
    else
      for _pid in $_child_pids; do
        _port=$(ss -lntp 2>/dev/null \
          | awk -v p="$_pid" '$0 ~ "pid="p"," {n=split($4,a,":"); v=a[n]+0; if(v>0) print v; exit}')
        if [[ -z "$_port" ]]; then
          warn "  PID $_pid: cannot determine listening port → treating as UNSAFE"
          _guard_errors=$((_guard_errors + 1))
          continue
        fi

        _tmpf=$(mktemp)
        _hc=$(curl --max-time 5 -s -o "$_tmpf" -w "%{http_code}" \
          "http://127.0.0.1:${_port}/api/sessions?active=true" 2>/dev/null || echo "000")
        if [[ "$_hc" != "200" ]]; then
          warn "  Port $_port (PID $_pid): HTTP $_hc → treating as UNSAFE"
          rm -f "$_tmpf"
          _guard_errors=$((_guard_errors + 1))
          continue
        fi

        _cnt=$(python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    ss=d if isinstance(d,list) else d.get('items',d.get('sessions'))
    if ss is None: sys.exit(1)
    print(len(ss))
except Exception as e:
    sys.stderr.write(str(e)+'\n'); sys.exit(1)
" "$_tmpf" 2>/tmp/maestro-guard-parse-err)
        _ec=$?
        if [[ $_ec -ne 0 || -z "$_cnt" || ! "$_cnt" =~ ^[0-9]+$ ]]; then
          warn "  Port $_port (PID $_pid): JSON parse failed ($(cat /tmp/maestro-guard-parse-err 2>/dev/null)) → UNSAFE"
          rm -f "$_tmpf"
          _guard_errors=$((_guard_errors + 1))
          continue
        fi

        if [[ "$_cnt" -gt 0 ]]; then
          _lines=$(python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
ss=d if isinstance(d,list) else d.get('items',d.get('sessions',[]))
for s in ss:
    name=s.get('name') or (s.get('teamMemberSnapshot') or {}).get('name') or 'unnamed'
    print(f'  [{s.get(\"status\",\"?\"):<8}] port=${_port}  {s.get(\"id\",\"?\")[:16]}  {name}')
" "$_tmpf" 2>/dev/null || true)
          _session_lines="${_session_lines}${_lines}"$'\n'
        fi
        _total_sessions=$((_total_sessions + _cnt))
        rm -f "$_tmpf"
      done
    fi
  fi

  if [[ $_guard_errors -gt 0 && $FORCE -eq 0 ]]; then
    die "ABORT: $_guard_errors gateway instance(s) could not be verified (fail-closed).
Cannot confirm it is safe to restart. Use --force to bypass (DESTRUCTIVE)."
  fi

  if [[ $_total_sessions -gt 0 && $FORCE -eq 0 ]]; then
    echo ""
    echo "${_session_lines}"
    die "ABORT: $_total_sessions active session(s) detected across gateway instances (listed above).
Restarting will kill them and discard in-progress work.

Options:
  • Wait for sessions to finish, then re-run:
      $0 --skip-pull --skip-ui --restart
  • Force restart (DESTRUCTIVE — kills all listed sessions):
      $0 --skip-pull --skip-ui --restart --force"
  fi

  if [[ $_total_sessions -gt 0 && $FORCE -eq 1 ]]; then
    warn "  --force: $_total_sessions active session(s) will be killed:"
    echo "${_session_lines}"
    warn "  Proceeding in 5 seconds — Ctrl-C to abort..."
    sleep 5
  fi

  if [[ $_guard_errors -gt 0 && $FORCE -eq 1 ]]; then
    warn "  --force: $_guard_errors instance(s) could not be verified (assumed safe by --force)"
  fi

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
fi

# ---------------------------------------------------------------------------
info "[6/6] Health check"
if [[ $RESTART -eq 0 ]]; then
  GW_PORT=$(grep -E '^MAESTRO_GATEWAY_PORT=' /etc/maestro/gateway.env 2>/dev/null \
    | cut -d= -f2 || echo 4580)
  echo ""
  echo "==========================================="
  info "Build-only deploy complete."
  echo "  Built commit : $TARGET_SHA"
  echo "  Stamp        : $STAMP"
  echo ""
  warn "  Services are still serving the PREVIOUS build."
  warn "  Restart is required to go live. Run when sessions are clear:"
  warn "    $0 --skip-pull --skip-ui --restart"
  echo "==========================================="
  echo ""
  info "Useful commands:"
  echo "  maestro master sessions --active     # check for running sessions"
  echo "  journalctl -u maestro-gateway -f"
  echo "  journalctl -u maestro-server -f"
  echo "  curl -s http://127.0.0.1:${GW_PORT}/gateway/health | python3 -m json.tool"
else
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
fi
