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
  # Guard: enumerate ALL per-user maestro-server instances via the gateway process tree.
  # Sessions live in gateway child processes (ports 4600-4699), not in maestro-server.service.
  # FAIL-CLOSED: any unverifiable instance is treated as UNSAFE.
  echo "  Checking for active agent sessions across all gateway instances..."
  _gw_status=$(systemctl is-active maestro-gateway 2>/dev/null || echo "unknown")
  _gw_pid=$(systemctl show maestro-gateway --property=MainPID --value 2>/dev/null | tr -d '[:space:]')
  _total_sessions=0
  _guard_errors=0
  _session_lines=""

  if [[ "$_gw_status" != "active" ]]; then
    echo "  Gateway is $_gw_status — no per-user instances, safe to restart"
  elif [[ -z "$_gw_pid" || "$_gw_pid" == "0" ]]; then
    if [[ "$DO_FORCE" == "0" ]]; then
      echo "ERROR: ABORT: maestro-gateway active but MainPID unknown. Use --force to bypass."
      exit 1
    fi
    echo "  WARNING: --force: cannot determine gateway PID, proceeding anyway"
  else
    _child_pids=$(pgrep -P "$_gw_pid" 2>/dev/null || true)
    if [[ -z "$_child_pids" ]]; then
      echo "  Gateway (PID $_gw_pid) has no child instances — no sessions"
    else
      for _pid in $_child_pids; do
        _port=$(ss -lntp 2>/dev/null \
          | awk -v p="$_pid" '$0 ~ "pid="p"," {n=split($4,a,":"); v=a[n]+0; if(v>0) print v; exit}')
        if [[ -z "$_port" ]]; then
          echo "  WARNING: PID $_pid: cannot determine listening port → UNSAFE"
          _guard_errors=$((_guard_errors+1)); continue
        fi
        _tmpf=$(mktemp)
        _hc=$(curl --max-time 5 -s -o "$_tmpf" -w "%{http_code}" \
          "http://127.0.0.1:${_port}/api/sessions?active=true" 2>/dev/null || echo "000")
        if [[ "$_hc" != "200" ]]; then
          echo "  WARNING: port $_port (PID $_pid): HTTP $_hc → UNSAFE"
          rm -f "$_tmpf"; _guard_errors=$((_guard_errors+1)); continue
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
          echo "  WARNING: port $_port (PID $_pid): parse failed ($(cat /tmp/maestro-guard-parse-err 2>/dev/null)) → UNSAFE"
          rm -f "$_tmpf"; _guard_errors=$((_guard_errors+1)); continue
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
        _total_sessions=$((_total_sessions+_cnt))
        rm -f "$_tmpf"
      done
    fi
  fi

  if [[ $_guard_errors -gt 0 && "$DO_FORCE" == "0" ]]; then
    echo "ERROR: ABORT: $_guard_errors gateway instance(s) could not be verified (fail-closed)."
    echo "  Use --force to bypass (DESTRUCTIVE)."
    exit 1
  fi

  if [[ $_total_sessions -gt 0 && "$DO_FORCE" == "0" ]]; then
    echo ""
    echo "${_session_lines}"
    echo "ERROR: ABORT: $_total_sessions active session(s) across gateway instances (listed above)."
    echo "  Restarting will kill them. Options:"
    echo "  • Wait for sessions to finish, then: ./scripts/deploy-hub.sh --skip-ui --restart"
    echo "  • Force (DESTRUCTIVE): ./scripts/deploy-hub.sh --skip-ui --restart --force"
    exit 1
  fi

  if [[ $_total_sessions -gt 0 && "$DO_FORCE" == "1" ]]; then
    echo "  WARNING: --force: $_total_sessions session(s) will be killed:"
    echo "${_session_lines}"
    echo "  Proceeding in 5 seconds — Ctrl-C to abort..."
    sleep 5
  fi

  if [[ $_guard_errors -gt 0 && "$DO_FORCE" == "1" ]]; then
    echo "  WARNING: --force: $_guard_errors instance(s) unverifiable (assumed safe)"
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
