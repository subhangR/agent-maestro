#!/usr/bin/env bash
# deploy/migrate-data.sh — Rsync ALL maestro data to a VPS
# Usage: ./migrate-data.sh <user@host> [-i <ssh_key>] [--from <local_maestro_dir>] [--to <remote_maestro_dir>] [--mirror]
#
# Syncs the entire ~/.maestro/data and ~/.maestro/sessions trees:
#   projects, tasks, sessions, team-members, teams, spells, task-lists,
#   orderings, indexes — everything under the data and sessions roots.
#
# Behavior:
#   - Stops the remote maestro-server service before sync, restarts after
#   - Idempotent: safe to re-run; uses rsync checksums not just timestamps
#   - Additive by default (no --delete); pass --mirror to also delete remote extras
#   - Prints byte counts and file counts transferred

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
SSH_TARGET=""
SSH_KEY_OPT=""
LOCAL_MAESTRO="${HOME}/.maestro"
REMOTE_MAESTRO=""      # derived from SSH_TARGET user if not set
MIRROR=false

usage() {
  cat <<EOF
Usage: $0 <user@host> [OPTIONS]

Options:
  -i <ssh_key>            Path to SSH private key
  --from <dir>            Local maestro dir (default: ~/.maestro)
  --to   <dir>            Remote maestro dir (default: /home/<user>/.maestro)
  --mirror                Also DELETE remote files not in source (use with care)
  -h, --help              Show this help

Data transferred:
  <from>/data/            → <to>/data/
  <from>/sessions/        → <to>/sessions/

EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i)         SSH_KEY_OPT="-i $2"; shift 2 ;;
    --from)     LOCAL_MAESTRO="$2"; shift 2 ;;
    --to)       REMOTE_MAESTRO="$2"; shift 2 ;;
    --mirror)   MIRROR=true; shift ;;
    -h|--help)  usage ;;
    -*)         echo "Unknown option: $1"; usage ;;
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

REMOTE_USER="${SSH_TARGET%%@*}"
if [[ -z "$REMOTE_MAESTRO" ]]; then
  REMOTE_MAESTRO="/home/${REMOTE_USER}/.maestro"
fi

SERVICE_NAME="maestro-server"

# ---------------------------------------------------------------------------
# Validate local source
# ---------------------------------------------------------------------------
LOCAL_DATA="${LOCAL_MAESTRO}/data"
LOCAL_SESSIONS="${LOCAL_MAESTRO}/sessions"

if [[ ! -d "$LOCAL_DATA" ]] && [[ ! -d "$LOCAL_SESSIONS" ]]; then
  echo "ERROR: Neither ${LOCAL_DATA} nor ${LOCAL_SESSIONS} exists."
  echo "       Check --from path or that maestro has been used locally."
  exit 1
fi

echo "==> Maestro Data Migration"
echo "    Source : ${LOCAL_MAESTRO}"
echo "    Target : ${SSH_TARGET}:${REMOTE_MAESTRO}"
echo "    Mirror : ${MIRROR}"
echo ""

# ---------------------------------------------------------------------------
# Helper: run over SSH
# ---------------------------------------------------------------------------
ssh_run() {
  # shellcheck disable=SC2086
  ssh $SSH_KEY_OPT -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "$@"
}

# ---------------------------------------------------------------------------
# Stop remote service
# ---------------------------------------------------------------------------
echo "==> Stopping remote ${SERVICE_NAME} service..."
if ssh_run "systemctl is-active --quiet ${SERVICE_NAME} 2>/dev/null"; then
  ssh_run "systemctl stop ${SERVICE_NAME}"
  echo "    Service stopped."
else
  echo "    Service not running (or not installed) — continuing."
fi

# ---------------------------------------------------------------------------
# Ensure remote dirs exist
# ---------------------------------------------------------------------------
ssh_run "mkdir -p '${REMOTE_MAESTRO}/data' '${REMOTE_MAESTRO}/sessions'"

# ---------------------------------------------------------------------------
# Build rsync options
# ---------------------------------------------------------------------------
RSYNC_OPTS=("-avz" "--checksum" "--stats")
if [[ "$MIRROR" == "true" ]]; then
  echo "    WARNING: --mirror flag is set — remote files not in source will be DELETED"
  RSYNC_OPTS+=("--delete")
fi

RSYNC_SSH="ssh${SSH_KEY_OPT:+ ${SSH_KEY_OPT}} -o StrictHostKeyChecking=accept-new"

# ---------------------------------------------------------------------------
# Sync data/
# ---------------------------------------------------------------------------
if [[ -d "$LOCAL_DATA" ]]; then
  echo ""
  echo "==> Syncing data/ tree..."
  rsync "${RSYNC_OPTS[@]}" \
    -e "${RSYNC_SSH}" \
    "${LOCAL_DATA}/" \
    "${SSH_TARGET}:${REMOTE_MAESTRO}/data/"
else
  echo "==> Skipping data/ (not found locally)"
fi

# ---------------------------------------------------------------------------
# Sync sessions/
# ---------------------------------------------------------------------------
if [[ -d "$LOCAL_SESSIONS" ]]; then
  echo ""
  echo "==> Syncing sessions/ tree..."
  rsync "${RSYNC_OPTS[@]}" \
    -e "${RSYNC_SSH}" \
    "${LOCAL_SESSIONS}/" \
    "${SSH_TARGET}:${REMOTE_MAESTRO}/sessions/"
else
  echo "==> Skipping sessions/ (not found locally)"
fi

# ---------------------------------------------------------------------------
# Restart remote service
# ---------------------------------------------------------------------------
echo ""
echo "==> Restarting remote ${SERVICE_NAME} service..."
if ssh_run "systemctl is-enabled --quiet ${SERVICE_NAME} 2>/dev/null"; then
  ssh_run "systemctl start ${SERVICE_NAME}"
  sleep 2
  if ssh_run "systemctl is-active --quiet ${SERVICE_NAME}"; then
    echo "    Service restarted OK."
  else
    echo "    WARNING: service failed to restart — check: journalctl -u ${SERVICE_NAME} -n 30"
  fi
else
  echo "    Service not installed — not restarting."
fi

echo ""
echo "==> Migration complete."
echo "    Remote data : ${SSH_TARGET}:${REMOTE_MAESTRO}/data/"
echo "    Remote sess : ${SSH_TARGET}:${REMOTE_MAESTRO}/sessions/"
echo ""
